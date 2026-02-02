import path from "node:path";
import type { RepoIndex } from "./scan";
import { pickKeyFiles, summarizeTree } from "./index";
import { readFileTruncated, searchInRepo, listTree } from "./tools";
import { spawnSync } from "node:child_process";

export interface RepoContextOptions {
  cwd: string;
  index: RepoIndex;
  task: string;
  maxChars?: number;
}

export interface RepoSummaryOptions {
  cwd: string;
  index: RepoIndex;
  maxChars?: number;
  maxFileBytes?: number;
  keyFileMaxCount?: number;
  includeFlatList?: boolean;
  includeGitChanges?: boolean;
}

export interface RepoSearchOptions {
  cwd: string;
  index: RepoIndex;
  task: string;
  maxChars?: number;
  keywordLimit?: number;
  searchLimit?: number;
}

function extractKeywords(task: string): string[] {
  const words = task
    .split(/[^a-zA-Z0-9_./-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  return Array.from(new Set(words)).slice(0, 8);
}

class ContextBuilder {
  private parts: string[] = [];
  private len = 0;
  private readonly max: number;

  constructor(maxChars: number) {
    this.max = maxChars;
  }

  add(text: string): boolean {
    const nextLen = this.len + text.length + 1;
    if (nextLen > this.max) return false;
    this.parts.push(text);
    this.len = nextLen;
    return true;
  }

  addBlock(text: string, suffix: string = ""): boolean {
    const remaining = this.max - this.len - 1;
    if (remaining <= 0) return false;
    if (text.length + suffix.length <= remaining) {
      this.add(text + suffix);
      return true;
    }
    const keep = Math.max(0, remaining - suffix.length - 24);
    const truncated = text.slice(0, keep);
    this.add(truncated + "\n...(truncated by context budget)" + suffix);
    return true;
  }

  toString(): string {
    return this.parts.join("\n");
  }
}

function getGitChangedFiles(cwd: string, limit: number): string[] {
  try {
    const res = spawnSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8"
    });
    if (res.status !== 0 || !res.stdout) return [];
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    const files: string[] = [];
    for (const line of lines) {
      const pathPart = line.slice(3).trim();
      if (!pathPart) continue;
      const finalPath = pathPart.includes(" -> ")
        ? pathPart.split(" -> ").pop()!.trim()
        : pathPart;
      if (!files.includes(finalPath)) files.push(finalPath);
      if (files.length >= limit) break;
    }
    return files;
  } catch {
    return [];
  }
}

function normalizeRelPath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

async function discoverNodeEntryFiles(
  cwd: string,
  index: RepoIndex
): Promise<string[]> {
  const fileSet = new Set(index.files.map((f) => normalizeRelPath(f.path)));
  const pkg = index.files.find((f) => f.path.toLowerCase() === "package.json");
  if (!pkg) return [];

  try {
    const { content } = await readFileTruncated(cwd, pkg.path, {
      maxBytes: 64_000
    });
    const json = JSON.parse(content) as Record<string, unknown>;
    const candidates: string[] = [];

    const push = (p: string | undefined): void => {
      if (!p) return;
      const normalized = normalizeRelPath(p);
      if (fileSet.has(normalized)) candidates.push(normalized);
    };

    const collectExportPaths = (value: unknown): void => {
      if (typeof value === "string") {
        push(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const v of value) collectExportPaths(v);
        return;
      }
      if (value && typeof value === "object") {
        for (const v of Object.values(value)) {
          collectExportPaths(v);
        }
      }
    };

    push(json.main as string | undefined);
    push((json as any).module as string | undefined);
    push((json as any).types as string | undefined);
    push((json as any).typings as string | undefined);

    const bin = (json as any).bin;
    if (typeof bin === "string") push(bin);
    if (bin && typeof bin === "object") {
      for (const v of Object.values(bin)) {
        if (typeof v === "string") push(v);
      }
    }

    collectExportPaths((json as any).exports);

    const unique = Array.from(new Set(candidates));
    return unique.slice(0, 6);
  } catch {
    return [];
  }
}

function extractRelativeImports(content: string): string[] {
  const results: string[] = [];
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const spec = match[1];
      if (!spec) continue;
      if (spec.startsWith(".")) results.push(spec);
    }
  }
  return Array.from(new Set(results));
}

function resolveImportPath(
  baseFile: string,
  spec: string,
  fileSet: Set<string>
): string | null {
  const baseDir = path.posix.dirname(baseFile);
  let candidateBase = path.posix.normalize(path.posix.join(baseDir, spec));
  candidateBase = normalizeRelPath(candidateBase);

  const ext = path.posix.extname(candidateBase);
  if (ext) {
    return fileSet.has(candidateBase) ? candidateBase : null;
  }

  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  for (const e of exts) {
    const withExt = `${candidateBase}${e}`;
    if (fileSet.has(withExt)) return withExt;
  }
  for (const e of exts) {
    const withIndex = `${candidateBase}/index${e}`;
    if (fileSet.has(withIndex)) return withIndex;
  }
  return null;
}

async function discoverDependencyFiles(
  cwd: string,
  index: RepoIndex,
  entryFiles: string[],
  limit: number
): Promise<string[]> {
  const fileSet = new Set(index.files.map((f) => normalizeRelPath(f.path)));
  const deps = new Set<string>();

  for (const entry of entryFiles) {
    const file = await tryReadFile(cwd, entry, 20_000);
    if (!file) continue;
    const imports = extractRelativeImports(file.content);
    for (const spec of imports) {
      const resolved = resolveImportPath(entry, spec, fileSet);
      if (resolved) deps.add(resolved);
      if (deps.size >= limit) break;
    }
    if (deps.size >= limit) break;
  }

  return Array.from(deps).slice(0, limit);
}

async function tryReadFile(
  cwd: string,
  rel: string,
  maxBytes: number
): Promise<{ content: string; truncated: boolean } | null> {
  try {
    return await readFileTruncated(cwd, rel, { maxBytes });
  } catch {
    return null;
  }
}

export async function buildRepoSummaryContext(
  opts: RepoSummaryOptions
): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const maxFileBytes = opts.maxFileBytes ?? 8_000;
  const keyFileMaxCount = opts.keyFileMaxCount ?? 10;
  const includeFlatList = opts.includeFlatList ?? true;
  const includeGitChanges = opts.includeGitChanges ?? true;

  const builder = new ContextBuilder(maxChars);

  builder.add("# Repo Summary");
  builder.add(`Root: ${opts.cwd}`);
  builder.add(`ScannedAt: ${opts.index.scannedAt}`);
  builder.add("");

  builder.add("## File Tree (partial)");
  builder.add(await listTree(opts.index, 5, 300));
  builder.add("");

  if (includeFlatList) {
    builder.add("## Flat List (first 200)");
    builder.add(summarizeTree(opts.index, 200));
    builder.add("");
  }

  if (includeGitChanges) {
    const changedFiles = getGitChangedFiles(opts.cwd, 6);
    if (changedFiles.length > 0) {
      builder.add("## Recent Changes (git status)");
      for (const rel of changedFiles) {
        const file = await tryReadFile(opts.cwd, rel, 4000);
        if (!file) continue;
        const title = `### ${rel}${file.truncated ? " (truncated)" : ""}`;
        if (!builder.add(title)) break;
        if (!builder.add("```text")) break;
        if (!builder.addBlock(file.content)) break;
        if (!builder.add("```")) break;
        if (!builder.add("")) break;
      }
    }
  }

  const entryFiles = await discoverNodeEntryFiles(opts.cwd, opts.index);
  if (entryFiles.length > 0) {
    builder.add("## Entry Files (from package.json)");
    for (const rel of entryFiles) {
      const file = await tryReadFile(opts.cwd, rel, maxFileBytes);
      if (!file) continue;
      const title = `### ${rel}${file.truncated ? " (truncated)" : ""}`;
      if (!builder.add(title)) break;
      if (!builder.add("```text")) break;
      if (!builder.addBlock(file.content)) break;
      if (!builder.add("```")) break;
      if (!builder.add("")) break;
    }

    const depFiles = await discoverDependencyFiles(opts.cwd, opts.index, entryFiles, 8);
    if (depFiles.length > 0) {
      builder.add("## Dependency Files (from entry imports)");
      for (const rel of depFiles) {
        const file = await tryReadFile(opts.cwd, rel, 6000);
        if (!file) continue;
        const title = `### ${rel}${file.truncated ? " (truncated)" : ""}`;
        if (!builder.add(title)) break;
        if (!builder.add("```text")) break;
        if (!builder.addBlock(file.content)) break;
        if (!builder.add("```")) break;
        if (!builder.add("")) break;
      }
    }
  }

  const keyFiles = pickKeyFiles(opts.index, keyFileMaxCount);
  if (keyFiles.length > 0) {
    builder.add("## Key Files");
    for (const rel of keyFiles) {
      const { content, truncated } = await readFileTruncated(opts.cwd, rel, {
        maxBytes: maxFileBytes
      });
      const title = `### ${rel}${truncated ? " (truncated)" : ""}`;
      if (!builder.add(title)) break;
      if (!builder.add("```text")) break;
      if (!builder.addBlock(content)) break;
      if (!builder.add("```")) break;
      if (!builder.add("")) break;
    }
  }

  return builder.toString();
}

export async function buildRepoSearchContext(
  opts: RepoSearchOptions
): Promise<string> {
  const maxChars = opts.maxChars ?? 40_000;
  const keywordLimit = opts.keywordLimit ?? 3;
  const searchLimit = opts.searchLimit ?? 60;

  const keywords = extractKeywords(opts.task).slice(0, keywordLimit);
  if (keywords.length === 0) return "";

  const builder = new ContextBuilder(maxChars);
  builder.add("# Search Hits");

  for (const kw of keywords) {
    const hits = await searchInRepo(opts.cwd, kw, searchLimit);
    if (hits.trim().length === 0) continue;
    if (!builder.add(`## rg: ${kw}`)) break;
    if (!builder.add("```text")) break;
    if (!builder.addBlock(hits)) break;
    if (!builder.add("```")) break;
    if (!builder.add("")) break;
  }

  return builder.toString();
}

export async function buildRepoContext(
  opts: RepoContextOptions
): Promise<string> {
  const summary = await buildRepoSummaryContext({
    cwd: opts.cwd,
    index: opts.index,
    maxChars: opts.maxChars ?? 100_000,
    maxFileBytes: 12_000,
    keyFileMaxCount: 12,
    includeFlatList: true,
    includeGitChanges: true
  });

  const search = await buildRepoSearchContext({
    cwd: opts.cwd,
    index: opts.index,
    task: opts.task,
    maxChars: 40_000,
    keywordLimit: 3,
    searchLimit: 60
  });

  if (!search) return summary;
  return [summary, "", search].join("\n");
}
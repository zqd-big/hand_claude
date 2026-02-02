import type { RepoIndex } from "./scan";
import { pickKeyFiles, summarizeTree } from "./index";
import { readFileTruncated, searchInRepo, listTree } from "./tools";

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

export async function buildRepoSummaryContext(
  opts: RepoSummaryOptions
): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const maxFileBytes = opts.maxFileBytes ?? 8_000;
  const keyFileMaxCount = opts.keyFileMaxCount ?? 10;
  const includeFlatList = opts.includeFlatList ?? true;

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
    includeFlatList: true
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
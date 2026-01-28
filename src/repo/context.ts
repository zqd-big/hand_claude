import type { RepoIndex } from "./scan";
import { pickKeyFiles, summarizeTree } from "./index";
import { readFileTruncated, searchInRepo, listTree } from "./tools";

export interface RepoContextOptions {
  cwd: string;
  index: RepoIndex;
  task: string;
}

function extractKeywords(task: string): string[] {
  const words = task
    .split(/[^a-zA-Z0-9_./-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  return Array.from(new Set(words)).slice(0, 6);
}

export async function buildRepoContext(opts: RepoContextOptions): Promise<string> {
  const { cwd, index, task } = opts;
  const parts: string[] = [];

  parts.push("# Repo Summary");
  parts.push(`Root: ${cwd}`);
  parts.push(`ScannedAt: ${index.scannedAt}`);
  parts.push("");
  parts.push("## File Tree (partial)");
  parts.push(await listTree(index, 5, 300));
  parts.push("");
  parts.push("## Flat List (first 200)");
  parts.push(summarizeTree(index, 200));
  parts.push("");

  const keyFiles = pickKeyFiles(index);
  if (keyFiles.length > 0) {
    parts.push("## Key Files");
    for (const rel of keyFiles) {
      const { content, truncated } = await readFileTruncated(cwd, rel, {
        maxBytes: 16_000
      });
      parts.push(`### ${rel}${truncated ? " (truncated)" : ""}`);
      parts.push("```text");
      parts.push(content);
      parts.push("```");
      parts.push("");
      if (parts.join("\n").length > 120_000) break;
    }
  }

  const keywords = extractKeywords(task);
  if (keywords.length > 0) {
    parts.push("## Search Hits");
    for (const kw of keywords.slice(0, 3)) {
      const hits = await searchInRepo(cwd, kw, 60);
      if (hits.trim().length === 0) continue;
      parts.push(`### rg: ${kw}`);
      parts.push("```text");
      parts.push(hits);
      parts.push("```");
      parts.push("");
      if (parts.join("\n").length > 140_000) break;
    }
  }

  return parts.join("\n");
}
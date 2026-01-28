import path from "node:path";
import { indexFile } from "../utils/paths";
import { fileExists, readJsonFile } from "../utils/fs";
import type { RepoIndex } from "./scan";

export async function loadRepoIndex(cwd: string): Promise<RepoIndex | null> {
  const p = indexFile(cwd);
  if (!(await fileExists(p))) return null;
  return readJsonFile<RepoIndex>(p);
}

export function summarizeTree(index: RepoIndex, maxItems: number = 200): string {
  const files = index.files.slice(0, maxItems);
  const lines = files.map((f) => `${f.path} (${f.size}b)`);
  const remaining = index.files.length - files.length;
  if (remaining > 0) {
    lines.push(`... and ${remaining} more files`);
  }
  return lines.join("\n");
}

export function pickKeyFiles(index: RepoIndex): string[] {
  const candidates = [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "README.md",
    "README",
    "src/index.ts"
  ];
  const set = new Set(index.files.map((f) => f.path));
  return candidates.filter((c) => set.has(c));
}

export function resolveWorkspacePath(cwd: string, rel: string): string {
  return path.join(cwd, rel);
}
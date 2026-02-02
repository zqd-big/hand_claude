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

export function pickKeyFiles(index: RepoIndex, maxCount: number = 12): string[] {
  const files = index.files.map((f) => f.path);
  const lowerMap = new Map<string, string>();
  for (const f of files) {
    const key = f.toLowerCase();
    if (!lowerMap.has(key)) lowerMap.set(key, f);
  }

  const exactCandidates = [
    "readme.md",
    "readme",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "jsconfig.json",
    "go.mod",
    "go.sum",
    "cargo.toml",
    "pom.xml",
    "build.gradle",
    "settings.gradle",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "cmakelists.txt",
    "makefile",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml"
  ];

  const results: string[] = [];

  const add = (p: string | undefined): void => {
    if (!p) return;
    if (results.includes(p)) return;
    results.push(p);
  };

  for (const c of exactCandidates) {
    add(lowerMap.get(c));
    if (results.length >= maxCount) return results;
  }

  const entryPatterns = [
    /^src\/index\./i,
    /^src\/main\./i,
    /^src\/app\./i,
    /^src\/cli\./i,
    /^src\/server\./i,
    /^main\./i,
    /^app\./i,
    /^index\./i,
    /^cmd\/[^/]+\/main\./i,
    /^lib\/index\./i
  ];

  for (const f of files) {
    if (entryPatterns.some((re) => re.test(f))) {
      add(f);
      if (results.length >= maxCount) return results;
    }
  }

  // fallback: add small files at repo root
  for (const f of index.files) {
    if (results.length >= maxCount) break;
    if (f.path.includes("/")) continue;
    if (f.size > 64 * 1024) continue;
    add(f.path);
  }

  return results.slice(0, maxCount);
}

export function resolveWorkspacePath(cwd: string, rel: string): string {
  return path.join(cwd, rel);
}
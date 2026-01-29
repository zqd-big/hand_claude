import path from "node:path";
import { hcaiDir } from "../utils/paths";
import { ensureDir, readJsonFile, writeJsonFile, fileExists } from "../utils/fs";

export interface RepoAskHistoryEntry {
  question: string;
  answer: string;
  at: string;
}

export interface RepoAskMemory {
  version: 1;
  entries: RepoAskHistoryEntry[];
}

export function defaultRepoAskMemory(): RepoAskMemory {
  return { version: 1, entries: [] };
}

export function repoAskMemoryPath(cwd: string): string {
  return path.join(hcaiDir(cwd), "repo-ask-memory.json");
}

export async function loadRepoAskMemory(cwd: string): Promise<RepoAskMemory> {
  const p = repoAskMemoryPath(cwd);
  if (!(await fileExists(p))) {
    return defaultRepoAskMemory();
  }
  try {
    const data = await readJsonFile<RepoAskMemory>(p);
    if (data && data.version === 1 && Array.isArray(data.entries)) {
      return data;
    }
    return defaultRepoAskMemory();
  } catch {
    return defaultRepoAskMemory();
  }
}

export async function saveRepoAskMemory(cwd: string, memory: RepoAskMemory): Promise<void> {
  const p = repoAskMemoryPath(cwd);
  await ensureDir(path.dirname(p));
  await writeJsonFile(p, memory);
}
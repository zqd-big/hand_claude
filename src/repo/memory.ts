import path from "node:path";
import { hcaiDir } from "../utils/paths";
import { ensureDir, readJsonFile, writeJsonFile, fileExists } from "../utils/fs";

export interface RepoAskHistoryEntry {
  question: string;
  answer: string;
  at: string;
}

export interface RepoAskMemoryV1 {
  version: 1;
  entries: RepoAskHistoryEntry[];
}

export interface RepoAskMemory {
  version: 2;
  entries: RepoAskHistoryEntry[];
  summary?: string;
  summarizedCount?: number;
}

export interface RepoAskMemoryCompactOptions {
  maxEntries?: number;
  keepLast?: number;
  maxSummaryChars?: number;
  maxTotalChars?: number;
}

export function defaultRepoAskMemory(): RepoAskMemory {
  return { version: 2, entries: [], summary: "", summarizedCount: 0 };
}

export function repoAskMemoryPath(cwd: string): string {
  return path.join(hcaiDir(cwd), "repo-ask-memory.json");
}

function migrateMemory(data: RepoAskMemory | RepoAskMemoryV1 | undefined): RepoAskMemory {
  if (!data) return defaultRepoAskMemory();
  if ((data as RepoAskMemory).version === 2) {
    return {
      version: 2,
      entries: (data as RepoAskMemory).entries ?? [],
      summary: (data as RepoAskMemory).summary ?? "",
      summarizedCount: (data as RepoAskMemory).summarizedCount ?? 0
    };
  }
  if ((data as RepoAskMemoryV1).version === 1) {
    return {
      version: 2,
      entries: (data as RepoAskMemoryV1).entries ?? [],
      summary: "",
      summarizedCount: 0
    };
  }
  return defaultRepoAskMemory();
}

export async function loadRepoAskMemory(cwd: string): Promise<RepoAskMemory> {
  const p = repoAskMemoryPath(cwd);
  if (!(await fileExists(p))) {
    return defaultRepoAskMemory();
  }
  try {
    const data = await readJsonFile<RepoAskMemory | RepoAskMemoryV1>(p);
    return migrateMemory(data);
  } catch {
    return defaultRepoAskMemory();
  }
}

export async function saveRepoAskMemory(
  cwd: string,
  memory: RepoAskMemory
): Promise<void> {
  const p = repoAskMemoryPath(cwd);
  await ensureDir(path.dirname(p));
  await writeJsonFile(p, memory);
}

function estimateEntriesChars(entries: RepoAskHistoryEntry[]): number {
  return entries.reduce((acc, item) => acc + item.question.length + item.answer.length + 8, 0);
}

function summarizeEntries(
  existing: string,
  entries: RepoAskHistoryEntry[],
  maxSummaryChars: number
): string {
  const lines: string[] = [];
  const base = existing?.trim();
  if (base) lines.push(base);

  for (const item of entries) {
    const q = item.question.length > 200 ? `${item.question.slice(0, 200)}...` : item.question;
    const a = item.answer.length > 400 ? `${item.answer.slice(0, 400)}...` : item.answer;
    lines.push(`Q: ${q}`);
    lines.push(`A: ${a}`);
    lines.push("");
  }

  let combined = lines.join("\n").trim();
  if (combined.length > maxSummaryChars) {
    combined = combined.slice(0, maxSummaryChars) + "...";
  }
  return combined;
}

export function compactRepoAskMemory(
  memory: RepoAskMemory,
  opts: RepoAskMemoryCompactOptions = {}
): RepoAskMemory {
  const maxEntries = opts.maxEntries ?? 12;
  const keepLast = opts.keepLast ?? 4;
  const maxSummaryChars = opts.maxSummaryChars ?? 4000;
  const maxTotalChars = opts.maxTotalChars ?? 12_000;

  const totalChars = estimateEntriesChars(memory.entries);
  if (memory.entries.length <= maxEntries && totalChars <= maxTotalChars) {
    return memory;
  }

  const keep = Math.max(1, Math.min(keepLast, memory.entries.length));
  const older = memory.entries.slice(0, Math.max(0, memory.entries.length - keep));
  const recent = memory.entries.slice(-keep);

  const summary = summarizeEntries(memory.summary ?? "", older, maxSummaryChars);
  return {
    version: 2,
    entries: recent,
    summary,
    summarizedCount: (memory.summarizedCount ?? 0) + older.length
  };
}
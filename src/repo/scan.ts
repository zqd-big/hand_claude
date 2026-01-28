import fsp from "node:fs/promises";
import path from "node:path";
import { indexFile } from "../utils/paths";
import { ensureDir, writeJsonFile } from "../utils/fs";
import { buildIgnore } from "./ignore";

export interface RepoFileEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface RepoIndex {
  root: string;
  scannedAt: string;
  files: RepoFileEntry[];
}

async function walkDir(
  root: string,
  dir: string,
  shouldIgnore: (abs: string) => boolean,
  out: RepoFileEntry[]
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (shouldIgnore(abs)) continue;

    if (entry.isDirectory()) {
      await walkDir(root, abs, shouldIgnore, out);
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = await fsp.stat(abs);
    out.push({
      path: path.relative(root, abs).replace(/\\/g, "/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }
}

export async function scanRepo(cwd: string): Promise<RepoIndex> {
  const shouldIgnore = await buildIgnore(cwd);
  const files: RepoFileEntry[] = [];
  await walkDir(cwd, cwd, shouldIgnore, files);

  files.sort((a, b) => a.path.localeCompare(b.path));

  const index: RepoIndex = {
    root: cwd,
    scannedAt: new Date().toISOString(),
    files
  };

  const indexPath = indexFile(cwd);
  await ensureDir(path.dirname(indexPath));
  await writeJsonFile(indexPath, index);

  return index;
}
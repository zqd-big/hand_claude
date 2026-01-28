import fsp from "node:fs/promises";
import path from "node:path";
import { hasCommand } from "../utils/shell";
import { buildIgnore } from "./ignore";
import type { RepoIndex } from "./scan";
import { resolveWorkspacePath } from "./index";

export interface ReadFileOptions {
  maxBytes: number;
}

export async function readFileTruncated(
  cwd: string,
  relPath: string,
  opts: ReadFileOptions
): Promise<{ content: string; truncated: boolean }> {
  const abs = resolveWorkspacePath(cwd, relPath);
  const buf = await fsp.readFile(abs);
  if (buf.length <= opts.maxBytes) {
    return { content: buf.toString("utf8"), truncated: false };
  }
  const slice = buf.subarray(0, opts.maxBytes);
  return { content: slice.toString("utf8"), truncated: true };
}

export async function listTree(
  index: RepoIndex,
  maxDepth: number = 4,
  maxItems: number = 400
): Promise<string> {
  const out: string[] = [];
  for (const file of index.files) {
    const depth = file.path.split("/").length - 1;
    if (depth > maxDepth) continue;
    out.push(file.path);
    if (out.length >= maxItems) break;
  }
  const remaining = index.files.length - out.length;
  if (remaining > 0) out.push(`... and ${remaining} more`);
  return out.join("\n");
}

export async function searchInRepo(
  cwd: string,
  query: string,
  limit: number = 80
): Promise<string> {
  if (hasCommand("rg")) {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync(
      "rg",
      ["-n", "--no-heading", "--hidden", "--glob", "!.git", query, cwd],
      { encoding: "utf8" }
    );
    const stdout = res.stdout ?? "";
    return stdout.split(/\r?\n/).filter(Boolean).slice(0, limit).join("\n");
  }

  // fallback: simple traversal
  const shouldIgnore = await buildIgnore(cwd);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (shouldIgnore(abs)) continue;

      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      try {
        const text = await fsp.readFile(abs, "utf8");
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i]?.includes(query)) {
            const rel = path.relative(cwd, abs).replace(/\\/g, "/");
            results.push(`${rel}:${i + 1}: ${lines[i]}`);
            if (results.length >= limit) return;
          }
        }
      } catch {
        // binary or unreadable
      }

      if (results.length >= limit) return;
    }
  }

  await walk(cwd);
  return results.join("\n");
}

export async function writeFileSafe(
  cwd: string,
  relPath: string,
  content: string
): Promise<void> {
  const abs = resolveWorkspacePath(cwd, relPath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, "utf8");
}
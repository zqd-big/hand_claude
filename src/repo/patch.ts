import fsp from "node:fs/promises";
import path from "node:path";
import { applyPatch, parsePatch } from "diff";
import type { RepoIndex } from "./scan";

export interface PatchValidationResult {
  ok: boolean;
  errors: string[];
  summary: PatchSummary;
}

export interface PatchFileStat {
  file: string;
  added: number;
  removed: number;
}

export interface PatchSummary {
  files: PatchFileStat[];
  totalAdded: number;
  totalRemoved: number;
}

export function formatPatchPreview(
  patchText: string,
  maxLines: number = 120
): string {
  const lines = patchText.split(/\r?\n/);
  const preview = lines.slice(0, maxLines).join("\n");
  if (lines.length > maxLines) {
    return `${preview}\n...(preview truncated)`;
  }
  return preview;
}

export function extractDiffBlock(text: string): string | null {
  const fenced = text.match(/```diff\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const alt = text.match(/```patch\s*([\s\S]*?)```/i);
  if (alt?.[1]) return alt[1].trim();

  // fallback: assume raw diff
  if (text.includes("\n--- ") || text.startsWith("--- ")) {
    return text.trim();
  }
  return null;
}

export function summarizePatch(patchText: string): PatchSummary {
  const parsed = parsePatch(patchText);
  const files: PatchFileStat[] = [];

  for (const file of parsed) {
    let added = 0;
    let removed = 0;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
        if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
      }
    }

    const f = (file.newFileName || file.oldFileName || "")
      .replace(/^a\//, "")
      .replace(/^b\//, "");
    files.push({ file: f, added, removed });
  }

  const totalAdded = files.reduce((acc, f) => acc + f.added, 0);
  const totalRemoved = files.reduce((acc, f) => acc + f.removed, 0);

  return { files, totalAdded, totalRemoved };
}

async function readFileIfExists(abs: string): Promise<string> {
  try {
    return await fsp.readFile(abs, "utf8");
  } catch {
    return "";
  }
}

export async function validatePatchAgainstRepo(
  cwd: string,
  patchText: string,
  _index: RepoIndex
): Promise<PatchValidationResult> {
  const errors: string[] = [];
  const parsed = parsePatch(patchText);

  for (const file of parsed) {
    const rel = (file.oldFileName || file.newFileName || "")
      .replace(/^a\//, "")
      .replace(/^b\//, "");
    if (!rel) {
      errors.push("Patch contains an empty file name.");
      continue;
    }
    const abs = path.join(cwd, rel);
    const current = await readFileIfExists(abs);

    const applied = applyPatch(current, file as any, {
      fuzzFactor: 1
    });

    if (applied === false) {
      errors.push(`Failed to apply patch for file: ${rel}`);
    }
  }

  const summary = summarizePatch(patchText);

  return {
    ok: errors.length === 0,
    errors,
    summary
  };
}

export async function applyPatchToRepo(
  cwd: string,
  patchText: string
): Promise<void> {
  const parsed = parsePatch(patchText);

  for (const file of parsed) {
    const rel = (file.oldFileName || file.newFileName || "")
      .replace(/^a\//, "")
      .replace(/^b\//, "");
    if (!rel) {
      throw new Error("Patch contains an empty file name.");
    }
    const abs = path.join(cwd, rel);
    const current = await readFileIfExists(abs);

    const applied = applyPatch(current, file as any, {
      fuzzFactor: 1
    });

    if (applied === false) {
      throw new Error(`Failed to apply patch for file: ${rel}`);
    }

    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, applied, "utf8");
  }
}

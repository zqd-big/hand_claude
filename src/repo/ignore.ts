import path from "node:path";
import ignore from "ignore";
import { hcaiIgnoreFile } from "../utils/paths";
import { fileExists, readTextFile } from "../utils/fs";

const DEFAULT_IGNORES = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "out/**",
  "**/*.o",
  "**/*.a"
];

export async function buildIgnore(
  cwd: string
): Promise<(p: string) => boolean> {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES);

  const ignoreFile = hcaiIgnoreFile(cwd);
  if (await fileExists(ignoreFile)) {
    const content = await readTextFile(ignoreFile);
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    ig.add(lines);
  }

  return (absPath: string) => {
    const rel = path.relative(cwd, absPath).replace(/\\/g, "/");
    return ig.ignores(rel);
  };
}
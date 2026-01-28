import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { describe, it, expect } from "vitest";
import {
  validatePatchAgainstRepo,
  applyPatchToRepo,
  extractDiffBlock
} from "../src/repo/patch";
import type { RepoIndex } from "../src/repo/scan";

describe("patch apply", () => {
  it("extracts diff block", () => {
    const text =
      "Plan...\n```diff\n--- a/a.txt\n+++ b/a.txt\n@@\n-1\n+2\n```\n";
    const diff = extractDiffBlock(text);
    expect(diff).toContain("--- a/a.txt");
  });

  it("validates and applies patch", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "hcai-"));
    const file = path.join(dir, "a.txt");
    await fsp.writeFile(file, "hello\n", "utf8");

    const index: RepoIndex = {
      root: dir,
      scannedAt: new Date().toISOString(),
      files: [{ path: "a.txt", size: 6, mtimeMs: Date.now() }]
    };

    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      "-hello",
      "+hello world"
    ].join("\n");

    const validation = await validatePatchAgainstRepo(dir, patch, index);
    expect(validation.ok).toBe(true);

    await applyPatchToRepo(dir, patch);
    const updated = await fsp.readFile(file, "utf8");
    expect(updated).toContain("hello world");
  });
});
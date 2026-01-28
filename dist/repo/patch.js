"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDiffBlock = extractDiffBlock;
exports.summarizePatch = summarizePatch;
exports.validatePatchAgainstRepo = validatePatchAgainstRepo;
exports.applyPatchToRepo = applyPatchToRepo;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const diff_1 = require("diff");
function extractDiffBlock(text) {
    const fenced = text.match(/```diff\s*([\s\S]*?)```/i);
    if (fenced?.[1])
        return fenced[1].trim();
    const alt = text.match(/```patch\s*([\s\S]*?)```/i);
    if (alt?.[1])
        return alt[1].trim();
    // fallback: assume raw diff
    if (text.includes("\n--- ") || text.startsWith("--- ")) {
        return text.trim();
    }
    return null;
}
function summarizePatch(patchText) {
    const parsed = (0, diff_1.parsePatch)(patchText);
    const files = [];
    for (const file of parsed) {
        let added = 0;
        let removed = 0;
        for (const hunk of file.hunks) {
            for (const line of hunk.lines) {
                if (line.startsWith("+") && !line.startsWith("+++"))
                    added += 1;
                if (line.startsWith("-") && !line.startsWith("---"))
                    removed += 1;
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
async function readFileIfExists(abs) {
    try {
        return await promises_1.default.readFile(abs, "utf8");
    }
    catch {
        return "";
    }
}
async function validatePatchAgainstRepo(cwd, patchText, _index) {
    const errors = [];
    const parsed = (0, diff_1.parsePatch)(patchText);
    for (const file of parsed) {
        const rel = (file.oldFileName || file.newFileName || "")
            .replace(/^a\//, "")
            .replace(/^b\//, "");
        if (!rel) {
            errors.push("Patch contains an empty file name.");
            continue;
        }
        const abs = node_path_1.default.join(cwd, rel);
        const current = await readFileIfExists(abs);
        const applied = (0, diff_1.applyPatch)(current, file, {
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
async function applyPatchToRepo(cwd, patchText) {
    const parsed = (0, diff_1.parsePatch)(patchText);
    for (const file of parsed) {
        const rel = (file.oldFileName || file.newFileName || "")
            .replace(/^a\//, "")
            .replace(/^b\//, "");
        if (!rel) {
            throw new Error("Patch contains an empty file name.");
        }
        const abs = node_path_1.default.join(cwd, rel);
        const current = await readFileIfExists(abs);
        const applied = (0, diff_1.applyPatch)(current, file, {
            fuzzFactor: 1
        });
        if (applied === false) {
            throw new Error(`Failed to apply patch for file: ${rel}`);
        }
        await promises_1.default.mkdir(node_path_1.default.dirname(abs), { recursive: true });
        await promises_1.default.writeFile(abs, applied, "utf8");
    }
}
//# sourceMappingURL=patch.js.map
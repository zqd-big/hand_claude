"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRepoContext = buildRepoContext;
const index_1 = require("./index");
const tools_1 = require("./tools");
function extractKeywords(task) {
    const words = task
        .split(/[^a-zA-Z0-9_./-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3);
    return Array.from(new Set(words)).slice(0, 6);
}
async function buildRepoContext(opts) {
    const { cwd, index, task } = opts;
    const parts = [];
    parts.push("# Repo Summary");
    parts.push(`Root: ${cwd}`);
    parts.push(`ScannedAt: ${index.scannedAt}`);
    parts.push("");
    parts.push("## File Tree (partial)");
    parts.push(await (0, tools_1.listTree)(index, 5, 300));
    parts.push("");
    parts.push("## Flat List (first 200)");
    parts.push((0, index_1.summarizeTree)(index, 200));
    parts.push("");
    const keyFiles = (0, index_1.pickKeyFiles)(index);
    if (keyFiles.length > 0) {
        parts.push("## Key Files");
        for (const rel of keyFiles) {
            const { content, truncated } = await (0, tools_1.readFileTruncated)(cwd, rel, {
                maxBytes: 16_000
            });
            parts.push(`### ${rel}${truncated ? " (truncated)" : ""}`);
            parts.push("```text");
            parts.push(content);
            parts.push("```");
            parts.push("");
            if (parts.join("\n").length > 120_000)
                break;
        }
    }
    const keywords = extractKeywords(task);
    if (keywords.length > 0) {
        parts.push("## Search Hits");
        for (const kw of keywords.slice(0, 3)) {
            const hits = await (0, tools_1.searchInRepo)(cwd, kw, 60);
            if (hits.trim().length === 0)
                continue;
            parts.push(`### rg: ${kw}`);
            parts.push("```text");
            parts.push(hits);
            parts.push("```");
            parts.push("");
            if (parts.join("\n").length > 140_000)
                break;
        }
    }
    return parts.join("\n");
}
//# sourceMappingURL=context.js.map
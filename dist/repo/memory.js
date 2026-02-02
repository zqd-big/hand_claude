"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRepoAskMemory = defaultRepoAskMemory;
exports.repoAskMemoryPath = repoAskMemoryPath;
exports.loadRepoAskMemory = loadRepoAskMemory;
exports.saveRepoAskMemory = saveRepoAskMemory;
exports.compactRepoAskMemory = compactRepoAskMemory;
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
function defaultRepoAskMemory() {
    return { version: 2, entries: [], summary: "", summarizedCount: 0 };
}
function repoAskMemoryPath(cwd) {
    return node_path_1.default.join((0, paths_1.hcaiDir)(cwd), "repo-ask-memory.json");
}
function migrateMemory(data) {
    if (!data)
        return defaultRepoAskMemory();
    if (data.version === 2) {
        return {
            version: 2,
            entries: data.entries ?? [],
            summary: data.summary ?? "",
            summarizedCount: data.summarizedCount ?? 0
        };
    }
    if (data.version === 1) {
        return {
            version: 2,
            entries: data.entries ?? [],
            summary: "",
            summarizedCount: 0
        };
    }
    return defaultRepoAskMemory();
}
async function loadRepoAskMemory(cwd) {
    const p = repoAskMemoryPath(cwd);
    if (!(await (0, fs_1.fileExists)(p))) {
        return defaultRepoAskMemory();
    }
    try {
        const data = await (0, fs_1.readJsonFile)(p);
        return migrateMemory(data);
    }
    catch {
        return defaultRepoAskMemory();
    }
}
async function saveRepoAskMemory(cwd, memory) {
    const p = repoAskMemoryPath(cwd);
    await (0, fs_1.ensureDir)(node_path_1.default.dirname(p));
    await (0, fs_1.writeJsonFile)(p, memory);
}
function estimateEntriesChars(entries) {
    return entries.reduce((acc, item) => acc + item.question.length + item.answer.length + 8, 0);
}
function summarizeEntries(existing, entries, maxSummaryChars) {
    const lines = [];
    const base = existing?.trim();
    if (base)
        lines.push(base);
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
function compactRepoAskMemory(memory, opts = {}) {
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
//# sourceMappingURL=memory.js.map
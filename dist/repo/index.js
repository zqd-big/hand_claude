"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRepoIndex = loadRepoIndex;
exports.summarizeTree = summarizeTree;
exports.pickKeyFiles = pickKeyFiles;
exports.resolveWorkspacePath = resolveWorkspacePath;
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
async function loadRepoIndex(cwd) {
    const p = (0, paths_1.indexFile)(cwd);
    if (!(await (0, fs_1.fileExists)(p)))
        return null;
    return (0, fs_1.readJsonFile)(p);
}
function summarizeTree(index, maxItems = 200) {
    const files = index.files.slice(0, maxItems);
    const lines = files.map((f) => `${f.path} (${f.size}b)`);
    const remaining = index.files.length - files.length;
    if (remaining > 0) {
        lines.push(`... and ${remaining} more files`);
    }
    return lines.join("\n");
}
function pickKeyFiles(index) {
    const candidates = [
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.json",
        "README.md",
        "README",
        "src/index.ts"
    ];
    const set = new Set(index.files.map((f) => f.path));
    return candidates.filter((c) => set.has(c));
}
function resolveWorkspacePath(cwd, rel) {
    return node_path_1.default.join(cwd, rel);
}
//# sourceMappingURL=index.js.map
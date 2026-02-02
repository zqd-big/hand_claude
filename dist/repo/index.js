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
function pickKeyFiles(index, maxCount = 12) {
    const files = index.files.map((f) => f.path);
    const lowerMap = new Map();
    for (const f of files) {
        const key = f.toLowerCase();
        if (!lowerMap.has(key))
            lowerMap.set(key, f);
    }
    const exactCandidates = [
        "readme.md",
        "readme",
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "tsconfig.json",
        "jsconfig.json",
        "go.mod",
        "go.sum",
        "cargo.toml",
        "pom.xml",
        "build.gradle",
        "settings.gradle",
        "pyproject.toml",
        "requirements.txt",
        "setup.py",
        "setup.cfg",
        "cmakelists.txt",
        "makefile",
        "dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml"
    ];
    const results = [];
    const add = (p) => {
        if (!p)
            return;
        if (results.includes(p))
            return;
        results.push(p);
    };
    for (const c of exactCandidates) {
        add(lowerMap.get(c));
        if (results.length >= maxCount)
            return results;
    }
    const entryPatterns = [
        /^src\/index\./i,
        /^src\/main\./i,
        /^src\/app\./i,
        /^src\/cli\./i,
        /^src\/server\./i,
        /^main\./i,
        /^app\./i,
        /^index\./i,
        /^cmd\/[^/]+\/main\./i,
        /^lib\/index\./i
    ];
    for (const f of files) {
        if (entryPatterns.some((re) => re.test(f))) {
            add(f);
            if (results.length >= maxCount)
                return results;
        }
    }
    // fallback: add small files at repo root
    for (const f of index.files) {
        if (results.length >= maxCount)
            break;
        if (f.path.includes("/"))
            continue;
        if (f.size > 64 * 1024)
            continue;
        add(f.path);
    }
    return results.slice(0, maxCount);
}
function resolveWorkspacePath(cwd, rel) {
    return node_path_1.default.join(cwd, rel);
}
//# sourceMappingURL=index.js.map
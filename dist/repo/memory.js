"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRepoAskMemory = defaultRepoAskMemory;
exports.repoAskMemoryPath = repoAskMemoryPath;
exports.loadRepoAskMemory = loadRepoAskMemory;
exports.saveRepoAskMemory = saveRepoAskMemory;
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
function defaultRepoAskMemory() {
    return { version: 1, entries: [] };
}
function repoAskMemoryPath(cwd) {
    return node_path_1.default.join((0, paths_1.hcaiDir)(cwd), "repo-ask-memory.json");
}
async function loadRepoAskMemory(cwd) {
    const p = repoAskMemoryPath(cwd);
    if (!(await (0, fs_1.fileExists)(p))) {
        return defaultRepoAskMemory();
    }
    try {
        const data = await (0, fs_1.readJsonFile)(p);
        if (data && data.version === 1 && Array.isArray(data.entries)) {
            return data;
        }
        return defaultRepoAskMemory();
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
//# sourceMappingURL=memory.js.map
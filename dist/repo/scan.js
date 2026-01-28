"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanRepo = scanRepo;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
const ignore_1 = require("./ignore");
async function walkDir(root, dir, shouldIgnore, out) {
    const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const abs = node_path_1.default.join(dir, entry.name);
        if (shouldIgnore(abs))
            continue;
        if (entry.isDirectory()) {
            await walkDir(root, abs, shouldIgnore, out);
            continue;
        }
        if (!entry.isFile())
            continue;
        const stat = await promises_1.default.stat(abs);
        out.push({
            path: node_path_1.default.relative(root, abs).replace(/\\/g, "/"),
            size: stat.size,
            mtimeMs: stat.mtimeMs
        });
    }
}
async function scanRepo(cwd) {
    const shouldIgnore = await (0, ignore_1.buildIgnore)(cwd);
    const files = [];
    await walkDir(cwd, cwd, shouldIgnore, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const index = {
        root: cwd,
        scannedAt: new Date().toISOString(),
        files
    };
    const indexPath = (0, paths_1.indexFile)(cwd);
    await (0, fs_1.ensureDir)(node_path_1.default.dirname(indexPath));
    await (0, fs_1.writeJsonFile)(indexPath, index);
    return index;
}
//# sourceMappingURL=scan.js.map
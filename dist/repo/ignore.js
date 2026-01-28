"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIgnore = buildIgnore;
const node_path_1 = __importDefault(require("node:path"));
const ignore_1 = __importDefault(require("ignore"));
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
const DEFAULT_IGNORES = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "out/**",
    "**/*.o",
    "**/*.a"
];
async function buildIgnore(cwd) {
    const ig = (0, ignore_1.default)();
    ig.add(DEFAULT_IGNORES);
    const ignoreFile = (0, paths_1.hcaiIgnoreFile)(cwd);
    if (await (0, fs_1.fileExists)(ignoreFile)) {
        const content = await (0, fs_1.readTextFile)(ignoreFile);
        const lines = content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("#"));
        ig.add(lines);
    }
    return (absPath) => {
        const rel = node_path_1.default.relative(cwd, absPath).replace(/\\/g, "/");
        return ig.ignores(rel);
    };
}
//# sourceMappingURL=ignore.js.map
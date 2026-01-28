"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileExists = fileExists;
exports.ensureDir = ensureDir;
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
exports.readTextFile = readTextFile;
exports.writeTextFile = writeTextFile;
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function fileExists(p) {
    try {
        await promises_1.default.access(p, node_fs_1.default.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function ensureDir(p) {
    await promises_1.default.mkdir(p, { recursive: true });
}
async function readJsonFile(p) {
    const raw = await promises_1.default.readFile(p, "utf8");
    return JSON.parse(raw);
}
async function writeJsonFile(p, value) {
    const dir = node_path_1.default.dirname(p);
    await ensureDir(dir);
    await promises_1.default.writeFile(p, JSON.stringify(value, null, 2), "utf8");
}
async function readTextFile(p) {
    return promises_1.default.readFile(p, "utf8");
}
async function writeTextFile(p, content) {
    const dir = node_path_1.default.dirname(p);
    await ensureDir(dir);
    await promises_1.default.writeFile(p, content, "utf8");
}
//# sourceMappingURL=fs.js.map
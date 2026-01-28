"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandHome = expandHome;
exports.resolveConfigPath = resolveConfigPath;
exports.hcaiDir = hcaiDir;
exports.sessionsDir = sessionsDir;
exports.indexFile = indexFile;
exports.hcaiIgnoreFile = hcaiIgnoreFile;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function expandHome(inputPath) {
    if (!inputPath.startsWith("~")) {
        return inputPath;
    }
    const home = node_os_1.default.homedir();
    return node_path_1.default.join(home, inputPath.slice(1));
}
function resolveConfigPath(explicit) {
    if (explicit) {
        return [expandHome(explicit)];
    }
    return [
        node_path_1.default.resolve(process.cwd(), "hcai.config.json"),
        node_path_1.default.join(node_os_1.default.homedir(), ".hcai", "config.json")
    ];
}
function hcaiDir(cwd = process.cwd()) {
    return node_path_1.default.join(cwd, ".hcai");
}
function sessionsDir(cwd = process.cwd()) {
    return node_path_1.default.join(hcaiDir(cwd), "sessions");
}
function indexFile(cwd = process.cwd()) {
    return node_path_1.default.join(hcaiDir(cwd), "index.json");
}
function hcaiIgnoreFile(cwd = process.cwd()) {
    return node_path_1.default.join(cwd, ".hcaiignore");
}
//# sourceMappingURL=paths.js.map
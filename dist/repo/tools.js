"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readFileTruncated = readFileTruncated;
exports.listTree = listTree;
exports.searchInRepo = searchInRepo;
exports.writeFileSafe = writeFileSafe;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const shell_1 = require("../utils/shell");
const ignore_1 = require("./ignore");
const index_1 = require("./index");
async function readFileTruncated(cwd, relPath, opts) {
    const abs = (0, index_1.resolveWorkspacePath)(cwd, relPath);
    const buf = await promises_1.default.readFile(abs);
    if (buf.length <= opts.maxBytes) {
        return { content: buf.toString("utf8"), truncated: false };
    }
    const slice = buf.subarray(0, opts.maxBytes);
    return { content: slice.toString("utf8"), truncated: true };
}
async function listTree(index, maxDepth = 4, maxItems = 400) {
    const out = [];
    for (const file of index.files) {
        const depth = file.path.split("/").length - 1;
        if (depth > maxDepth)
            continue;
        out.push(file.path);
        if (out.length >= maxItems)
            break;
    }
    const remaining = index.files.length - out.length;
    if (remaining > 0)
        out.push(`... and ${remaining} more`);
    return out.join("\n");
}
async function searchInRepo(cwd, query, limit = 80) {
    if ((0, shell_1.hasCommand)("rg")) {
        const { spawnSync } = await Promise.resolve().then(() => __importStar(require("node:child_process")));
        const res = spawnSync("rg", ["-n", "--no-heading", "--hidden", "--glob", "!.git", query, cwd], { encoding: "utf8" });
        const stdout = res.stdout ?? "";
        return stdout.split(/\r?\n/).filter(Boolean).slice(0, limit).join("\n");
    }
    // fallback: simple traversal
    const shouldIgnore = await (0, ignore_1.buildIgnore)(cwd);
    const results = [];
    async function walk(dir) {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const abs = node_path_1.default.join(dir, entry.name);
            if (shouldIgnore(abs))
                continue;
            if (entry.isDirectory()) {
                await walk(abs);
                continue;
            }
            if (!entry.isFile())
                continue;
            try {
                const text = await promises_1.default.readFile(abs, "utf8");
                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length; i += 1) {
                    if (lines[i]?.includes(query)) {
                        const rel = node_path_1.default.relative(cwd, abs).replace(/\\/g, "/");
                        results.push(`${rel}:${i + 1}: ${lines[i]}`);
                        if (results.length >= limit)
                            return;
                    }
                }
            }
            catch {
                // binary or unreadable
            }
            if (results.length >= limit)
                return;
        }
    }
    await walk(cwd);
    return results.join("\n");
}
async function writeFileSafe(cwd, relPath, content) {
    const abs = (0, index_1.resolveWorkspacePath)(cwd, relPath);
    await promises_1.default.mkdir(node_path_1.default.dirname(abs), { recursive: true });
    await promises_1.default.writeFile(abs, content, "utf8");
}
//# sourceMappingURL=tools.js.map
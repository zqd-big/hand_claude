"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasCommand = hasCommand;
exports.execStreaming = execStreaming;
const node_child_process_1 = require("node:child_process");
function hasCommand(cmd) {
    const res = (0, node_child_process_1.spawnSync)(cmd, ["--version"], { stdio: "ignore" });
    return res.status === 0;
}
function execStreaming(command, args, cwd, onStdout, onStderr) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(command, args, {
            cwd,
            shell: true
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (buf) => {
            const s = String(buf);
            stdout += s;
            onStdout?.(s);
        });
        child.stderr.on("data", (buf) => {
            const s = String(buf);
            stderr += s;
            onStderr?.(s);
        });
        child.on("error", (err) => reject(err));
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}
//# sourceMappingURL=shell.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execScriptBlock = execScriptBlock;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
function hasCommand(cmd) {
    const res = (0, node_child_process_1.spawnSync)(cmd, ["--version"], { stdio: "ignore" });
    return res.status === 0;
}
function buildRunner(shell) {
    if (shell === "powershell") {
        const isWin = process.platform === "win32";
        const psCmd = isWin ? "powershell.exe" : hasCommand("pwsh") ? "pwsh" : "";
        if (!psCmd) {
            throw new Error("PowerShell is not available on this platform.");
        }
        return {
            command: psCmd,
            args: (scriptPath) => [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                scriptPath
            ],
            ext: "ps1",
            normalizeContent: (script) => {
                // Windows PowerShell 5.1 reads UTF-8 reliably when BOM is present.
                const prelude = [
                    "$ErrorActionPreference = 'Stop'",
                    "$ProgressPreference = 'SilentlyContinue'",
                    ""
                ].join("\r\n");
                const suffix = [
                    "",
                    // Ensure external command failures propagate to the process exit code.
                    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
                ].join("\r\n");
                const body = (prelude + script + suffix).replace(/\r?\n/g, "\r\n");
                return `\ufeff${body}`;
            }
        };
    }
    if (shell === "cmd") {
        if (process.platform !== "win32") {
            throw new Error("CMD blocks are only supported on Windows.");
        }
        return {
            command: "cmd.exe",
            args: (scriptPath) => ["/d", "/s", "/c", scriptPath],
            ext: "cmd",
            normalizeContent: (script) => script.replace(/\r?\n/g, "\r\n")
        };
    }
    if (shell === "bash") {
        if (process.platform === "win32") {
            throw new Error("bash blocks are not supported on Windows by default. Please output PowerShell/CMD commands instead.");
        }
        const cmd = hasCommand("bash") ? "bash" : "sh";
        return {
            command: cmd,
            args: (scriptPath) => [scriptPath],
            ext: "sh",
            normalizeContent: (script) => script.replace(/\r?\n/g, "\n")
        };
    }
    const _exhaustive = shell;
    throw new Error(`Unsupported shell: ${_exhaustive}`);
}
async function execScriptBlock(opts) {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const runner = buildRunner(opts.shell);
    const tmpDir = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "hc-code-"));
    const scriptPath = node_path_1.default.join(tmpDir, `hc-script-${Date.now()}.${runner.ext}`);
    const content = runner.normalizeContent(opts.script);
    await promises_1.default.writeFile(scriptPath, content, "utf8");
    const command = runner.command;
    const args = runner.args(scriptPath);
    return await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(command, args, {
            cwd: opts.cwd,
            env: process.env,
            windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            stderr += `\n[hc] command timeout after ${timeoutMs}ms`;
            try {
                child.kill();
            }
            catch {
                // ignore
            }
        }, timeoutMs);
        child.stdout.on("data", (buf) => {
            const s = String(buf);
            stdout += s;
            opts.onStdout?.(s);
        });
        child.stderr.on("data", (buf) => {
            const s = String(buf);
            stderr += s;
            opts.onStderr?.(s);
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on("close", async (code) => {
            clearTimeout(timer);
            try {
                await promises_1.default.rm(tmpDir, { recursive: true, force: true });
            }
            catch {
                // ignore cleanup failures
            }
            resolve({ code, stdout, stderr, command, args, scriptPath });
        });
    });
}
//# sourceMappingURL=execBlock.js.map
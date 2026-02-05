"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentLoop = runAgentLoop;
const commandBlocks_1 = require("./commandBlocks");
const execBlock_1 = require("./execBlock");
function tailLines(text, maxLines) {
    const lines = text.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
function isShellSupported(shell) {
    if (process.platform === "win32") {
        return shell === "powershell" || shell === "cmd";
    }
    // Linux/macOS
    return shell === "bash" || shell === "powershell";
}
function fenceLang(shell) {
    if (shell === "powershell")
        return "powershell";
    if (shell === "cmd")
        return "cmd";
    return "bash";
}
function formatCommandResultMessage(block, res, tailN) {
    const lines = [];
    lines.push("# Command Execution Result");
    lines.push(`Shell: ${block.shell}`);
    lines.push(`ExitCode: ${typeof res.code === "number" ? res.code : -1}`);
    lines.push("");
    lines.push("Command:");
    lines.push("```" + fenceLang(block.shell));
    lines.push(block.content);
    lines.push("```");
    lines.push("");
    if (res.error) {
        lines.push("Error:");
        lines.push("```text");
        lines.push(res.error);
        lines.push("```");
        lines.push("");
    }
    lines.push(`Output (tail ${tailN} lines):`);
    lines.push("```text");
    lines.push(res.tail || "(empty)");
    lines.push("```");
    return lines.join("\n").trim();
}
async function runModelOnce(opts) {
    const req = opts.makeRequest(opts.messages);
    if (req.stream) {
        let acc = "";
        await opts.client.chatStream(req, {
            onToken: (token) => {
                acc += token;
                opts.io.stdout(token);
            },
            onDone: (result) => {
                acc = result.content || acc;
            },
            onError: (err) => {
                const message = err instanceof Error ? err.message : String(err);
                opts.io.stderr(`\n[stream error] ${message}\n`);
            }
        });
        opts.io.stdout("\n");
        return acc;
    }
    const result = await opts.client.chat(req);
    opts.io.info(result.content);
    return result.content;
}
async function runAgentLoop(opts) {
    const maxSteps = Math.max(1, opts.maxSteps);
    let finalContent = "";
    for (let step = 0; step < maxSteps; step += 1) {
        const content = await runModelOnce(opts);
        finalContent = content;
        opts.messages.push({ role: "assistant", content });
        const blocks = (0, commandBlocks_1.extractCommandBlocks)(content);
        if (blocks.length === 0) {
            return { finalContent, steps: step + 1 };
        }
        const supported = blocks.filter((b) => isShellSupported(b.shell));
        const unsupported = blocks.filter((b) => !isShellSupported(b.shell));
        opts.io.info(`[hc] detected ${blocks.length} command block(s): ` +
            blocks.map((b) => `${b.shell}:${b.lines.length}L`).join(", "));
        if (supported.length === 0) {
            // Ask the model to rewrite commands for this platform.
            const shellList = Array.from(new Set(unsupported.map((b) => b.shell))).join(", ");
            const request = process.platform === "win32"
                ? "请改用 PowerShell 或 CMD 命令（用 ```powershell``` / ```cmd``` 代码块包裹）。"
                : "请改用 bash 命令（用 ```bash``` 代码块包裹）。";
            opts.messages.push({
                role: "user",
                content: [
                    "我无法在当前环境执行你给出的命令块。",
                    `UnsupportedShell: ${shellList}`,
                    request
                ].join("\n")
            });
            continue;
        }
        let executed = 0;
        for (let i = 0; i < supported.length; i += 1) {
            const block = supported[i];
            const label = `block #${i + 1}/${supported.length} (${block.shell}, ${block.lines.length} lines)`;
            let ok = opts.yes;
            if (!ok) {
                ok = await opts.confirm(`Execute ${label}?`);
            }
            if (!ok) {
                opts.io.info(`[hc] skipped ${label}`);
                continue;
            }
            opts.io.info(`[hc] running ${label} ...`);
            try {
                const res = await (0, execBlock_1.execScriptBlock)({
                    shell: block.shell,
                    script: block.content,
                    cwd: opts.cwd,
                    timeoutMs: 120_000,
                    onStdout: opts.io.stdout,
                    onStderr: opts.io.stderr
                });
                const combined = [res.stdout, res.stderr].filter(Boolean).join("\n");
                const tail = tailLines(combined, opts.tailLines);
                opts.io.info(`\n[hc] ${label} exit code: ${res.code ?? -1}`);
                opts.messages.push({
                    role: "user",
                    content: formatCommandResultMessage(block, { code: res.code, tail }, opts.tailLines)
                });
                executed += 1;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                opts.io.stderr(`\n[hc] ${label} failed: ${message}\n`);
                opts.messages.push({
                    role: "user",
                    content: formatCommandResultMessage(block, { code: -1, tail: "", error: message }, opts.tailLines)
                });
                executed += 1;
            }
        }
        if (executed === 0) {
            // User skipped everything. Stop here.
            return { finalContent, steps: step + 1 };
        }
    }
    return { finalContent, steps: maxSteps };
}
//# sourceMappingURL=agentLoop.js.map
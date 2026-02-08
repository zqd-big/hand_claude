"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentLoop = runAgentLoop;
const commandBlocks_1 = require("./commandBlocks");
const execBlock_1 = require("./execBlock");
function tailText(text, maxLines) {
    const lines = text.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
const ERROR_PATTERNS = [
    { name: "fatal", re: /\bfatal:\b/i },
    { name: "error", re: /(^|\s)error:\s/i },
    { name: "exception", re: /\bException\b/ },
    { name: "panic", re: /\bpanic:\b/i },
    { name: "errors-occurred", re: /errors occurred/i },
    { name: "cmake-error", re: /\bCMake Error\b/i },
    { name: "traceback", re: /Traceback \(most recent call last\):/ },
    { name: "filenotfound", re: /\bFileNotFoundError\b/ },
    { name: "attributeerror", re: /\bAttributeError\b/ },
    { name: "conflict", re: /\bCONFLICT\b/i },
    { name: "no-such-file", re: /No such file or directory/i },
    { name: "permission-denied", re: /Permission denied/i },
    { name: "command-not-found", re: /command not found/i },
    { name: "could-not-revert", re: /could not revert/i },
    { name: "revert-failed", re: /\brevert failed\b/i },
    { name: "no-rule-target", re: /No rule to make target/i },
    { name: "undefined-reference", re: /undefined reference to/i },
    { name: "segfault", re: /Segmentation fault/i },
    { name: "make-error", re: /^make: \*\*\*/i }
];
function detectErrorSignals(text, maxMatches = 24) {
    const signals = new Set();
    const linesOut = [];
    const seenLines = new Set();
    const lines = text.split(/\r?\n/);
    // Avoid scanning extremely large outputs.
    const start = Math.max(0, lines.length - 20_000);
    for (let i = start; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (!line)
            continue;
        for (const p of ERROR_PATTERNS) {
            if (!p.re.test(line))
                continue;
            signals.add(p.name);
            const normalized = line.length > 4000 ? `${line.slice(0, 4000)}...` : line;
            if (!seenLines.has(normalized)) {
                seenLines.add(normalized);
                linesOut.push(normalized);
            }
            break;
        }
        if (linesOut.length >= maxMatches)
            break;
    }
    return { signals: Array.from(signals), lines: linesOut };
}
function analyzeExecResult(code, combined) {
    const reasons = [];
    if (code === null) {
        reasons.push("process terminated");
    }
    else if (code !== 0) {
        reasons.push(`exit code ${code}`);
    }
    const detected = detectErrorSignals(combined);
    const signals = detected.signals;
    const errorLines = detected.lines;
    if (signals.length > 0) {
        reasons.push(`error signals: ${signals.join(", ")}`);
    }
    if (reasons.length === 0) {
        return { status: "ok", reasons: [], signals: [], errorLines: [] };
    }
    // If exit code is 0 but we see error signals, mark as "suspect" instead of hard failure.
    const status = code === 0 ? "suspect" : "failed";
    return { status, reasons, signals, errorLines };
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
    lines.push(`Status: ${res.status.toUpperCase()}`);
    if (res.reasons.length > 0) {
        lines.push(`Reasons: ${res.reasons.join("; ")}`);
    }
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
    if (res.errorLines.length > 0) {
        lines.push("Detected Error Lines:");
        lines.push("```text");
        lines.push(res.errorLines.join("\n"));
        lines.push("```");
        lines.push("");
    }
    lines.push(`Output (tail ${tailN} lines):`);
    lines.push("```text");
    lines.push(res.tail || "(empty)");
    lines.push("```");
    if (res.status !== "ok") {
        lines.push("");
        lines.push([
            "IMPORTANT:",
            "- The output contains errors / abnormal signals. Do NOT ignore them.",
            "- First: explain what failed and why (root cause).",
            "- Then: propose the next minimal fix steps and a new runnable command block.",
            "- If more info is needed: ask for specific commands/files to inspect."
        ].join("\n"));
    }
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
    const content = result.content || "";
    opts.io.info(content);
    return content;
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
            const shellList = Array.from(new Set(unsupported.map((b) => b.shell))).join(", ");
            const request = process.platform === "win32"
                ? [
                    "Please rewrite the commands for Windows.",
                    "Use PowerShell (preferred) or CMD.",
                    "Use fenced code blocks: ```powershell``` / ```cmd```.",
                    "Do not output bash blocks."
                ].join("\n")
                : [
                    "Please rewrite the commands for Linux/macOS.",
                    "Use bash and output a fenced code block: ```bash```."
                ].join("\n");
            opts.messages.push({
                role: "user",
                content: [
                    "I cannot run the command blocks you provided in my current environment.",
                    `UnsupportedShell: ${shellList || "(unknown)"}`,
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
                const tail = tailText(combined, opts.tailLines);
                const analysis = analyzeExecResult(res.code, combined);
                opts.io.info(`\n[hc] ${label} exit code: ${res.code ?? -1}`);
                if (analysis.status !== "ok") {
                    opts.io.stderr(`[hc] ${label} looks ${analysis.status}: ${analysis.reasons.join("; ")}\n`);
                    if (analysis.errorLines.length > 0) {
                        const preview = analysis.errorLines.slice(0, 8).join("\n");
                        opts.io.stderr(`[hc] error lines (preview):\n${preview}\n`);
                    }
                }
                opts.messages.push({
                    role: "user",
                    content: formatCommandResultMessage(block, {
                        code: res.code,
                        tail,
                        status: analysis.status,
                        reasons: analysis.reasons,
                        signals: analysis.signals,
                        errorLines: analysis.errorLines
                    }, opts.tailLines)
                });
                executed += 1;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                opts.io.stderr(`\n[hc] ${label} failed: ${message}\n`);
                opts.messages.push({
                    role: "user",
                    content: formatCommandResultMessage(block, {
                        code: -1,
                        tail: "",
                        error: message,
                        status: "failed",
                        reasons: ["exception while running command"],
                        signals: [],
                        errorLines: []
                    }, opts.tailLines)
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
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRepoCommand = registerRepoCommand;
const node_readline_1 = __importDefault(require("node:readline"));
const common_1 = require("./common");
const scan_1 = require("../repo/scan");
const repo_1 = require("../repo");
const context_1 = require("../repo/context");
const memory_1 = require("../repo/memory");
const router_1 = require("../router/router");
const openaiCompatClient_1 = require("../provider/openaiCompatClient");
const system_1 = require("../prompts/system");
const platformHint_1 = require("../prompts/platformHint");
const patch_1 = require("../repo/patch");
const tools_1 = require("../repo/tools");
const repoChatRepl_1 = require("../tui/repoChatRepl");
const agentLoop_1 = require("../agent/agentLoop");
function askConfirm(question) {
    const rl = node_readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(`${question} (y/N): `, (answer) => {
            rl.close();
            resolve(["y", "yes"].includes(answer.trim().toLowerCase()));
        });
    });
}
function truncateText(text, maxLen) {
    if (text.length <= maxLen)
        return text;
    return `${text.slice(0, maxLen)}...`;
}
function buildHistoryText(memory, limit) {
    const lines = [];
    const summary = memory.summary?.trim();
    if (summary) {
        lines.push("# Summary");
        lines.push(summary);
        lines.push("");
    }
    const entries = memory.entries ?? [];
    if (entries.length === 0)
        return lines.join("\n").trim();
    const start = Math.max(0, entries.length - limit);
    const slice = entries.slice(start);
    lines.push("# Recent Q/A");
    for (const item of slice) {
        lines.push(`Q: ${item.question}`);
        lines.push(`A: ${item.answer}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
function estimateEntriesChars(entries) {
    return entries.reduce((acc, item) => acc + item.question.length + item.answer.length + 8, 0);
}
function shouldSummarizeMemory(memory) {
    const totalChars = estimateEntriesChars(memory.entries ?? []) + (memory.summary?.length ?? 0);
    return memory.entries.length > 12 || totalChars > 12_000;
}
function formatEntriesForSummary(entries) {
    const lines = [];
    for (const item of entries) {
        const q = item.question.length > 200
            ? `${item.question.slice(0, 200)}...`
            : item.question;
        const a = item.answer.length > 400
            ? `${item.answer.slice(0, 400)}...`
            : item.answer;
        lines.push(`Q: ${q}`);
        lines.push(`A: ${a}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
async function summarizeMemoryWithModel(client, route, memory, olderEntries) {
    if (olderEntries.length === 0) {
        return memory.summary ?? "";
    }
    const prompt = [
        "你是一个精简摘要助手，请将对话历史总结成简洁要点。",
        "要求：",
        "1) 保留关键事实、结论、未解决问题。",
        "2) 输出中文，使用条目符号。",
        "3) 不要超过 12 条。",
        "",
        "已有摘要：",
        memory.summary?.trim() ? memory.summary : "(无)",
        "",
        "新增历史：",
        formatEntriesForSummary(olderEntries),
        "",
        "请输出更新后的摘要："
    ].join("\n");
    const messages = [
        { role: "system", content: "你是一个精简、准确的摘要助手。" },
        { role: "user", content: prompt }
    ];
    const baseReq = {
        model: route.modelName,
        messages,
        stream: false,
        max_tokens: 800,
        temperature: 0.2
    };
    const req = (0, router_1.applyProviderTransformers)(route.provider, baseReq);
    const result = await client.chat(req);
    const content = result.content?.trim();
    return content && content.length > 0 ? content : null;
}
function registerRepoCommand(program) {
    const repo = program
        .command("repo")
        .description("Repository-aware operations");
    (0, common_1.addGlobalOptions)(repo
        .command("scan")
        .description("Scan current workspace and build index")).action(async (opts) => {
        const { logger } = await (0, common_1.loadConfigAndLogger)(opts);
        const index = await (0, scan_1.scanRepo)(process.cwd());
        logger.info(`indexed files: ${index.files.length}`);
        // eslint-disable-next-line no-console
        console.log(`Scanned ${index.files.length} files.`);
    });
    (0, common_1.addGlobalOptions)(repo
        .command("chat")
        .description("Interactive repo chat (with repo context)")
        .option("--model <provider,model>", "Override default provider,model")
        .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
        .option("--no-stream", "Disable streaming responses")
        .option("--no-agent", "Disable command block auto execution")
        .option("--yes", "Skip confirmation for executing command blocks")
        .option("--agent-steps <n>", "Max agent steps (default 3)", (v) => Number(v), 3)
        .option("--tail <n>", "Tail lines captured for model context (default 2000)", (v) => Number(v), 2000)).action(async (opts) => {
        const { loaded, logger } = await (0, common_1.loadConfigAndLogger)(opts);
        const index = await (0, repo_1.loadRepoIndex)(process.cwd());
        if (!index) {
            throw new Error("Repo index not found. Run: hc repo scan");
        }
        await (0, repoChatRepl_1.runRepoChatRepl)({
            config: loaded.config,
            index,
            logger,
            maxTokensOverride: opts.maxTokens,
            stream: Boolean(opts.stream),
            modelOverride: opts.model,
            cwd: process.cwd(),
            agentEnabled: Boolean(opts.agent),
            yes: Boolean(opts.yes),
            agentSteps: Number(opts.agentSteps ?? 3),
            tailLines: Number(opts.tail ?? 2000)
        });
    });
    (0, common_1.addGlobalOptions)(repo
        .command("ask")
        .description("Ask a question with repo context")
        .argument("<task>", "Task/question")
        .option("--model <provider,model>", "Override default provider,model")
        .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
        .option("--no-stream", "Disable streaming responses")
        .option("--no-memory", "Disable repo ask memory")
        .option("--reset-memory", "Clear saved repo ask memory before asking")
        .option("--no-model-summary", "Disable model-based memory summary")
        .option("--no-hint", "Disable hint after answer")
        .option("--no-agent", "Disable command block auto execution")
        .option("--yes", "Skip confirmation for executing command blocks")
        .option("--agent-steps <n>", "Max agent steps (default 3)", (v) => Number(v), 3)
        .option("--tail <n>", "Tail lines captured for model context (default 2000)", (v) => Number(v), 2000)
        .option("--history <n>", "Number of Q/A pairs to include (default 5)", (v) => Number(v), 5)).action(async (task, opts) => {
        const { loaded, logger } = await (0, common_1.loadConfigAndLogger)(opts);
        const index = await (0, repo_1.loadRepoIndex)(process.cwd());
        if (!index) {
            throw new Error("Repo index not found. Run: hc repo scan");
        }
        const route = (0, router_1.resolveRoute)(loaded.config, opts.model);
        const repoContext = await (0, context_1.buildRepoContext)({
            cwd: process.cwd(),
            index,
            task
        });
        const memoryEnabled = Boolean(opts.memory);
        const memory = memoryEnabled
            ? await (0, memory_1.loadRepoAskMemory)(process.cwd())
            : { version: 2, entries: [], summary: "", summarizedCount: 0 };
        if (opts.resetMemory && memoryEnabled) {
            memory.entries = [];
            memory.summary = "";
            memory.summarizedCount = 0;
            await (0, memory_1.saveRepoAskMemory)(process.cwd(), memory);
        }
        const historyText = buildHistoryText(memory, opts.history);
        const systemPrompt = [system_1.DEFAULT_SYSTEM_PROMPT, "", (0, platformHint_1.getPlatformHint)()].join("\n");
        const messages = [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: [
                    "你现在在一个代码仓库中工作。",
                    "先阅读下面的仓库上下文，再回答任务。",
                    "",
                    historyText ? "# History" : "",
                    historyText ? historyText : "",
                    historyText ? "" : "",
                    repoContext,
                    "",
                    "# Task",
                    task
                ].join("\n")
            }
        ];
        const baseReq = {
            model: route.modelName,
            messages,
            stream: Boolean(opts.stream),
            max_tokens: opts.maxTokens
        };
        const req = (0, router_1.applyProviderTransformers)(route.provider, baseReq);
        const client = new openaiCompatClient_1.OpenAICompatClient({
            apiBaseUrl: route.provider.api_base_url,
            apiKey: route.provider.api_key,
            timeoutMs: 90_000,
            logger
        });
        let output = "";
        const agentEnabled = Boolean(opts.agent);
        if (agentEnabled) {
            const yes = Boolean(opts.yes);
            const tailN = Number(opts.tail ?? 2000);
            const maxSteps = Number(opts.agentSteps ?? 3);
            const { finalContent } = await (0, agentLoop_1.runAgentLoop)({
                client,
                messages,
                makeRequest: (msgs) => (0, router_1.applyProviderTransformers)(route.provider, {
                    model: route.modelName,
                    messages: msgs,
                    stream: Boolean(opts.stream),
                    max_tokens: opts.maxTokens
                }),
                cwd: process.cwd(),
                logger,
                io: {
                    stdout: (s) => process.stdout.write(s),
                    stderr: (s) => process.stderr.write(s),
                    info: (line) => console.log(line)
                },
                maxSteps,
                tailLines: tailN,
                yes,
                confirm: (q) => (yes ? Promise.resolve(true) : askConfirm(q))
            });
            output = finalContent;
        }
        else if (opts.stream) {
            await client.chatStream(req, {
                onToken: (token) => {
                    output += token;
                    process.stdout.write(token);
                },
                onDone: () => { },
                onError: (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    // eslint-disable-next-line no-console
                    console.error(`\n[stream error] ${message}`);
                }
            });
            process.stdout.write("\n");
        }
        else {
            const result = await client.chat(req);
            output = result.content;
            // eslint-disable-next-line no-console
            console.log(result.content);
        }
        if (opts.hint) {
            // eslint-disable-next-line no-console
            console.log("Tip: use `hc repo chat` and `/open <path>` to load files.");
        }
        if (memoryEnabled && output.trim().length > 0) {
            memory.entries.push({
                question: truncateText(task, 800),
                answer: truncateText(output, 4000),
                at: new Date().toISOString()
            });
            if (opts.modelSummary && shouldSummarizeMemory(memory)) {
                const keepLast = 4;
                const older = memory.entries.slice(0, Math.max(0, memory.entries.length - keepLast));
                const recent = memory.entries.slice(-keepLast);
                try {
                    const summary = await summarizeMemoryWithModel(client, route, memory, older);
                    if (summary) {
                        memory.summary = summary;
                        memory.entries = recent;
                        memory.summarizedCount = (memory.summarizedCount ?? 0) + older.length;
                    }
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    logger.verbose(`memory summary failed: ${message}`);
                }
            }
            const compacted = (0, memory_1.compactRepoAskMemory)(memory, {
                maxEntries: 12,
                keepLast: 4,
                maxSummaryChars: 4000,
                maxTotalChars: 12_000
            });
            await (0, memory_1.saveRepoAskMemory)(process.cwd(), compacted);
        }
    });
    (0, common_1.addGlobalOptions)(repo
        .command("edit")
        .description("Ask model to generate patch and apply it safely")
        .argument("<task>", "Edit task")
        .option("--model <provider,model>", "Override default provider,model")
        .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
        .option("--yes", "Skip confirmation")
        .option("--no-stream", "Disable streaming responses")
        .option("--no-preview", "Disable patch preview")
        .option("--patch-retries <n>", "Retry to regenerate patch if validation fails (default 2)", (v) => Number(v), 2)
        .option("--preview-lines <n>", "Max preview lines (default 120)", (v) => Number(v), 120)).action(async (task, opts) => {
        const { loaded, logger } = await (0, common_1.loadConfigAndLogger)(opts);
        const index = await (0, repo_1.loadRepoIndex)(process.cwd());
        if (!index) {
            throw new Error("Repo index not found. Run: hc repo scan");
        }
        const route = (0, router_1.resolveRoute)(loaded.config, opts.model);
        const repoContext = await (0, context_1.buildRepoContext)({
            cwd: process.cwd(),
            index,
            task
        });
        const userPrompt = [
            "你将对代码仓库做修改。",
            "严格要求：必须输出 unified diff patch，并放在 ```diff 代码块中。",
            "不要直接贴整文件。",
            "",
            repoContext,
            "",
            "# Task",
            task
        ].join("\n");
        const systemPrompt = [system_1.DEFAULT_SYSTEM_PROMPT, "", (0, platformHint_1.getPlatformHint)()].join("\n");
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        const client = new openaiCompatClient_1.OpenAICompatClient({
            apiBaseUrl: route.provider.api_base_url,
            apiKey: route.provider.api_key,
            timeoutMs: 120_000,
            logger
        });
        const maxRetries = Math.max(0, Number(opts.patchRetries ?? 2));
        const maxAttempts = maxRetries + 1;
        const buildPatchRepairContext = async (cwd, errors, patchText) => {
            const files = new Set();
            for (const e of errors) {
                const m = e.match(/file:\s*(.+)\s*$/i);
                if (m?.[1])
                    files.add(m[1].trim());
            }
            const parts = [];
            if (files.size > 0) {
                parts.push("# Current File Content (for patch regeneration)");
                for (const rel of Array.from(files)) {
                    try {
                        const file = await (0, tools_1.readFileTruncated)(cwd, rel, { maxBytes: 12_000 });
                        parts.push(`## ${rel}${file.truncated ? " (truncated)" : ""}`);
                        parts.push("```text");
                        parts.push(file.content);
                        parts.push("```");
                        parts.push("");
                    }
                    catch {
                        parts.push(`## ${rel}`);
                        parts.push("(failed to read file)");
                        parts.push("");
                    }
                }
            }
            parts.push("# Previous Patch Preview (may not apply)");
            parts.push("```diff");
            parts.push((0, patch_1.formatPatchPreview)(patchText, 200));
            parts.push("```");
            return parts.join("\n").trim();
        };
        let attempt = 0;
        let output = "";
        let diffText = null;
        let validation = null;
        while (attempt < maxAttempts) {
            attempt += 1;
            output = "";
            const req = (0, router_1.applyProviderTransformers)(route.provider, {
                model: route.modelName,
                messages,
                stream: Boolean(opts.stream),
                max_tokens: opts.maxTokens
            });
            if (opts.stream) {
                await client.chatStream(req, {
                    onToken: (token) => {
                        output += token;
                        process.stdout.write(token);
                    },
                    onDone: () => { },
                    onError: (err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        // eslint-disable-next-line no-console
                        console.error(`\n[stream error] ${message}`);
                    }
                });
                process.stdout.write("\n");
            }
            else {
                const result = await client.chat(req);
                output = result.content;
                // eslint-disable-next-line no-console
                console.log(output);
            }
            diffText = (0, patch_1.extractDiffBlock)(output);
            if (!diffText) {
                if (attempt >= maxAttempts) {
                    throw new Error("Model output does not contain a ```diff``` patch block.");
                }
                messages.push({ role: "assistant", content: output });
                messages.push({
                    role: "user",
                    content: [
                        "你的输出里没有包含可应用的 ```diff``` patch。",
                        "请只输出一个 unified diff patch，并放在 ```diff 代码块中。",
                        "不要输出其它解释文本。"
                    ].join("\n")
                });
                // eslint-disable-next-line no-console
                console.error(`[hc] missing diff block. Retrying patch generation (${attempt}/${maxAttempts})...`);
                continue;
            }
            validation = await (0, patch_1.validatePatchAgainstRepo)(process.cwd(), diffText, index);
            if (validation.ok)
                break;
            if (attempt >= maxAttempts) {
                const details = validation.errors.join("\n");
                throw new Error(`Patch validation failed:\n${details}`);
            }
            const details = validation.errors.join("\n");
            const repairContext = await buildPatchRepairContext(process.cwd(), validation.errors, diffText);
            messages.push({ role: "assistant", content: output });
            messages.push({
                role: "user",
                content: [
                    "你的 patch 无法应用到当前仓库，请修复后重新输出可应用的 unified diff patch。",
                    "",
                    "Validation Errors:",
                    details,
                    "",
                    repairContext,
                    "",
                    "请重新输出：只输出一个 ```diff``` 代码块，确保能应用到当前文件内容。"
                ].join("\n")
            });
            // eslint-disable-next-line no-console
            console.error(`[hc] patch validation failed. Retrying patch generation (${attempt}/${maxAttempts})...`);
        }
        if (!diffText || !validation || !validation.ok) {
            throw new Error("Failed to obtain a valid patch after retries.");
        }
        // eslint-disable-next-line no-console
        console.log("\nPatch summary:");
        for (const f of validation.summary.files) {
            // eslint-disable-next-line no-console
            console.log(`- ${f.file}: +${f.added} -${f.removed}`);
        }
        // eslint-disable-next-line no-console
        console.log(`Total: +${validation.summary.totalAdded} -${validation.summary.totalRemoved}`);
        if (opts.preview) {
            const preview = (0, patch_1.formatPatchPreview)(diffText, opts.previewLines);
            // eslint-disable-next-line no-console
            console.log("\nPatch preview:");
            // eslint-disable-next-line no-console
            console.log(preview);
        }
        let confirmed = Boolean(opts.yes);
        if (!confirmed) {
            confirmed = await askConfirm("Apply this patch?");
        }
        if (!confirmed) {
            // eslint-disable-next-line no-console
            console.log("Aborted. Patch not applied.");
            return;
        }
        try {
            await (0, patch_1.applyPatchToRepo)(process.cwd(), diffText);
            // eslint-disable-next-line no-console
            console.log("Patch applied successfully.");
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to apply patch: ${message}`);
        }
    });
}
//# sourceMappingURL=repo.js.map
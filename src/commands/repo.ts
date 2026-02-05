import type { Command } from "commander";
import readline from "node:readline";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { scanRepo } from "../repo/scan";
import { loadRepoIndex } from "../repo";
import { buildRepoContext } from "../repo/context";
import {
  loadRepoAskMemory,
  saveRepoAskMemory,
  compactRepoAskMemory,
  type RepoAskMemory,
  type RepoAskHistoryEntry
} from "../repo/memory";
import {
  resolveRoute,
  applyProviderTransformers,
  type ResolvedRoute
} from "../router/router";
import { OpenAICompatClient } from "../provider/openaiCompatClient";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system";
import { getPlatformHint } from "../prompts/platformHint";
import {
  extractDiffBlock,
  validatePatchAgainstRepo,
  applyPatchToRepo,
  formatPatchPreview
} from "../repo/patch";
import type { ChatMessage } from "../types";
import { runRepoChatRepl } from "../tui/repoChatRepl";
import { runAgentLoop } from "../agent/agentLoop";

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
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

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function buildHistoryText(memory: RepoAskMemory, limit: number): string {
  const lines: string[] = [];
  const summary = memory.summary?.trim();
  if (summary) {
    lines.push("# Summary");
    lines.push(summary);
    lines.push("");
  }

  const entries = memory.entries ?? [];
  if (entries.length === 0) return lines.join("\n").trim();

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

function estimateEntriesChars(entries: RepoAskHistoryEntry[]): number {
  return entries.reduce(
    (acc, item) => acc + item.question.length + item.answer.length + 8,
    0
  );
}

function shouldSummarizeMemory(memory: RepoAskMemory): boolean {
  const totalChars =
    estimateEntriesChars(memory.entries ?? []) + (memory.summary?.length ?? 0);
  return memory.entries.length > 12 || totalChars > 12_000;
}

function formatEntriesForSummary(entries: RepoAskHistoryEntry[]): string {
  const lines: string[] = [];
  for (const item of entries) {
    const q =
      item.question.length > 200
        ? `${item.question.slice(0, 200)}...`
        : item.question;
    const a =
      item.answer.length > 400
        ? `${item.answer.slice(0, 400)}...`
        : item.answer;
    lines.push(`Q: ${q}`);
    lines.push(`A: ${a}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function summarizeMemoryWithModel(
  client: OpenAICompatClient,
  route: ResolvedRoute,
  memory: RepoAskMemory,
  olderEntries: RepoAskHistoryEntry[]
): Promise<string | null> {
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

  const messages: ChatMessage[] = [
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

  const req = applyProviderTransformers(route.provider, baseReq);
  const result = await client.chat(req as any);
  const content = result.content?.trim();
  return content && content.length > 0 ? content : null;
}

export function registerRepoCommand(program: Command): void {
  const repo = program
    .command("repo")
    .description("Repository-aware operations");

  addGlobalOptions(
    repo
      .command("scan")
      .description("Scan current workspace and build index")
  ).action(async (opts) => {
    const { logger } = await loadConfigAndLogger(opts);
    const index = await scanRepo(process.cwd());
    logger.info(`indexed files: ${index.files.length}`);
    // eslint-disable-next-line no-console
    console.log(`Scanned ${index.files.length} files.`);
  });

  addGlobalOptions(
    repo
      .command("chat")
      .description("Interactive repo chat (with repo context)")
      .option("--model <provider,model>", "Override default provider,model")
      .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
      .option("--no-stream", "Disable streaming responses")
      .option("--no-agent", "Disable command block auto execution")
      .option("--yes", "Skip confirmation for executing command blocks")
      .option(
        "--agent-steps <n>",
        "Max agent steps (default 3)",
        (v) => Number(v),
        3
      )
      .option(
        "--tail <n>",
        "Tail lines captured for model context (default 2000)",
        (v) => Number(v),
        2000
      )
  ).action(async (opts) => {
    const { loaded, logger } = await loadConfigAndLogger(opts);
    const index = await loadRepoIndex(process.cwd());
    if (!index) {
      throw new Error("Repo index not found. Run: hc repo scan");
    }

    await runRepoChatRepl({
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

  addGlobalOptions(
    repo
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
      .option(
        "--agent-steps <n>",
        "Max agent steps (default 3)",
        (v) => Number(v),
        3
      )
      .option(
        "--tail <n>",
        "Tail lines captured for model context (default 2000)",
        (v) => Number(v),
        2000
      )
      .option(
        "--history <n>",
        "Number of Q/A pairs to include (default 5)",
        (v) => Number(v),
        5
      )
  ).action(async (task: string, opts) => {
    const { loaded, logger } = await loadConfigAndLogger(opts);
    const index = await loadRepoIndex(process.cwd());
    if (!index) {
      throw new Error("Repo index not found. Run: hc repo scan");
    }

    const route = resolveRoute(loaded.config, opts.model);
    const repoContext = await buildRepoContext({
      cwd: process.cwd(),
      index,
      task
    });

    const memoryEnabled = Boolean(opts.memory);
    const memory = memoryEnabled
      ? await loadRepoAskMemory(process.cwd())
      : { version: 2 as const, entries: [], summary: "", summarizedCount: 0 };

    if (opts.resetMemory && memoryEnabled) {
      memory.entries = [];
      memory.summary = "";
      memory.summarizedCount = 0;
      await saveRepoAskMemory(process.cwd(), memory);
    }

    const historyText = buildHistoryText(memory, opts.history);

    const systemPrompt = [DEFAULT_SYSTEM_PROMPT, "", getPlatformHint()].join(
      "\n"
    );

    const messages: ChatMessage[] = [
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

    const req = applyProviderTransformers(route.provider, baseReq);

    const client = new OpenAICompatClient({
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

      const { finalContent } = await runAgentLoop({
        client,
        messages,
        makeRequest: (msgs) =>
          applyProviderTransformers(route.provider, {
            model: route.modelName,
            messages: msgs,
            stream: Boolean(opts.stream),
            max_tokens: opts.maxTokens
          }) as any,
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
    } else if (opts.stream) {
      await client.chatStream(req as any, {
        onToken: (token) => {
          output += token;
          process.stdout.write(token);
        },
        onDone: () => {},
        onError: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`\n[stream error] ${message}`);
        }
      });
      process.stdout.write("\n");
    } else {
      const result = await client.chat(req as any);
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
          const summary = await summarizeMemoryWithModel(
            client,
            route,
            memory,
            older
          );
          if (summary) {
            memory.summary = summary;
            memory.entries = recent;
            memory.summarizedCount = (memory.summarizedCount ?? 0) + older.length;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.verbose(`memory summary failed: ${message}`);
        }
      }

      const compacted = compactRepoAskMemory(memory, {
        maxEntries: 12,
        keepLast: 4,
        maxSummaryChars: 4000,
        maxTotalChars: 12_000
      });
      await saveRepoAskMemory(process.cwd(), compacted);
    }
  });

  addGlobalOptions(
    repo
      .command("edit")
      .description("Ask model to generate patch and apply it safely")
      .argument("<task>", "Edit task")
      .option("--model <provider,model>", "Override default provider,model")
      .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
      .option("--yes", "Skip confirmation")
      .option("--no-stream", "Disable streaming responses")
      .option("--no-preview", "Disable patch preview")
      .option(
        "--preview-lines <n>",
        "Max preview lines (default 120)",
        (v) => Number(v),
        120
      )
  ).action(async (task: string, opts) => {
    const { loaded, logger } = await loadConfigAndLogger(opts);
    const index = await loadRepoIndex(process.cwd());
    if (!index) {
      throw new Error("Repo index not found. Run: hc repo scan");
    }

    const route = resolveRoute(loaded.config, opts.model);
    const repoContext = await buildRepoContext({
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

    const messages: ChatMessage[] = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    const baseReq = {
      model: route.modelName,
      messages,
      stream: Boolean(opts.stream),
      max_tokens: opts.maxTokens
    };

    const req = applyProviderTransformers(route.provider, baseReq);

    const client = new OpenAICompatClient({
      apiBaseUrl: route.provider.api_base_url,
      apiKey: route.provider.api_key,
      timeoutMs: 120_000,
      logger
    });

    let output = "";

    if (opts.stream) {
      await client.chatStream(req as any, {
        onToken: (token) => {
          output += token;
          process.stdout.write(token);
        },
        onDone: () => {},
        onError: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`\n[stream error] ${message}`);
        }
      });
      process.stdout.write("\n");
    } else {
      const result = await client.chat(req as any);
      output = result.content;
      // eslint-disable-next-line no-console
      console.log(output);
    }

    const diffText = extractDiffBlock(output);
    if (!diffText) {
      throw new Error(
        "Model output does not contain a ```diff``` patch block."
      );
    }

    const validation = await validatePatchAgainstRepo(
      process.cwd(),
      diffText,
      index
    );
    if (!validation.ok) {
      const details = validation.errors.join("\n");
      throw new Error(`Patch validation failed:\n${details}`);
    }

    // eslint-disable-next-line no-console
    console.log("\nPatch summary:");
    for (const f of validation.summary.files) {
      // eslint-disable-next-line no-console
      console.log(`- ${f.file}: +${f.added} -${f.removed}`);
    }
    // eslint-disable-next-line no-console
    console.log(
      `Total: +${validation.summary.totalAdded} -${validation.summary.totalRemoved}`
    );

    if (opts.preview) {
      const preview = formatPatchPreview(diffText, opts.previewLines);
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
      await applyPatchToRepo(process.cwd(), diffText);
      // eslint-disable-next-line no-console
      console.log("Patch applied successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to apply patch: ${message}`);
    }
  });
}

import type { Command } from "commander";
import readline from "node:readline";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { scanRepo } from "../repo/scan";
import { loadRepoIndex } from "../repo";
import { buildRepoContext } from "../repo/context";
import { loadRepoAskMemory, saveRepoAskMemory } from "../repo/memory";
import { resolveRoute, applyProviderTransformers } from "../router/router";
import { OpenAICompatClient } from "../provider/openaiCompatClient";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system";
import {
  extractDiffBlock,
  validatePatchAgainstRepo,
  applyPatchToRepo
} from "../repo/patch";
import type { ChatMessage } from "../types";
import { runRepoChatRepl } from "../tui/repoChatRepl";

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

function buildHistoryText(
  entries: { question: string; answer: string }[],
  limit: number
): string {
  if (!entries || entries.length === 0) return "";
  const start = Math.max(0, entries.length - limit);
  const slice = entries.slice(start);
  const lines: string[] = [];
  for (const item of slice) {
    lines.push(`Q: ${item.question}`);
    lines.push(`A: ${item.answer}`);
    lines.push("");
  }
  return lines.join("\n").trim();
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
      cwd: process.cwd()
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
      : { version: 1 as const, entries: [] };

    if (opts.resetMemory && memoryEnabled) {
      memory.entries = [];
      await saveRepoAskMemory(process.cwd(), memory);
    }

    const historyText = buildHistoryText(memory.entries, opts.history);

    const messages: ChatMessage[] = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
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
      console.log(result.content);
    }

    if (memoryEnabled && output.trim().length > 0) {
      memory.entries.push({
        question: truncateText(task, 800),
        answer: truncateText(output, 4000),
        at: new Date().toISOString()
      });
      if (memory.entries.length > 50) {
        memory.entries = memory.entries.slice(-50);
      }
      await saveRepoAskMemory(process.cwd(), memory);
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

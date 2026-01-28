import type { Command } from "commander";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { runChatRepl } from "../tui/chatRepl";

export function registerChatCommand(program: Command): void {
  const cmd = program.command("chat").description("Interactive chat (REPL)");

  addGlobalOptions(cmd)
    .option("--system <path>", "Path to system prompt file")
    .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
    .option("--no-stream", "Disable streaming responses")
    .option("--model <provider,model>", "Override default provider,model")
    .action(async (opts) => {
      const { loaded, logger } = await loadConfigAndLogger(opts);

      await runChatRepl({
        config: loaded.config,
        logger,
        systemPromptPath: opts.system,
        maxTokensOverride: opts.maxTokens,
        stream: Boolean(opts.stream),
        modelOverride: opts.model,
        cwd: process.cwd()
      });
    });
}
import type { Command } from "commander";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { resolveRoute, applyProviderTransformers } from "../router/router";
import { OpenAICompatClient } from "../provider/openaiCompatClient";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system";
import type { ChatMessage } from "../types";

export function registerAskCommand(program: Command): void {
  const cmd = program.command("ask").description("One-shot question");

  addGlobalOptions(cmd)
    .argument("<prompt>", "User prompt")
    .option("--json", "Output JSON")
    .option("--system <path>", "System prompt file")
    .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
    .option("--no-stream", "Disable streaming responses")
    .option("--model <provider,model>", "Override default provider,model")
    .action(async (prompt: string, opts) => {
      const { loaded, logger } = await loadConfigAndLogger(opts);
      const route = resolveRoute(loaded.config, opts.model);

      let systemPrompt = DEFAULT_SYSTEM_PROMPT;
      if (opts.system) {
        const { readTextFile } = await import("../utils/fs");
        systemPrompt = await readTextFile(opts.system);
      }

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
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
        timeoutMs: 60_000,
        logger
      });

      if (opts.stream) {
        let acc = "";
        await client.chatStream(req as any, {
          onToken: (token) => {
            acc += token;
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

        if (opts.json) {
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                answer: acc,
                usage: undefined,
                model: route.modelName,
                provider: route.providerName
              },
              null,
              2
            )
          );
        }
        return;
      }

      const result = await client.chat(req as any);

      if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify(
            {
              answer: result.content,
              usage: result.usage,
              model: route.modelName,
              provider: route.providerName
            },
            null,
            2
          )
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.log(result.content);
    });
}
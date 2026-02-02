import readline from "node:readline";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system";
import type { ChatMessage } from "../types";
import type { AppConfig } from "../config/schema";
import { resolveRoute, applyProviderTransformers } from "../router/router";
import { OpenAICompatClient } from "../provider/openaiCompatClient";
import type { Logger } from "../utils/logger";
import type { RepoIndex } from "../repo/scan";
import { buildRepoSummaryContext, buildRepoSearchContext } from "../repo/context";

export interface RepoChatReplOptions {
  config: AppConfig;
  index: RepoIndex;
  logger: Logger;
  maxTokensOverride?: number;
  stream: boolean;
  modelOverride?: string;
  cwd: string;
  historyLimit?: number;
}

export async function runRepoChatRepl(opts: RepoChatReplOptions): Promise<void> {
  let currentRouteRef = opts.modelOverride ?? opts.config.Router.default;
  let route = resolveRoute(opts.config, currentRouteRef);

  const summary = await buildRepoSummaryContext({
    cwd: opts.cwd,
    index: opts.index,
    maxChars: 80_000,
    maxFileBytes: 8_000,
    keyFileMaxCount: 10,
    includeFlatList: false
  });

  const systemPrompt = [
    DEFAULT_SYSTEM_PROMPT,
    "",
    "你正在一个代码仓库中工作，请结合仓库上下文回答问题。",
    "",
    summary
  ].join("\n");

  let messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "hc(repo)> "
  });

  const printHelp = (): void => {
    // eslint-disable-next-line no-console
    console.log(
      [
        "/model <provider,model>  切换模型",
        "/new                     新会话",
        "/help                    帮助",
        "/exit                    退出"
      ].join("\n")
    );
  };

  const effectiveMaxTokens = (input?: number): number | undefined => {
    if (typeof opts.maxTokensOverride === "number") return opts.maxTokensOverride;
    return input;
  };

  // eslint-disable-next-line no-console
  console.log(`Using model: ${route.providerName},${route.modelName}`);
  printHelp();
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      if (trimmed === "/exit") {
        rl.close();
        return;
      }
      if (trimmed === "/help") {
        printHelp();
        rl.prompt();
        return;
      }
      if (trimmed === "/new") {
        messages = [{ role: "system", content: systemPrompt }];
        // eslint-disable-next-line no-console
        console.log("New repo chat session started.");
        rl.prompt();
        return;
      }
      if (trimmed.startsWith("/model ")) {
        const ref = trimmed.slice("/model ".length).trim();
        route = resolveRoute(opts.config, ref);
        currentRouteRef = ref;
        // eslint-disable-next-line no-console
        console.log(`Switched to: ${route.providerName},${route.modelName}`);
        rl.prompt();
        return;
      }

      const searchContext = await buildRepoSearchContext({
        cwd: opts.cwd,
        index: opts.index,
        task: trimmed,
        maxChars: 30_000,
        keywordLimit: 3,
        searchLimit: 60
      });

      const userContent = [
        searchContext ? searchContext : "",
        searchContext ? "" : "",
        "# Task",
        trimmed
      ]
        .filter((x) => x !== "")
        .join("\n");

      messages.push({ role: "user", content: userContent });

      const baseReq = {
        model: route.modelName,
        messages,
        stream: opts.stream,
        max_tokens: effectiveMaxTokens(undefined)
      };

      const req = applyProviderTransformers(route.provider, baseReq);

      const client = new OpenAICompatClient({
        apiBaseUrl: route.provider.api_base_url,
        apiKey: route.provider.api_key,
        timeoutMs: 90_000,
        logger: opts.logger
      });

      if (opts.stream) {
        let acc = "";
        await client.chatStream(req as any, {
          onToken: (token) => {
            acc += token;
            process.stdout.write(token);
          },
          onDone: (result) => {
            acc = result.content || acc;
          },
          onError: (err) => {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(`\n[stream error] ${message}`);
          }
        });
        process.stdout.write("\n");
        messages.push({ role: "assistant", content: acc });
      } else {
        const result = await client.chat(req as any);
        // eslint-disable-next-line no-console
        console.log(result.content);
        messages.push({ role: "assistant", content: result.content });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[hc] error: ${message}`);
    }

    rl.prompt();
  });

  await new Promise<void>((resolve) => {
    rl.on("close", () => resolve());
  });
}
import readline from "node:readline";
import path from "node:path";
import { DEFAULT_SYSTEM_PROMPT } from "../prompts/system";
import type { ChatMessage } from "../types";
import type { AppConfig } from "../config/schema";
import { resolveRoute, applyProviderTransformers } from "../router/router";
import { OpenAICompatClient } from "../provider/openaiCompatClient";
import { sessionsDir } from "../utils/paths";
import {
  ensureDir,
  writeJsonFile,
  readJsonFile,
  fileExists,
  readTextFile
} from "../utils/fs";
import type { Logger } from "../utils/logger";

export interface ChatReplOptions {
  config: AppConfig;
  logger: Logger;
  systemPromptPath?: string;
  maxTokensOverride?: number;
  stream: boolean;
  modelOverride?: string;
  cwd: string;
}

interface SavedSession {
  createdAt: string;
  route: string;
  messages: ChatMessage[];
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate()
  )}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function loadSystemPrompt(systemPromptPath?: string): Promise<string> {
  if (!systemPromptPath) return DEFAULT_SYSTEM_PROMPT;
  const exists = await fileExists(systemPromptPath);
  if (!exists) {
    throw new Error(`System prompt file not found: ${systemPromptPath}`);
  }
  return readTextFile(systemPromptPath);
}

export async function runChatRepl(opts: ChatReplOptions): Promise<void> {
  const systemPrompt = await loadSystemPrompt(opts.systemPromptPath);

  let currentRouteRef = opts.modelOverride ?? opts.config.Router.default;
  let route = resolveRoute(opts.config, currentRouteRef);

  let messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "hc> "
  });

  const printHelp = (): void => {
    // eslint-disable-next-line no-console
    console.log(
      [
        "/model <provider,model>  切换模型",
        "/new                     新会话",
        "/save                    保存会话",
        "/load <file>             加载会话",
        "/help                    帮助",
        "/exit                    退出"
      ].join("\n")
    );
  };

  const clientForRoute = (): OpenAICompatClient => {
    return new OpenAICompatClient({
      apiBaseUrl: route.provider.api_base_url,
      apiKey: route.provider.api_key,
      timeoutMs: 60_000,
      logger: opts.logger
    });
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
        console.log("New session started.");
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
      if (trimmed === "/save") {
        const dir = sessionsDir(opts.cwd);
        await ensureDir(dir);
        const stamp = nowStamp();
        const file = path.join(dir, `${stamp}.json`);
        const session: SavedSession = {
          createdAt: new Date().toISOString(),
          route: currentRouteRef,
          messages
        };
        await writeJsonFile(file, session);
        // eslint-disable-next-line no-console
        console.log(`Saved: ${file}`);
        rl.prompt();
        return;
      }
      if (trimmed.startsWith("/load ")) {
        const file = trimmed.slice("/load ".length).trim();
        const session = await readJsonFile<SavedSession>(file);
        messages = session.messages;
        route = resolveRoute(opts.config, session.route);
        currentRouteRef = session.route;
        // eslint-disable-next-line no-console
        console.log(`Loaded: ${file}`);
        rl.prompt();
        return;
      }

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      messages.push(userMsg);

      const baseReq = {
        model: route.modelName,
        messages,
        stream: opts.stream,
        max_tokens: effectiveMaxTokens(undefined)
      };

      const req = applyProviderTransformers(route.provider, baseReq);

      const client = clientForRoute();

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
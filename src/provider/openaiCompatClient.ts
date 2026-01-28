import { createParser } from "eventsource-parser";
import type {
  ChatMessage,
  ChatCompletionResult,
  ChatStreamCallbacks
} from "../types";
import { withRetry } from "../utils/retry";
import type { Logger } from "../utils/logger";

export interface OpenAICompatClientOptions {
  apiBaseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  logger: Logger;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface RetryableHttpError extends Error {
  status?: number;
}

function isRetryableError(err: unknown): boolean {
  const e = err as RetryableHttpError;
  if (typeof e?.status === "number") {
    return e.status >= 500 && e.status < 600;
  }
  // 网络错误、超时等
  return true;
}

function redact(s?: string): string {
  if (!s) return "(empty)";
  return `${s.slice(0, 6)}...`;
}

export class OpenAICompatClient {
  private readonly apiBaseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(opts: OpenAICompatClientOptions) {
    this.apiBaseUrl = opts.apiBaseUrl;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs;
    this.logger = opts.logger;
  }

  async chat(req: ChatRequest): Promise<ChatCompletionResult> {
    return this.requestWithRetry(req, false);
  }

  async chatStream(
    req: ChatRequest,
    callbacks: ChatStreamCallbacks
  ): Promise<void> {
    await this.requestWithRetry(req, true, callbacks);
  }

  private async requestWithRetry(
    req: ChatRequest,
    streamMode: boolean,
    callbacks?: ChatStreamCallbacks
  ): Promise<ChatCompletionResult> {
    const url = this.apiBaseUrl;

    return withRetry<ChatCompletionResult>(
      async (attempt) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          this.logger.info(
            `POST ${url} model=${req.model} stream=${req.stream} attempt=${attempt + 1}`
          );
          this.logger.verbose(
            `auth=Bearer ${redact(this.apiKey)} timeoutMs=${this.timeoutMs}`
          );

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            body: JSON.stringify(req),
            signal: controller.signal
          });

          if (!res.ok) {
            const err = new Error(
              `HTTP ${res.status} ${res.statusText}`
            ) as RetryableHttpError;
            err.status = res.status;
            const bodyText = await safeReadText(res);
            this.logger.warn(
              `HTTP error: ${res.status}. body=${truncate(bodyText, 400)}`
            );
            throw err;
          }

          if (streamMode && req.stream) {
            if (!res.body) {
              throw new Error("Response body is empty for stream.");
            }
            await this.consumeStream(res, callbacks!);
            return { content: "" };
          }

          const json = (await res.json()) as unknown;
          const content = extractFinalContent(json);
          const usage = (json as any)?.usage;
          this.logger.info("response received (non-stream).");
          return { content, usage, raw: json };
        } catch (err) {
          if ((err as any)?.name === "AbortError") {
            const e = new Error(
              `Request timeout after ${this.timeoutMs}ms`
            ) as RetryableHttpError;
            e.status = undefined;
            throw e;
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      },
      isRetryableError,
      { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 }
    );
  }

  private async consumeStream(
    res: Response,
    callbacks: ChatStreamCallbacks
  ): Promise<void> {
    const contentParts: string[] = [];
    let usage: unknown | undefined;

    const parser = createParser({
      onEvent: (event: any) => {
        const data = event.data?.trim();
        if (!data) return;
        if (data === "[DONE]") {
          const finalContent = contentParts.join("");
          callbacks.onDone({ content: finalContent, usage: usage as any });
          return;
        }
        try {
          const json = JSON.parse(data);
          usage = (json as any)?.usage ?? usage;
          const delta = extractDeltaContent(json);
          if (delta) {
            contentParts.push(delta);
            callbacks.onToken(delta);
          }
        } catch {
          // 兼容非 SSE 的分块 JSON 行
          const delta = tryExtractFromLooseChunk(data);
          if (delta) {
            contentParts.push(delta);
            callbacks.onToken(delta);
          }
        }
      }
    });

    try {
      for await (const chunk of streamChunks(res)) {
        const text = chunk.toString("utf8");
        parser.feed(text);

        // 兜底：如果不是 SSE，也尝试逐行 JSON 解析
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("data:")) continue;
          try {
            const json = JSON.parse(line);
            const delta = extractDeltaContent(json);
            if (delta) {
              contentParts.push(delta);
              callbacks.onToken(delta);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      callbacks.onError(err);
      throw err;
    }

    const finalContent = contentParts.join("");
    callbacks.onDone({ content: finalContent, usage: usage as any });
  }
}

async function* streamChunks(res: Response): AsyncGenerator<Buffer> {
  const reader = res.body!.getReader();
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        yield Buffer.from(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractDeltaContent(json: unknown): string {
  const delta = (json as any)?.choices?.[0]?.delta?.content;
  if (typeof delta === "string") return delta;

  const alt = (json as any)?.choices?.[0]?.message?.content;
  if (typeof alt === "string") return alt;

  const text = (json as any)?.choices?.[0]?.text;
  if (typeof text === "string") return text;

  return "";
}

function extractFinalContent(json: unknown): string {
  const message = (json as any)?.choices?.[0]?.message?.content;
  if (typeof message === "string") return message;

  const text = (json as any)?.choices?.[0]?.text;
  if (typeof text === "string") return text;

  return "";
}

function tryExtractFromLooseChunk(data: string): string {
  const m = data.match(/"content"\s*:\s*"([^\"]*)"/);
  if (!m?.[1]) return "";
  return m[1];
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}

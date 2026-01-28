"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAICompatClient = void 0;
const eventsource_parser_1 = require("eventsource-parser");
const retry_1 = require("../utils/retry");
function isRetryableError(err) {
    const e = err;
    if (typeof e?.status === "number") {
        return e.status >= 500 && e.status < 600;
    }
    // 网络错误、超时等
    return true;
}
function redact(s) {
    if (!s)
        return "(empty)";
    return `${s.slice(0, 6)}...`;
}
class OpenAICompatClient {
    apiBaseUrl;
    apiKey;
    timeoutMs;
    logger;
    constructor(opts) {
        this.apiBaseUrl = opts.apiBaseUrl;
        this.apiKey = opts.apiKey;
        this.timeoutMs = opts.timeoutMs;
        this.logger = opts.logger;
    }
    async chat(req) {
        return this.requestWithRetry(req, false);
    }
    async chatStream(req, callbacks) {
        await this.requestWithRetry(req, true, callbacks);
    }
    async requestWithRetry(req, streamMode, callbacks) {
        const url = this.apiBaseUrl;
        return (0, retry_1.withRetry)(async (attempt) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                this.logger.info(`POST ${url} model=${req.model} stream=${req.stream} attempt=${attempt + 1}`);
                this.logger.verbose(`auth=Bearer ${redact(this.apiKey)} timeoutMs=${this.timeoutMs}`);
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
                    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
                    err.status = res.status;
                    const bodyText = await safeReadText(res);
                    this.logger.warn(`HTTP error: ${res.status}. body=${truncate(bodyText, 400)}`);
                    throw err;
                }
                if (streamMode && req.stream) {
                    if (!res.body) {
                        throw new Error("Response body is empty for stream.");
                    }
                    await this.consumeStream(res, callbacks);
                    return { content: "" };
                }
                const json = (await res.json());
                const content = extractFinalContent(json);
                const usage = json?.usage;
                this.logger.info("response received (non-stream).");
                return { content, usage, raw: json };
            }
            catch (err) {
                if (err?.name === "AbortError") {
                    const e = new Error(`Request timeout after ${this.timeoutMs}ms`);
                    e.status = undefined;
                    throw e;
                }
                throw err;
            }
            finally {
                clearTimeout(timeout);
            }
        }, isRetryableError, { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
    }
    async consumeStream(res, callbacks) {
        const contentParts = [];
        let usage;
        const parser = (0, eventsource_parser_1.createParser)({
            onEvent: (event) => {
                const data = event.data?.trim();
                if (!data)
                    return;
                if (data === "[DONE]") {
                    const finalContent = contentParts.join("");
                    callbacks.onDone({ content: finalContent, usage: usage });
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    usage = json?.usage ?? usage;
                    const delta = extractDeltaContent(json);
                    if (delta) {
                        contentParts.push(delta);
                        callbacks.onToken(delta);
                    }
                }
                catch {
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
                    if (line.startsWith("data:"))
                        continue;
                    try {
                        const json = JSON.parse(line);
                        const delta = extractDeltaContent(json);
                        if (delta) {
                            contentParts.push(delta);
                            callbacks.onToken(delta);
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        catch (err) {
            callbacks.onError(err);
            throw err;
        }
        const finalContent = contentParts.join("");
        callbacks.onDone({ content: finalContent, usage: usage });
    }
}
exports.OpenAICompatClient = OpenAICompatClient;
async function* streamChunks(res) {
    const reader = res.body.getReader();
    try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value) {
                yield Buffer.from(value);
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
function extractDeltaContent(json) {
    const delta = json?.choices?.[0]?.delta?.content;
    if (typeof delta === "string")
        return delta;
    const alt = json?.choices?.[0]?.message?.content;
    if (typeof alt === "string")
        return alt;
    const text = json?.choices?.[0]?.text;
    if (typeof text === "string")
        return text;
    return "";
}
function extractFinalContent(json) {
    const message = json?.choices?.[0]?.message?.content;
    if (typeof message === "string")
        return message;
    const text = json?.choices?.[0]?.text;
    if (typeof text === "string")
        return text;
    return "";
}
function tryExtractFromLooseChunk(data) {
    const m = data.match(/"content"\s*:\s*"([^\"]*)"/);
    if (!m?.[1])
        return "";
    return m[1];
}
async function safeReadText(res) {
    try {
        return await res.text();
    }
    catch {
        return "";
    }
}
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max)}...`;
}
//# sourceMappingURL=openaiCompatClient.js.map
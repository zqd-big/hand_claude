"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runChatRepl = runChatRepl;
const node_readline_1 = __importDefault(require("node:readline"));
const node_path_1 = __importDefault(require("node:path"));
const system_1 = require("../prompts/system");
const router_1 = require("../router/router");
const openaiCompatClient_1 = require("../provider/openaiCompatClient");
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
async function loadSystemPrompt(systemPromptPath) {
    if (!systemPromptPath)
        return system_1.DEFAULT_SYSTEM_PROMPT;
    const exists = await (0, fs_1.fileExists)(systemPromptPath);
    if (!exists) {
        throw new Error(`System prompt file not found: ${systemPromptPath}`);
    }
    return (0, fs_1.readTextFile)(systemPromptPath);
}
async function runChatRepl(opts) {
    const systemPrompt = await loadSystemPrompt(opts.systemPromptPath);
    let currentRouteRef = opts.modelOverride ?? opts.config.Router.default;
    let route = (0, router_1.resolveRoute)(opts.config, currentRouteRef);
    let messages = [{ role: "system", content: systemPrompt }];
    const rl = node_readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "hc> "
    });
    const printHelp = () => {
        // eslint-disable-next-line no-console
        console.log([
            "/model <provider,model>  切换模型",
            "/new                     新会话",
            "/save                    保存会话",
            "/load <file>             加载会话",
            "/help                    帮助",
            "/exit                    退出"
        ].join("\n"));
    };
    const clientForRoute = () => {
        return new openaiCompatClient_1.OpenAICompatClient({
            apiBaseUrl: route.provider.api_base_url,
            apiKey: route.provider.api_key,
            timeoutMs: 60_000,
            logger: opts.logger
        });
    };
    const effectiveMaxTokens = (input) => {
        if (typeof opts.maxTokensOverride === "number")
            return opts.maxTokensOverride;
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
                route = (0, router_1.resolveRoute)(opts.config, ref);
                currentRouteRef = ref;
                // eslint-disable-next-line no-console
                console.log(`Switched to: ${route.providerName},${route.modelName}`);
                rl.prompt();
                return;
            }
            if (trimmed === "/save") {
                const dir = (0, paths_1.sessionsDir)(opts.cwd);
                await (0, fs_1.ensureDir)(dir);
                const stamp = nowStamp();
                const file = node_path_1.default.join(dir, `${stamp}.json`);
                const session = {
                    createdAt: new Date().toISOString(),
                    route: currentRouteRef,
                    messages
                };
                await (0, fs_1.writeJsonFile)(file, session);
                // eslint-disable-next-line no-console
                console.log(`Saved: ${file}`);
                rl.prompt();
                return;
            }
            if (trimmed.startsWith("/load ")) {
                const file = trimmed.slice("/load ".length).trim();
                const session = await (0, fs_1.readJsonFile)(file);
                messages = session.messages;
                route = (0, router_1.resolveRoute)(opts.config, session.route);
                currentRouteRef = session.route;
                // eslint-disable-next-line no-console
                console.log(`Loaded: ${file}`);
                rl.prompt();
                return;
            }
            const userMsg = { role: "user", content: trimmed };
            messages.push(userMsg);
            const baseReq = {
                model: route.modelName,
                messages,
                stream: opts.stream,
                max_tokens: effectiveMaxTokens(undefined)
            };
            const req = (0, router_1.applyProviderTransformers)(route.provider, baseReq);
            const client = clientForRoute();
            if (opts.stream) {
                let acc = "";
                await client.chatStream(req, {
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
            }
            else {
                const result = await client.chat(req);
                // eslint-disable-next-line no-console
                console.log(result.content);
                messages.push({ role: "assistant", content: result.content });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(`[hc] error: ${message}`);
        }
        rl.prompt();
    });
    await new Promise((resolve) => {
        rl.on("close", () => resolve());
    });
}
//# sourceMappingURL=chatRepl.js.map
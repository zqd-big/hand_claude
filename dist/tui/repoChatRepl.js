"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRepoChatRepl = runRepoChatRepl;
const node_readline_1 = __importDefault(require("node:readline"));
const system_1 = require("../prompts/system");
const router_1 = require("../router/router");
const openaiCompatClient_1 = require("../provider/openaiCompatClient");
const context_1 = require("../repo/context");
async function runRepoChatRepl(opts) {
    let currentRouteRef = opts.modelOverride ?? opts.config.Router.default;
    let route = (0, router_1.resolveRoute)(opts.config, currentRouteRef);
    const summary = await (0, context_1.buildRepoSummaryContext)({
        cwd: opts.cwd,
        index: opts.index,
        maxChars: 80_000,
        maxFileBytes: 8_000,
        keyFileMaxCount: 10,
        includeFlatList: false
    });
    const systemPrompt = [
        system_1.DEFAULT_SYSTEM_PROMPT,
        "",
        "你正在一个代码仓库中工作，请结合仓库上下文回答问题。",
        "",
        summary
    ].join("\n");
    let messages = [{ role: "system", content: systemPrompt }];
    const rl = node_readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "hc(repo)> "
    });
    const printHelp = () => {
        // eslint-disable-next-line no-console
        console.log([
            "/model <provider,model>  切换模型",
            "/new                     新会话",
            "/help                    帮助",
            "/exit                    退出"
        ].join("\n"));
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
                console.log("New repo chat session started.");
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
            const searchContext = await (0, context_1.buildRepoSearchContext)({
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
            const req = (0, router_1.applyProviderTransformers)(route.provider, baseReq);
            const client = new openaiCompatClient_1.OpenAICompatClient({
                apiBaseUrl: route.provider.api_base_url,
                apiKey: route.provider.api_key,
                timeoutMs: 90_000,
                logger: opts.logger
            });
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
//# sourceMappingURL=repoChatRepl.js.map
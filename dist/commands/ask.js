"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAskCommand = registerAskCommand;
const common_1 = require("./common");
const router_1 = require("../router/router");
const openaiCompatClient_1 = require("../provider/openaiCompatClient");
const system_1 = require("../prompts/system");
function registerAskCommand(program) {
    const cmd = program.command("ask").description("One-shot question");
    (0, common_1.addGlobalOptions)(cmd)
        .argument("<prompt>", "User prompt")
        .option("--json", "Output JSON")
        .option("--system <path>", "System prompt file")
        .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
        .option("--no-stream", "Disable streaming responses")
        .option("--model <provider,model>", "Override default provider,model")
        .action(async (prompt, opts) => {
        const { loaded, logger } = await (0, common_1.loadConfigAndLogger)(opts);
        const route = (0, router_1.resolveRoute)(loaded.config, opts.model);
        let systemPrompt = system_1.DEFAULT_SYSTEM_PROMPT;
        if (opts.system) {
            const { readTextFile } = await Promise.resolve().then(() => __importStar(require("../utils/fs")));
            systemPrompt = await readTextFile(opts.system);
        }
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ];
        const baseReq = {
            model: route.modelName,
            messages,
            stream: Boolean(opts.stream),
            max_tokens: opts.maxTokens
        };
        const req = (0, router_1.applyProviderTransformers)(route.provider, baseReq);
        const client = new openaiCompatClient_1.OpenAICompatClient({
            apiBaseUrl: route.provider.api_base_url,
            apiKey: route.provider.api_key,
            timeoutMs: 60_000,
            logger
        });
        if (opts.stream) {
            let acc = "";
            await client.chatStream(req, {
                onToken: (token) => {
                    acc += token;
                    process.stdout.write(token);
                },
                onDone: () => { },
                onError: (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    // eslint-disable-next-line no-console
                    console.error(`\n[stream error] ${message}`);
                }
            });
            process.stdout.write("\n");
            if (opts.json) {
                // eslint-disable-next-line no-console
                console.log(JSON.stringify({
                    answer: acc,
                    usage: undefined,
                    model: route.modelName,
                    provider: route.providerName
                }, null, 2));
            }
            return;
        }
        const result = await client.chat(req);
        if (opts.json) {
            // eslint-disable-next-line no-console
            console.log(JSON.stringify({
                answer: result.content,
                usage: result.usage,
                model: route.modelName,
                provider: route.providerName
            }, null, 2));
            return;
        }
        // eslint-disable-next-line no-console
        console.log(result.content);
    });
}
//# sourceMappingURL=ask.js.map
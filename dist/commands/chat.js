"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerChatCommand = registerChatCommand;
const common_1 = require("./common");
const chatRepl_1 = require("../tui/chatRepl");
function registerChatCommand(program) {
    const cmd = program.command("chat").description("Interactive chat (REPL)");
    (0, common_1.addGlobalOptions)(cmd)
        .option("--system <path>", "Path to system prompt file")
        .option("--max-tokens <n>", "Override max_tokens", (v) => Number(v))
        .option("--no-stream", "Disable streaming responses")
        .option("--model <provider,model>", "Override default provider,model")
        .action(async (opts) => {
        const { loaded, logger } = await (0, common_1.loadConfigAndLogger)(opts);
        await (0, chatRepl_1.runChatRepl)({
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
//# sourceMappingURL=chat.js.map
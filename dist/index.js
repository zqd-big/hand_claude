#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chat_1 = require("./commands/chat");
const ask_1 = require("./commands/ask");
const models_1 = require("./commands/models");
const repo_1 = require("./commands/repo");
const run_1 = require("./commands/run");
const program = new commander_1.Command();
program
    .name("hc")
    .description("hc-code: Huawei Code Assistant CLI")
    .version("0.1.0");
(0, chat_1.registerChatCommand)(program);
(0, ask_1.registerAskCommand)(program);
(0, models_1.registerModelsCommand)(program);
(0, repo_1.registerRepoCommand)(program);
(0, run_1.registerRunCommand)(program);
program.parseAsync(process.argv).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[hc] fatal: ${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map
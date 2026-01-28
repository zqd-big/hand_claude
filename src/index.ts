#!/usr/bin/env node
import { Command } from "commander";
import { registerChatCommand } from "./commands/chat";
import { registerAskCommand } from "./commands/ask";
import { registerModelsCommand } from "./commands/models";
import { registerRepoCommand } from "./commands/repo";
import { registerRunCommand } from "./commands/run";

const program = new Command();

program
  .name("hc")
  .description("hc-code: Huawei Code Assistant CLI")
  .version("0.1.0");

registerChatCommand(program);
registerAskCommand(program);
registerModelsCommand(program);
registerRepoCommand(program);
registerRunCommand(program);

program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[hc] fatal: ${message}`);
  process.exitCode = 1;
});
import type { Command } from "commander";
import readline from "node:readline";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { execStreaming } from "../utils/shell";

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(["y", "yes"].includes(answer.trim().toLowerCase()));
    });
  });
}

function tailLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

export function registerRunCommand(program: Command): void {
  const cmd = program
    .command("run")
    .description("Run a shell command (with confirmation)");

  addGlobalOptions(cmd)
    .argument("<command...>", "Command to run")
    .option("--yes", "Skip confirmation")
    .option(
      "--tail <n>",
      "Tail lines for context (default 2000)",
      (v) => Number(v),
      2000
    )
    .action(async (commandParts: string[], opts) => {
      const { logger } = await loadConfigAndLogger(opts);

      const commandStr = commandParts.join(" ");
      let confirmed = Boolean(opts.yes);
      if (!confirmed) {
        confirmed = await askConfirm(`Run command: ${commandStr}?`);
      }
      if (!confirmed) {
        // eslint-disable-next-line no-console
        console.log("Aborted.");
        return;
      }

      logger.info(`running: ${commandStr}`);

      const res = await execStreaming(
        commandParts[0]!,
        commandParts.slice(1),
        process.cwd(),
        (s) => process.stdout.write(s),
        (s) => process.stderr.write(s)
      );

      const combined = [res.stdout, res.stderr].filter(Boolean).join("\n");
      const tail = tailLines(combined, opts.tail);

      // eslint-disable-next-line no-console
      console.log(`\n[hc] command exit code: ${res.code ?? -1}`);
      // eslint-disable-next-line no-console
      console.log(`[hc] tail(${opts.tail}) captured:`);
      // eslint-disable-next-line no-console
      console.log(tail);
    });
}
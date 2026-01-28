"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRunCommand = registerRunCommand;
const node_readline_1 = __importDefault(require("node:readline"));
const common_1 = require("./common");
const shell_1 = require("../utils/shell");
function askConfirm(question) {
    const rl = node_readline_1.default.createInterface({
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
function tailLines(text, maxLines) {
    const lines = text.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
function registerRunCommand(program) {
    const cmd = program
        .command("run")
        .description("Run a shell command (with confirmation)");
    (0, common_1.addGlobalOptions)(cmd)
        .argument("<command...>", "Command to run")
        .option("--yes", "Skip confirmation")
        .option("--tail <n>", "Tail lines for context (default 2000)", (v) => Number(v), 2000)
        .action(async (commandParts, opts) => {
        const { logger } = await (0, common_1.loadConfigAndLogger)(opts);
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
        const res = await (0, shell_1.execStreaming)(commandParts[0], commandParts.slice(1), process.cwd(), (s) => process.stdout.write(s), (s) => process.stderr.write(s));
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
//# sourceMappingURL=run.js.map
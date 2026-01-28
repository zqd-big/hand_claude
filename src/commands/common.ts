import type { Command } from "commander";
import { loadConfig, type LoadedConfig } from "../config/loader";
import { Logger } from "../utils/logger";

export interface GlobalOptions {
  config?: string;
  verbose?: boolean;
}

export async function loadConfigAndLogger(
  opts: GlobalOptions
): Promise<{ loaded: LoadedConfig; logger: Logger }> {
  const loaded = await loadConfig({ configPath: opts.config });
  const logger = new Logger({
    enabled: Boolean(loaded.config.Router.LOG),
    verbose: Boolean(opts.verbose)
  });
  logger.info(`config: ${loaded.path}`);
  return { loaded, logger };
}

export function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option("--config <path>", "Path to config file")
    .option("--verbose", "Verbose logging");
}
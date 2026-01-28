"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfigAndLogger = loadConfigAndLogger;
exports.addGlobalOptions = addGlobalOptions;
const loader_1 = require("../config/loader");
const logger_1 = require("../utils/logger");
async function loadConfigAndLogger(opts) {
    const loaded = await (0, loader_1.loadConfig)({ configPath: opts.config });
    const logger = new logger_1.Logger({
        enabled: Boolean(loaded.config.Router.LOG),
        verbose: Boolean(opts.verbose)
    });
    logger.info(`config: ${loaded.path}`);
    return { loaded, logger };
}
function addGlobalOptions(cmd) {
    return cmd
        .option("--config <path>", "Path to config file")
        .option("--verbose", "Verbose logging");
}
//# sourceMappingURL=common.js.map
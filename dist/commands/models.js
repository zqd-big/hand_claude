"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModelsCommand = registerModelsCommand;
const common_1 = require("./common");
const router_1 = require("../router/router");
function registerModelsCommand(program) {
    const cmd = program.command("models").description("List providers and models");
    (0, common_1.addGlobalOptions)(cmd).action(async (opts) => {
        const { loaded } = await (0, common_1.loadConfigAndLogger)(opts);
        const def = (0, router_1.parseProviderModel)(loaded.config.Router.default);
        for (const p of loaded.config.Providers) {
            // eslint-disable-next-line no-console
            console.log(`Provider: ${p.name}${p.name === def.providerName ? " (default)" : ""}`);
            if (p.models.length === 0) {
                // eslint-disable-next-line no-console
                console.log("  - (no models declared)");
                continue;
            }
            for (const m of p.models) {
                const mark = p.name === def.providerName && m === def.modelName ? " *default*" : "";
                // eslint-disable-next-line no-console
                console.log(`  - ${m}${mark}`);
            }
        }
    });
}
//# sourceMappingURL=models.js.map
import type { Command } from "commander";
import { addGlobalOptions, loadConfigAndLogger } from "./common";
import { parseProviderModel } from "../router/router";

export function registerModelsCommand(program: Command): void {
  const cmd = program.command("models").description("List providers and models");

  addGlobalOptions(cmd).action(async (opts) => {
    const { loaded } = await loadConfigAndLogger(opts);

    const def = parseProviderModel(loaded.config.Router.default);

    for (const p of loaded.config.Providers) {
      // eslint-disable-next-line no-console
      console.log(
        `Provider: ${p.name}${p.name === def.providerName ? " (default)" : ""}`
      );
      if (p.models.length === 0) {
        // eslint-disable-next-line no-console
        console.log("  - (no models declared)");
        continue;
      }

      for (const m of p.models) {
        const mark =
          p.name === def.providerName && m === def.modelName ? " *default*" : "";
        // eslint-disable-next-line no-console
        console.log(`  - ${m}${mark}`);
      }
    }
  });
}
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProviderModel = parseProviderModel;
exports.resolveRoute = resolveRoute;
exports.applyProviderTransformers = applyProviderTransformers;
const transformers_1 = require("./transformers");
function parseProviderModel(input) {
    const parts = input.split(",");
    if (parts.length !== 2) {
        throw new Error(`Invalid provider,model: "${input}". Expected "provider,model".`);
    }
    const providerName = parts[0]?.trim();
    const modelName = parts[1]?.trim();
    if (!providerName || !modelName) {
        throw new Error(`Invalid provider,model: "${input}". Provider or model is empty.`);
    }
    return { providerName, modelName };
}
function resolveRoute(config, override) {
    const ref = parseProviderModel(override ?? config.Router.default);
    const provider = config.Providers.find((p) => p.name === ref.providerName);
    if (!provider) {
        throw new Error(`Provider not found: "${ref.providerName}".`);
    }
    if (provider.models.length > 0 && !provider.models.includes(ref.modelName)) {
        throw new Error(`Model "${ref.modelName}" not in provider "${provider.name}" models list.`);
    }
    return {
        provider,
        providerName: ref.providerName,
        modelName: ref.modelName
    };
}
function applyProviderTransformers(provider, request) {
    const pipeline = provider.transformer?.use ?? [];
    return (0, transformers_1.applyTransformers)(request, pipeline);
}
//# sourceMappingURL=router.js.map
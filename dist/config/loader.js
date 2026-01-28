"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_path_1 = __importDefault(require("node:path"));
const schema_1 = require("./schema");
const paths_1 = require("../utils/paths");
const fs_1 = require("../utils/fs");
function envKeyForProvider(providerName) {
    const normalized = providerName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    return `HCAI_${normalized}_API_KEY`;
}
function applyApiKeyOverrides(provider) {
    const specific = process.env[envKeyForProvider(provider.name)];
    const generic = process.env.HCAI_API_KEY;
    if (specific && specific.trim().length > 0) {
        return { ...provider, api_key: specific.trim() };
    }
    if (generic && generic.trim().length > 0) {
        return { ...provider, api_key: generic.trim() };
    }
    return provider;
}
async function loadConfig(opts = {}) {
    const candidates = (0, paths_1.resolveConfigPath)(opts.configPath);
    for (const candidate of candidates) {
        const full = node_path_1.default.resolve(candidate);
        if (!(await (0, fs_1.fileExists)(full))) {
            continue;
        }
        const raw = await (0, fs_1.readJsonFile)(full);
        const parsed = schema_1.AppConfigSchema.parse(raw);
        const withEnv = {
            ...parsed,
            Providers: parsed.Providers.map(applyApiKeyOverrides)
        };
        return { path: full, config: withEnv };
    }
    throw new Error(`No config found. Tried: ${candidates.join(", ")}. Use --config <path>.`);
}
//# sourceMappingURL=loader.js.map
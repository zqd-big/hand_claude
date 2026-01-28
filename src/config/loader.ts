import path from "node:path";
import {
  AppConfigSchema,
  type AppConfig,
  type ProviderConfig
} from "./schema";
import { resolveConfigPath } from "../utils/paths";
import { fileExists, readJsonFile } from "../utils/fs";

export interface LoadConfigOptions {
  configPath?: string;
}

export interface LoadedConfig {
  path: string;
  config: AppConfig;
}

function envKeyForProvider(providerName: string): string {
  const normalized = providerName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  return `HCAI_${normalized}_API_KEY`;
}

function applyApiKeyOverrides(provider: ProviderConfig): ProviderConfig {
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

export async function loadConfig(
  opts: LoadConfigOptions = {}
): Promise<LoadedConfig> {
  const candidates = resolveConfigPath(opts.configPath);

  for (const candidate of candidates) {
    const full = path.resolve(candidate);
    if (!(await fileExists(full))) {
      continue;
    }
    const raw = await readJsonFile<unknown>(full);
    const parsed = AppConfigSchema.parse(raw);

    const withEnv: AppConfig = {
      ...parsed,
      Providers: parsed.Providers.map(applyApiKeyOverrides)
    };

    return { path: full, config: withEnv };
  }

  throw new Error(
    `No config found. Tried: ${candidates.join(", ")}. Use --config <path>.`
  );
}
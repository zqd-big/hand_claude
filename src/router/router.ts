import type { AppConfig, ProviderConfig } from "../config/schema";
import { applyTransformers } from "./transformers";

export interface ProviderModelRef {
  providerName: string;
  modelName: string;
}

export interface ResolvedRoute {
  provider: ProviderConfig;
  providerName: string;
  modelName: string;
}

export function parseProviderModel(input: string): ProviderModelRef {
  const parts = input.split(",");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid provider,model: "${input}". Expected "provider,model".`
    );
  }
  const providerName = parts[0]?.trim();
  const modelName = parts[1]?.trim();

  if (!providerName || !modelName) {
    throw new Error(
      `Invalid provider,model: "${input}". Provider or model is empty.`
    );
  }

  return { providerName, modelName };
}

export function resolveRoute(
  config: AppConfig,
  override?: string
): ResolvedRoute {
  const ref = parseProviderModel(override ?? config.Router.default);

  const provider = config.Providers.find((p) => p.name === ref.providerName);
  if (!provider) {
    throw new Error(`Provider not found: "${ref.providerName}".`);
  }

  if (provider.models.length > 0 && !provider.models.includes(ref.modelName)) {
    throw new Error(
      `Model "${ref.modelName}" not in provider "${provider.name}" models list.`
    );
  }

  return {
    provider,
    providerName: ref.providerName,
    modelName: ref.modelName
  };
}

export function applyProviderTransformers(
  provider: ProviderConfig,
  request: Record<string, unknown>
): Record<string, unknown> {
  const pipeline = provider.transformer?.use ?? [];
  return applyTransformers(request, pipeline);
}
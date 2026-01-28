import type { TransformerUseItem } from "../config/schema";

export interface RequestLike {
  max_tokens?: number;
  [k: string]: unknown;
}

export type TransformerFn = (
  req: RequestLike,
  args: Record<string, unknown>
) => RequestLike;

const maxtokenTransformer: TransformerFn = (req, args) => {
  if (typeof req.max_tokens === "number") {
    return req;
  }
  const value = args.max_tokens;
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ...req, max_tokens: value };
  }
  return req;
};

const registry: Record<string, TransformerFn> = {
  maxtoken: maxtokenTransformer
};

export function applyTransformers(
  req: RequestLike,
  pipeline: TransformerUseItem[]
): RequestLike {
  let current = { ...req };
  for (const [name, args] of pipeline) {
    const fn = registry[name];
    if (!fn) continue;
    current = fn(current, args);
  }
  return current;
}
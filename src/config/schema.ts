import { z } from "zod";

export const TransformerUseItemSchema = z.tuple([
  z.string(),
  z.record(z.string(), z.any())
]);

export const ProviderSchema = z.object({
  name: z.string().min(1),
  api_base_url: z.string().min(1),
  api_key: z.string().optional(),
  models: z.array(z.string().min(1)).default([]),
  transformer: z
    .object({
      use: z.array(TransformerUseItemSchema).default([])
    })
    .optional()
});

export const RouterSchema = z.object({
  default: z.string().min(3),
  HOST: z.string().optional(),
  LOG: z.boolean().optional().default(false)
});

export const AppConfigSchema = z.object({
  Providers: z.array(ProviderSchema).min(1),
  Router: RouterSchema
});

export type TransformerUseItem = z.infer<typeof TransformerUseItemSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type RouterConfig = z.infer<typeof RouterSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
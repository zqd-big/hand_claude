"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppConfigSchema = exports.RouterSchema = exports.ProviderSchema = exports.TransformerUseItemSchema = void 0;
const zod_1 = require("zod");
exports.TransformerUseItemSchema = zod_1.z.tuple([
    zod_1.z.string(),
    zod_1.z.record(zod_1.z.string(), zod_1.z.any())
]);
exports.ProviderSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    api_base_url: zod_1.z.string().min(1),
    api_key: zod_1.z.string().optional(),
    models: zod_1.z.array(zod_1.z.string().min(1)).default([]),
    transformer: zod_1.z
        .object({
        use: zod_1.z.array(exports.TransformerUseItemSchema).default([])
    })
        .optional()
});
exports.RouterSchema = zod_1.z.object({
    default: zod_1.z.string().min(3),
    HOST: zod_1.z.string().optional(),
    LOG: zod_1.z.boolean().optional().default(false)
});
exports.AppConfigSchema = zod_1.z.object({
    Providers: zod_1.z.array(exports.ProviderSchema).min(1),
    Router: exports.RouterSchema
});
//# sourceMappingURL=schema.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTransformers = applyTransformers;
const maxtokenTransformer = (req, args) => {
    if (typeof req.max_tokens === "number") {
        return req;
    }
    const value = args.max_tokens;
    if (typeof value === "number" && Number.isFinite(value)) {
        return { ...req, max_tokens: value };
    }
    return req;
};
const registry = {
    maxtoken: maxtokenTransformer
};
function applyTransformers(req, pipeline) {
    let current = { ...req };
    for (const [name, args] of pipeline) {
        const fn = registry[name];
        if (!fn)
            continue;
        current = fn(current, args);
    }
    return current;
}
//# sourceMappingURL=transformers.js.map
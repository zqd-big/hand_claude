"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, shouldRetry, opts) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn(attempt);
        }
        catch (err) {
            if (attempt >= opts.retries || !shouldRetry(err)) {
                throw err;
            }
            const delay = Math.min(opts.maxDelayMs, opts.baseDelayMs * Math.pow(2, attempt));
            await sleep(delay);
            attempt += 1;
        }
    }
}
//# sourceMappingURL=retry.js.map
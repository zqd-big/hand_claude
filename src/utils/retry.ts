export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  opts: RetryOptions
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(
        opts.maxDelayMs,
        opts.baseDelayMs * Math.pow(2, attempt)
      );
      await sleep(delay);
      attempt += 1;
    }
  }
}
/**
 * Shared retry and polling utilities.
 */

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === opts.maxAttempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) break;
      opts.onRetry?.(attempt, err);
      await sleep(opts.delayMs);
    }
  }
  throw lastError;
}

export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  opts: { maxAttempts: number; intervalMs: number; onPoll?: (attempt: number, result: T) => void }
): Promise<T> {
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const result = await fn();
    if (predicate(result)) return result;
    opts.onPoll?.(attempt, result);
    if (attempt < opts.maxAttempts) await sleep(opts.intervalMs);
  }
  throw new Error(`pollUntil timed out after ${opts.maxAttempts} attempts`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

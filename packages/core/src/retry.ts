// Qis Retry Utility
// Standardized retry pattern with exponential backoff + jitter.
// Used by Execution Engine and any other engine that calls external
// services (exchanges) where thundering-herd risk against rate limits
// is a real concern.

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms for the first retry. Default: 1000 */
  baseDelayMs?: number;
  /** Exponential factor applied to the delay each attempt. Default: 2 */
  backoffFactor?: number;
  /** Maximum delay cap in ms. Default: 30_000 */
  maxDelayMs?: number;
  /** Optional jitter fraction (0–1) of the delay to randomize. Default: 0.3 */
  jitter?: number;
  /** Optional predicate to decide whether a given error is retryable. Default: retry all */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback fired before each retry (e.g. logging). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Computes the delay for a given attempt using exponential backoff + jitter.
 *
 * delay = min(baseDelay * factor^(attempt-1), maxDelay)
 * jittered = delay * (1 - jitter + random() * jitter * 2)
 *
 * The jitter is applied symmetrically around the base delay so the mean
 * stays close to the intended backoff while individual retries spread out,
 * reducing thundering-herd collisions against exchange rate limits.
 */
export function computeRetryDelayMs(
  attempt: number,
  options: Required<Pick<RetryOptions, 'baseDelayMs' | 'backoffFactor' | 'maxDelayMs' | 'jitter'>> = {
    baseDelayMs: 1000,
    backoffFactor: 2,
    maxDelayMs: 30_000,
    jitter: 0.3,
  }
): number {
  const { baseDelayMs, backoffFactor, maxDelayMs, jitter } = options;
  const exponential = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  const jitterRange = capped * jitter;
  const jittered = capped - jitterRange + Math.random() * jitterRange * 2;
  return Math.max(0, Math.round(jittered));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` with the standardized retry pattern.
 *
 * - Exponential backoff + jitter between attempts (not a fixed delay).
 * - Stops retrying once `maxAttempts` is reached and throws the last error.
 * - `shouldRetry` can be used to skip retrying on non-retryable errors.
 *
 * @example
 * const result = await withRetry(
 *   () => exchangeEngine.executeOrderEncrypted(params),
 *   { maxAttempts: 3, onRetry: (err, attempt, delay) => logger.warn(...) }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitter = options.jitter ?? 0.3;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const onRetry = options.onRetry;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        break;
      }
      const delayMs = computeRetryDelayMs(attempt, {
        baseDelayMs,
        backoffFactor,
        maxDelayMs,
        jitter,
      });
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
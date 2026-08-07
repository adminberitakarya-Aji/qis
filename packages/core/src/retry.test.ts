import { describe, it, expect, vi, afterEach } from 'vitest';
import { withRetry, computeRetryDelayMs } from './retry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeRetryDelayMs', () => {
  it('applies exponential backoff based on attempt number', () => {
    // Disable randomness for deterministic test
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const options = { baseDelayMs: 1000, backoffFactor: 2, maxDelayMs: 30_000, jitter: 0.3 };

    // attempt 1: 1000 * 2^0 = 1000, jittered at median = 1000
    const d1 = computeRetryDelayMs(1, options);
    // attempt 2: 1000 * 2^1 = 2000, jittered at median = 2000
    const d2 = computeRetryDelayMs(2, options);
    // attempt 3: 1000 * 2^2 = 4000, jittered at median = 4000
    const d3 = computeRetryDelayMs(3, options);
    // attempt 5: 1000 * 2^4 = 16000
    const d5 = computeRetryDelayMs(5, options);

    expect(d1).toBe(1000);
    expect(d2).toBe(2000);
    expect(d3).toBe(4000);
    expect(d5).toBe(16000);
  });

  it('jitter spreads delays around the base delay', () => {
    // Random returns 0 → minimum jitter (delay * (1 - jitter))
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const minDelay = computeRetryDelayMs(2, {
      baseDelayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 30_000,
      jitter: 0.3,
    });

    // Random returns 1 → maximum jitter (delay * (1 + jitter))
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const maxDelay = computeRetryDelayMs(2, {
      baseDelayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 30_000,
      jitter: 0.3,
    });

    expect(minDelay).toBe(1400); // 2000 * (1 - 0.3)
    expect(maxDelay).toBe(2600); // 2000 * (1 + 0.3)
  });

  it('caps at maxDelayMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const d = computeRetryDelayMs(10, {
      baseDelayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 5000,
      jitter: 0.3,
    });

    // 1000 * 2^9 = 512000, capped at 5000, jittered at median = 5000
    expect(d).toBe(5000);
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff and succeeds on a later attempt', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue('ok');

    const onRetry = vi.fn();
    const result = await withRetry(fn, { maxAttempts: 3, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    // attempt 1 → delay 1000ms, attempt 2 → delay 2000ms
    expect(onRetry.mock.calls[0][2]).toBe(1000);
    expect(onRetry.mock.calls[1][2]).toBe(2000);
  });

  it('throws the last error when all attempts fail', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'));

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('fail 3');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry — stops retrying when it returns false', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('non-retryable'))
      .mockResolvedValue('should not reach');

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        shouldRetry: (error) => (error as Error).message !== 'non-retryable',
      })
    ).rejects.toThrow('non-retryable');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses default maxAttempts of 3', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
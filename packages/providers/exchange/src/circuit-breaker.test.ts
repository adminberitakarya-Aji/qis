import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('allows calls through when closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await breaker.run('binance', 'fetchTicker', fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('closed');
  });

  it('trips open after failureThreshold consecutive failures', async () => {
    const onOpen = vi.fn();
    const breaker = new CircuitBreaker({ failureThreshold: 3, onOpen });
    const fn = vi.fn().mockRejectedValue(new Error('exchange down'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.run('binance', 'executeOrder', fn)).rejects.toThrow('exchange down');
    }

    expect(breaker.getStateName('binance', 'executeOrder')).toBe('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('binance', 'executeOrder', expect.any(Error));
  });

  it('rejects calls while open', async () => {
    const onReject = vi.fn();
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000, onReject });
    const fn = vi.fn().mockRejectedValue(new Error('exchange down'));

    // Trip the breaker
    await expect(breaker.run('binance', 'fetchTicker', fn)).rejects.toThrow('exchange down');
    await expect(breaker.run('binance', 'fetchTicker', fn)).rejects.toThrow('exchange down');

    // Now open — calls are rejected immediately without invoking fn
    await expect(breaker.run('binance', 'fetchTicker', fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onReject).toHaveBeenCalledWith('binance', 'fetchTicker');
  });

  it('transitions to half-open after resetTimeout and closes on success', async () => {
    const onClose = vi.fn();
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 10_000,
      successThreshold: 2,
      onClose,
    });

    const failingFn = vi.fn().mockRejectedValue(new Error('exchange down'));
    const succeedingFn = vi.fn().mockResolvedValue('recovered');

    // Trip the breaker
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('exchange down');
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('exchange down');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('open');

    // Advance past reset timeout → half-open, probe call allowed
    vi.advanceTimersByTime(10_000);
    const result = await breaker.run('binance', 'fetchTicker', succeedingFn);
    expect(result).toBe('recovered');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('half_open');

    // Second success closes the breaker
    await breaker.run('binance', 'fetchTicker', succeedingFn);
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('closed');
    expect(onClose).toHaveBeenCalledWith('binance', 'fetchTicker');
  });

  it('re-opens if a half-open probe call fails', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 10_000,
      successThreshold: 2,
    });

    const failingFn = vi.fn().mockRejectedValue(new Error('exchange down'));

    // Trip the breaker
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('exchange down');
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('exchange down');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('open');

    // Advance past reset timeout → half-open, probe call fails → re-opens
    vi.advanceTimersByTime(10_000);
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('exchange down');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('open');
  });

  it('tracks state per (exchange, operation) pair', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const failingFn = vi.fn().mockRejectedValue(new Error('down'));
    const okFn = vi.fn().mockResolvedValue('ok');

    // Trip binance:fetchTicker
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('down');
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('down');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('open');

    // bybit:fetchTicker is unaffected
    const result = await breaker.run('bybit', 'fetchTicker', okFn);
    expect(result).toBe('ok');
    expect(breaker.getStateName('bybit', 'fetchTicker')).toBe('closed');
  });

  it('resetAll clears all breaker states', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const failingFn = vi.fn().mockRejectedValue(new Error('down'));

    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('down');
    await expect(breaker.run('binance', 'fetchTicker', failingFn)).rejects.toThrow('down');
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('open');

    breaker.resetAll();
    expect(breaker.getStateName('binance', 'fetchTicker')).toBe('closed');
  });
});
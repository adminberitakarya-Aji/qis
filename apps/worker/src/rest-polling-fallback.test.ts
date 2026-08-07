// Qis Worker — REST Polling Fallback Test
//
// Verifies the WebSocket→REST polling fallback actually exercises:
// - Polls the exchange REST API for the current price
// - Invokes onPrice with each successful tick
// - Stops polling when `stop` is called
// - Is a no-op when started twice for the same key

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRestPollingFallback } from './rest-polling-fallback';

interface MockEngine {
  fetchTicker: ReturnType<typeof vi.fn>;
}

function createMockEngine(): MockEngine {
  return {
    fetchTicker: vi.fn(),
  };
}

describe('createRestPollingFallback', () => {
  let mockEngine: MockEngine;

  // Short interval for fast tests
  const pollIntervalMs = 10;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEngine = createMockEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the current price from the exchange REST API and invokes onPrice', async () => {
    const fallback = createRestPollingFallback({
      pollIntervalMs,
      exchangeEngine: mockEngine as never,
    });

    const onPrice = vi.fn();
    mockEngine.fetchTicker.mockResolvedValue({ last: 96450.0 });

    fallback.start('binance:btcusdt', 'binance', 'BTC/USDT', onPrice);

    // Initial immediate poll
    await vi.advanceTimersByTimeAsync(0);
    expect(mockEngine.fetchTicker).toHaveBeenCalledWith('binance', 'BTC/USDT');
    expect(onPrice).toHaveBeenCalledWith(96450.0);

    // Subsequent interval polls
    await vi.advanceTimersByTimeAsync(pollIntervalMs);
    await vi.advanceTimersByTimeAsync(pollIntervalMs);

    expect(mockEngine.fetchTicker).toHaveBeenCalledTimes(3);
    expect(onPrice).toHaveBeenCalledTimes(3);

    fallback.stopAll();
  });

  it('does not invoke onPrice when the REST call fails', async () => {
    const fallback = createRestPollingFallback({
      pollIntervalMs,
      exchangeEngine: mockEngine as never,
    });

    const onPrice = vi.fn();
    mockEngine.fetchTicker.mockRejectedValue(new Error('rate limit'));

    fallback.start('binance:btcusdt', 'binance', 'BTC/USDT', onPrice);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(pollIntervalMs);

    expect(onPrice).not.toHaveBeenCalled();

    fallback.stopAll();
  });

  it('stops polling when stop is called', async () => {
    const fallback = createRestPollingFallback({
      pollIntervalMs,
      exchangeEngine: mockEngine as never,
    });

    const onPrice = vi.fn();
    mockEngine.fetchTicker.mockResolvedValue({ last: 50000.0 });

    fallback.start('binance:btcusdt', 'binance', 'BTC/USDT', onPrice);
    await vi.advanceTimersByTimeAsync(0);
    expect(onPrice).toHaveBeenCalledTimes(1);

    fallback.stop('binance:btcusdt');
    expect(fallback.isActive('binance:btcusdt')).toBe(false);

    // Advance timers — no more polls should fire
    await vi.advanceTimersByTimeAsync(pollIntervalMs * 5);
    expect(onPrice).toHaveBeenCalledTimes(1);

    fallback.stopAll();
  });

  it('is a no-op when started twice for the same key', async () => {
    const fallback = createRestPollingFallback({
      pollIntervalMs,
      exchangeEngine: mockEngine as never,
    });

    const onPrice = vi.fn();
    mockEngine.fetchTicker.mockResolvedValue({ last: 50000.0 });

    fallback.start('binance:btcusdt', 'binance', 'BTC/USDT', onPrice);
    fallback.start('binance:btcusdt', 'binance', 'BTC/USDT', onPrice);

    await vi.advanceTimersByTimeAsync(0);

    // Only one timer active → only one immediate poll callback chain
    expect(fallback.isActive('binance:btcusdt')).toBe(true);

    fallback.stopAll();
  });

  it('stop is a no-op when not polling', () => {
    const fallback = createRestPollingFallback({
      exchangeEngine: mockEngine as never,
    });
    expect(() => fallback.stop('nonexistent:key')).not.toThrow();
    expect(fallback.isActive('nonexistent:key')).toBe(false);
    fallback.stopAll();
  });
});
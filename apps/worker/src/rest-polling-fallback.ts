// Qis Worker — REST Polling Fallback
//
// When the WebSocket stream disconnects, this module polls the exchange's
// public REST API for the current price so grid levels are still checked
// while the WS is down. This is the WebSocket→REST polling fallback
// referenced in ROADMAP 0.3.

import { ExchangeEngine } from '@qis/exchange-engine';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-worker:rest-fallback');

export interface RestPollingFallbackOptions {
  /** Poll interval in ms. Default: 15_000 */
  pollIntervalMs?: number;
  /** Exchange engine to use for REST ticker fetches. Default: new ExchangeEngine() */
  exchangeEngine?: ExchangeEngine;
}

export interface RestPollingFallback {
  /** Starts polling. No-op if already polling for this key. */
  start(
    subKey: string,
    exchange: 'binance' | 'bybit',
    symbol: string,
    onPrice: (price: number) => void
  ): void;
  /** Stops polling for this key. No-op if not polling. */
  stop(subKey: string): void;
  /** Returns true if polling is active for this key. */
  isActive(subKey: string): boolean;
  /** Stops all polling. */
  stopAll(): void;
}

/**
 * Creates a REST polling fallback that periodically fetches the current
 * price from the exchange's public REST API and invokes `onPrice` with
 * each successful tick.
 *
 * The fallback is per (exchange:symbol) key so multiple subscriptions
 * can each have their own independent polling loop.
 */
export function createRestPollingFallback(
  options: RestPollingFallbackOptions = {}
): RestPollingFallback {
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const engine = options.exchangeEngine ?? new ExchangeEngine();
  const timers = new Map<string, NodeJS.Timeout>();
  let isShuttingDown = false;

  return {
    start(subKey, exchange, symbol, onPrice) {
      if (timers.has(subKey)) {
        logger.debug('REST polling fallback already active', { subKey });
        return;
      }

      logger.warn('Starting REST polling fallback', { subKey, exchange, symbol });

      const poll = async () => {
        if (isShuttingDown) return;
        try {
          const ticker = await engine.fetchTicker(exchange, symbol);
          if (ticker && ticker.last > 0) {
            onPrice(ticker.last);
          }
        } catch (err: any) {
          logger.warn('REST polling fallback fetch failed', { subKey, error: err.message });
        }
      };

      // Poll immediately, then on interval
      void poll();
      const timer = setInterval(poll, pollIntervalMs);
      timers.set(subKey, timer);
    },

    stop(subKey) {
      const timer = timers.get(subKey);
      if (timer) {
        clearInterval(timer);
        timers.delete(subKey);
        logger.info('Stopped REST polling fallback', { subKey });
      }
    },

    isActive(subKey) {
      return timers.has(subKey);
    },

    stopAll() {
      isShuttingDown = true;
      for (const timer of timers.values()) {
        clearInterval(timer);
      }
      timers.clear();
      logger.info('Stopped all REST polling fallbacks');
    },
  };
}
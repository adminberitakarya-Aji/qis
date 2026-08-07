/**
 * Qis Background Worker — Binance & Bybit WebSocket Price Monitor & Grid Order Trigger
 *
 * Architecture:
 * 1. On startup: fetch all ACTIVE strategies from NestJS API (GET /api/v1/execution/active-strategies)
 * 2. For each active strategy: subscribe to exchange WebSocket ticker stream for the pair symbol
 * 3. On every price tick: check if current price crosses any pending grid BUY level
 * 4. If price <= gridPrice for any pending order: trigger Market Buy via NestJS API (POST /api/v1/execution/trigger-order)
 * 5. Public WebSocket does NOT require API keys — zero auth needed for price data
 * 6. WebSocket auto-reconnects on disconnect with exponential backoff
 *
 * Trade execution (market order) is handled by ExchangeEngine in NestJS API using trader's API key.
 * This worker is purely a price-monitoring and triggering layer.
 */

import WebSocket from 'ws';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-worker');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const WORKER_SECRET = process.env.WORKER_SECRET || 'qis-internal-worker-secret-dev';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';
const BYBIT_WS_BASE = 'wss://stream.bybit.com/v5/public/spot';
const RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30_000;

const WORKER_HEADERS = {
  'Content-Type': 'application/json',
  'x-worker-secret': WORKER_SECRET,
};

interface GridLevel {
  orderId: string;
  symbol: string;
  gridPrice: number;
  tpPrice: number;
  sectionIndex: number;
  orderIndex: number;
}

interface ActiveStrategy {
  strategyId: string;
  symbol: string;    // e.g. "BTC/USDT"
  exchange: string;  // 'binance' | 'bybit'
  pendingOrders: GridLevel[];
}

// ============================================================
// State: exchange:symbol → active price-monitoring subscriptions
// ============================================================
const subscriptions = new Map<string, WebSocket>();
const heartbeatTimers = new Map<string, NodeJS.Timeout>(); // Track heartbeat timers for cleanup
const strategyMap = new Map<string, ActiveStrategy>();
let strategyRefreshInterval: NodeJS.Timeout | null = null; // Track the strategy refresh interval
let isShuttingDown = false;

// ============================================================
// Graceful Shutdown Handler
// Cleans up all WebSocket connections, timers, and intervals on SIGTERM/SIGINT
// ============================================================
function gracefulShutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Initiating graceful shutdown...`, { signal });

  // Stop accepting new strategies
  if (strategyRefreshInterval) {
    clearInterval(strategyRefreshInterval);
    strategyRefreshInterval = null;
    logger.info('Strategy refresh interval stopped');
  }

  // Close all WebSocket connections
  let wsCount = 0;
  subscriptions.forEach((ws) => {
    wsCount++;
    // Remove listeners to prevent reconnection logic
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Worker shutting down');
    }
  });
  subscriptions.clear();
  logger.info(`WebSocket connection(s) closed`, { count: wsCount });

  // Clear all heartbeat timers
  let timerCount = 0;
  heartbeatTimers.forEach((timer) => {
    timerCount++;
    clearInterval(timer);
  });
  heartbeatTimers.clear();
  logger.info(`Heartbeat timer(s) stopped`, { count: timerCount });

  // Clear strategy map
  strategyMap.clear();
  logger.info('Strategy map cleared');

  logger.info('Graceful shutdown complete. Goodbye!');
  process.exit(0);
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {}, err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
  gracefulShutdown('unhandledRejection');
});

// ============================================================
// Normalize pair symbol for exchange WebSocket stream
// ============================================================
function toBinanceStreamSymbol(pair: string): string {
  return pair.replace('/', '').toLowerCase();
}

function toBybitStreamSymbol(pair: string): string {
  return pair.replace('/', '');
}

// ============================================================
// Fetch active strategies from NestJS API
// ============================================================
async function fetchActiveStrategies(): Promise<ActiveStrategy[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/execution/active-strategies`, {
      headers: WORKER_HEADERS,
    });
    if (!res.ok) {
      logger.warn('Failed to fetch active strategies from API', { status: res.status });
      return [];
    }
    const json = (await res.json()) as any;
    return (json.data || json) as ActiveStrategy[];
  } catch (err: any) {
    logger.warn('API unreachable, will retry', { error: err.message });
    return [];
  }
}

// ============================================================
// Trigger market order for a grid level via NestJS API
// ============================================================
async function triggerGridOrder(orderId: string, triggeredPrice: number): Promise<void> {
  try {
    logger.info('Triggering grid order', { orderId, triggeredPrice });

    const res = await fetch(`${API_BASE_URL}/execution/trigger-order`, {
      method: 'POST',
      headers: WORKER_HEADERS,
      body: JSON.stringify({ orderId, triggeredPrice }),
    });

    if (res.ok) {
      logger.info('Order triggered successfully', { orderId });
    } else {
      const errText = await res.text();
      logger.warn('Order trigger failed', { orderId, status: res.status, error: errText });
    }
  } catch (err: any) {
    logger.error('Failed to trigger order', { orderId }, err);
  }
}

// ============================================================
// Check price against pending grid levels and trigger if crossed
// ============================================================
function checkAndTrigger(strategies: ActiveStrategy[], currentPrice: number): void {
  for (const strategy of strategies) {
    // Collect all crossed orders in this single price movement (gap)
    const crossedOrders = strategy.pendingOrders.filter(
      (order) => currentPrice <= order.gridPrice
    );

    if (crossedOrders.length === 0) continue;

    // Remove crossed orders from pending to prevent double-trigger
    const crossedIds = new Set(crossedOrders.map((o) => o.orderId));
    strategy.pendingOrders = strategy.pendingOrders.filter(
      (o) => !crossedIds.has(o.orderId)
    );

    // Capital Protection on Gaps (BUSINESS_RULES.md):
    // If a gap crosses multiple levels, send them as a batch so the API
    // can enforce maxCapitalPerMovementPercent.
    if (crossedOrders.length > 1) {
      triggerGridOrdersBatch(
        strategy.strategyId,
        crossedOrders.map((o) => o.orderId),
        currentPrice,
      );
    } else {
      // Single order — use the existing single trigger path
      triggerGridOrder(crossedOrders[0].orderId, currentPrice);
    }
  }
}

// ============================================================
// Trigger multiple grid orders in a batch (gap crossing)
// ============================================================
async function triggerGridOrdersBatch(
  strategyId: string,
  orderIds: string[],
  triggeredPrice: number
): Promise<void> {
  try {
    logger.info('Batch triggering orders', { strategyId, count: orderIds.length, triggeredPrice });

    const res = await fetch(`${API_BASE_URL}/execution/trigger-orders-batch`, {
      method: 'POST',
      headers: WORKER_HEADERS,
      body: JSON.stringify({ strategyId, orderIds, triggeredPrice }),
    });

    if (res.ok) {
      const json = (await res.json()) as any;
      const data = json.data || {};
      logger.info('Batch trigger result', {
        strategyId,
        executed: data.executed?.length ?? 0,
        skipped: data.skipped?.length ?? 0,
      });
    } else {
      const errText = await res.text();
      logger.warn('Batch trigger failed', { strategyId, status: res.status, error: errText });
    }
  } catch (err: any) {
    logger.error('Failed to batch trigger orders', { strategyId }, err);
  }
}

// ============================================================
// Create Binance WebSocket Ticker Stream for a symbol
// ============================================================
function subscribeToBinanceSymbol(binanceSymbol: string, strategies: ActiveStrategy[]): void {
  const subKey = `binance:${binanceSymbol}`;
  if (subscriptions.has(subKey)) {
    logger.debug('Already subscribed to Binance', { symbol: binanceSymbol.toUpperCase() });
    return;
  }

  if (isShuttingDown) {
    logger.debug('Skipping new Binance subscription — shutting down');
    return;
  }

  const streamUrl = `${BINANCE_WS_BASE}/${binanceSymbol}@miniTicker`;
  logger.info('Connecting to Binance WebSocket', { url: streamUrl });

  let ws: WebSocket;
  let reconnectAttempts = 0;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const connect = () => {
    if (isShuttingDown) return;

    ws = new WebSocket(streamUrl);

    ws.on('open', () => {
      if (isShuttingDown) {
        ws.close(1000, 'Worker shutting down');
        return;
      }
      logger.info('Connected to Binance stream', { symbol: binanceSymbol.toUpperCase() });
      reconnectAttempts = 0;
      subscriptions.set(subKey, ws);

      // Heartbeat to keep WS alive
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, HEARTBEAT_INTERVAL_MS);
      heartbeatTimers.set(subKey, heartbeatTimer);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const tick = JSON.parse(data.toString());
        // Mini ticker format: { e: "24hrMiniTicker", s: "BTCUSDT", c: "96450.00", ... }
        const currentPrice = parseFloat(tick.c);

        if (isNaN(currentPrice) || currentPrice <= 0) return;

        checkAndTrigger(strategies, currentPrice);
      } catch (parseErr) {
        // Ignore malformed tick data
      }
    });

    ws.on('error', (err) => {
      logger.error('Binance WebSocket error', { symbol: binanceSymbol }, err);
    });

    ws.on('close', (code) => {
      logger.warn('Binance WebSocket closed', {
        symbol: binanceSymbol,
        code,
        reconnectDelayMs: RECONNECT_DELAY_MS,
      });

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        heartbeatTimers.delete(subKey);
      }

      subscriptions.delete(subKey);

      if (!isShuttingDown) {
        reconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttempts, 30_000);
        setTimeout(connect, delay);
      }
    });
  };

  connect();
}

// ============================================================
// Create Bybit WebSocket Ticker Stream for a symbol
// ============================================================
function subscribeToBybitSymbol(bybitSymbol: string, strategies: ActiveStrategy[]): void {
  const subKey = `bybit:${bybitSymbol}`;
  if (subscriptions.has(subKey)) {
    logger.debug('Already subscribed to Bybit', { symbol: bybitSymbol.toUpperCase() });
    return;
  }

  if (isShuttingDown) {
    logger.debug('Skipping new Bybit subscription — shutting down');
    return;
  }

  logger.info('Connecting to Bybit WebSocket', { url: BYBIT_WS_BASE });

  let ws: WebSocket;
  let reconnectAttempts = 0;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const connect = () => {
    if (isShuttingDown) return;

    ws = new WebSocket(BYBIT_WS_BASE);

    ws.on('open', () => {
      if (isShuttingDown) {
        ws.close(1000, 'Worker shutting down');
        return;
      }
      logger.info('Connected to Bybit stream', { symbol: bybitSymbol.toUpperCase() });
      reconnectAttempts = 0;
      subscriptions.set(subKey, ws);

      // Subscribe to ticker stream
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [`tickers.${bybitSymbol}`],
      }));

      // Heartbeat to keep WS alive
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 'ping' }));
        }
      }, HEARTBEAT_INTERVAL_MS);
      heartbeatTimers.set(subKey, heartbeatTimer);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // Handle pong response
        if (msg.op === 'pong') return;

        // Ticker format: { topic: "tickers.BTCUSDT", data: { lastPrice: "96450.00", ... } }
        if (msg.topic && msg.topic.startsWith('tickers.')) {
          const currentPrice = parseFloat(msg.data?.lastPrice);

          if (isNaN(currentPrice) || currentPrice <= 0) return;

          checkAndTrigger(strategies, currentPrice);
        }
      } catch (parseErr) {
        // Ignore malformed tick data
      }
    });

    ws.on('error', (err) => {
      logger.error('Bybit WebSocket error', { symbol: bybitSymbol }, err);
    });

    ws.on('close', (code) => {
      logger.warn('Bybit WebSocket closed', {
        symbol: bybitSymbol,
        code,
        reconnectDelayMs: RECONNECT_DELAY_MS,
      });

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        heartbeatTimers.delete(subKey);
      }

      subscriptions.delete(subKey);

      if (!isShuttingDown) {
        reconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttempts, 30_000);
        setTimeout(connect, delay);
      }
    });
  };

  connect();
}

// ============================================================
// Dispatcher: subscribe to the correct exchange WebSocket
// ============================================================
function subscribeToSymbol(strategy: ActiveStrategy, strategies: ActiveStrategy[]): void {
  const exchange = strategy.exchange?.toLowerCase() || 'binance';

  if (exchange === 'bybit') {
    const bybitSymbol = toBybitStreamSymbol(strategy.symbol);
    subscribeToBybitSymbol(bybitSymbol, strategies);
  } else {
    const binanceSymbol = toBinanceStreamSymbol(strategy.symbol);
    subscribeToBinanceSymbol(binanceSymbol, strategies);
  }
}

// ============================================================
// Main Worker Bootstrap
// ============================================================
async function main() {
  logger.info('Qis Background Worker starting', {
    apiBase: API_BASE_URL,
    binanceWsBase: BINANCE_WS_BASE,
    bybitWsBase: BYBIT_WS_BASE,
  });

  // Initial load of active strategies
  const strategies = await fetchActiveStrategies();

  if (strategies.length === 0) {
    logger.info('No active strategies found. Waiting for strategies to be deployed...');
    logger.info('Worker will poll for active strategies every 60s.');
  } else {
    logger.info('Found active strategies. Setting up price monitors...', { count: strategies.length });

    // Group strategies by exchange:symbol and subscribe
    const symbolMap = new Map<string, ActiveStrategy[]>();
    for (const s of strategies) {
      strategyMap.set(s.strategyId, s);
      const exchange = s.exchange?.toLowerCase() || 'binance';
      const key = exchange === 'bybit'
        ? `bybit:${toBybitStreamSymbol(s.symbol)}`
        : `binance:${toBinanceStreamSymbol(s.symbol)}`;
      if (!symbolMap.has(key)) symbolMap.set(key, []);
      symbolMap.get(key)!.push(s);
    }

    for (const stratsForSymbol of symbolMap.values()) {
      const first = stratsForSymbol[0];
      subscribeToSymbol(first, stratsForSymbol);
    }
  }

  // Poll API every 60s for newly deployed strategies
  strategyRefreshInterval = setInterval(async () => {
    if (isShuttingDown) return;

    logger.debug('Refreshing active strategies from API...');
    const updatedStrategies = await fetchActiveStrategies();

    for (const strategy of updatedStrategies) {
      if (!strategyMap.has(strategy.strategyId)) {
        logger.info('New strategy detected', {
          strategyId: strategy.strategyId,
          symbol: strategy.symbol,
          exchange: strategy.exchange,
        });
        strategyMap.set(strategy.strategyId, strategy);
        subscribeToSymbol(strategy, [strategy]);
      }
    }
  }, 60_000);

  logger.info('Worker running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  logger.error('Fatal startup error', {}, err);
  process.exit(1);
});
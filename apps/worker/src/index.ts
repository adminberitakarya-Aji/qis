/**
 * Qis Background Worker — Binance WebSocket Price Monitor & Grid Order Trigger
 *
 * Architecture:
 * 1. On startup: fetch all ACTIVE strategies from NestJS API (GET /api/v1/execution/active-strategies)
 * 2. For each active strategy: subscribe to Binance WebSocket ticker stream for the pair symbol
 * 3. On every price tick: check if current price crosses any pending grid BUY level
 * 4. If price <= gridPrice for any pending order: trigger Market Buy via NestJS API (POST /api/v1/execution/trigger-order)
 * 5. Binance public WebSocket does NOT require API keys — zero auth needed for price data
 * 6. WebSocket auto-reconnects on disconnect with exponential backoff
 *
 * Trade execution (market order) is handled by ExchangeEngine in NestJS API using trader's API key.
 * This worker is purely a price-monitoring and triggering layer.
 */

import WebSocket from 'ws';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const WORKER_SECRET = process.env.WORKER_SECRET || 'qis-internal-worker-secret-dev';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';
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
  exchange: string;
  pendingOrders: GridLevel[];
}

// ============================================================
// State: symbol → active price-monitoring subscriptions
// ============================================================
const subscriptions = new Map<string, WebSocket>();
const strategyMap = new Map<string, ActiveStrategy>();

// ============================================================
// Normalize pair symbol for Binance WebSocket stream
// "BTC/USDT" → "btcusdt"
// ============================================================
function toBinanceStreamSymbol(pair: string): string {
  return pair.replace('/', '').toLowerCase();
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
      console.warn('[Worker] Failed to fetch active strategies from API:', res.status);
      return [];
    }
    const json = (await res.json()) as any;
    return (json.data || json) as ActiveStrategy[];
  } catch (err: any) {
    console.warn('[Worker] API unreachable, will retry:', err.message);
    return [];
  }
}

// ============================================================
// Trigger market order for a grid level via NestJS API
// ============================================================
async function triggerGridOrder(orderId: string, triggeredPrice: number): Promise<void> {
  try {
    console.log(`[Worker] 🚀 Triggering grid order ${orderId} at price $${triggeredPrice}`);

    const res = await fetch(`${API_BASE_URL}/execution/trigger-order`, {
      method: 'POST',
      headers: WORKER_HEADERS,
      body: JSON.stringify({ orderId, triggeredPrice }),
    });

    if (res.ok) {
      console.log(`[Worker] ✅ Order ${orderId} triggered successfully.`);
    } else {
      const errText = await res.text();
      console.warn(`[Worker] ⚠️ Order trigger failed (${res.status}): ${errText}`);
    }
  } catch (err: any) {
    console.error(`[Worker] ❌ Failed to trigger order ${orderId}:`, err.message);
  }
}

// ============================================================
// Create Binance WebSocket Ticker Stream for a symbol
// ============================================================
function subscribeToSymbol(binanceSymbol: string, strategies: ActiveStrategy[]): void {
  if (subscriptions.has(binanceSymbol)) {
    console.log(`[Worker] Already subscribed to ${binanceSymbol.toUpperCase()}`);
    return;
  }

  const streamUrl = `${BINANCE_WS_BASE}/${binanceSymbol}@miniTicker`;
  console.log(`[Worker] 📡 Connecting to Binance WebSocket: ${streamUrl}`);

  let ws: WebSocket;
  let reconnectAttempts = 0;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const connect = () => {
    ws = new WebSocket(streamUrl);

    ws.on('open', () => {
      console.log(`[Worker] ✅ Connected to Binance stream for ${binanceSymbol.toUpperCase()}`);
      reconnectAttempts = 0;
      subscriptions.set(binanceSymbol, ws);

      // Heartbeat to keep WS alive
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const tick = JSON.parse(data.toString());
        // Mini ticker format: { e: "24hrMiniTicker", s: "BTCUSDT", c: "96450.00", ... }
        const currentPrice = parseFloat(tick.c);

        if (isNaN(currentPrice) || currentPrice <= 0) return;

        // Check all strategies for this symbol
        for (const strategy of strategies) {
          const stratSymbol = toBinanceStreamSymbol(strategy.symbol);
          if (stratSymbol !== binanceSymbol) continue;

          for (const order of strategy.pendingOrders) {
            // Level Crossing Rule: trigger BUY when price drops to or below grid level
            if (currentPrice <= order.gridPrice) {
              // Remove from pending to prevent double-trigger
              strategy.pendingOrders = strategy.pendingOrders.filter(
                (o) => o.orderId !== order.orderId
              );
              // Fire-and-forget async trigger
              triggerGridOrder(order.orderId, currentPrice);
            }
          }
        }
      } catch (parseErr) {
        // Ignore malformed tick data
      }
    });

    ws.on('error', (err) => {
      console.error(`[Worker] WebSocket error for ${binanceSymbol}:`, err.message);
    });

    ws.on('close', (code) => {
      console.warn(
        `[Worker] WebSocket closed for ${binanceSymbol} (code: ${code}). Reconnecting in ${RECONNECT_DELAY_MS}ms...`
      );

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      subscriptions.delete(binanceSymbol);
      reconnectAttempts++;

      const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttempts, 30_000);
      setTimeout(connect, delay);
    });
  };

  connect();
}

// ============================================================
// Main Worker Bootstrap
// ============================================================
async function main() {
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  🤖 Qis Background Worker — Binance Price Monitor       │');
  console.log('│  Real-time WebSocket stream → Grid Level Detection       │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`[Worker] API Base: ${API_BASE_URL}`);
  console.log(`[Worker] Binance WS Base: ${BINANCE_WS_BASE}`);
  console.log('');

  // Initial load of active strategies
  const strategies = await fetchActiveStrategies();

  if (strategies.length === 0) {
    console.log('[Worker] No active strategies found. Waiting for strategies to be deployed...');
    console.log('[Worker] Worker will poll for active strategies every 60s.');
  } else {
    console.log(`[Worker] Found ${strategies.length} active strategies. Setting up price monitors...`);

    // Group strategies by symbol and subscribe
    const symbolMap = new Map<string, ActiveStrategy[]>();
    for (const s of strategies) {
      strategyMap.set(s.strategyId, s);
      const bsym = toBinanceStreamSymbol(s.symbol);
      if (!symbolMap.has(bsym)) symbolMap.set(bsym, []);
      symbolMap.get(bsym)!.push(s);
    }

    for (const [binanceSymbol, stratsForSymbol] of symbolMap) {
      subscribeToSymbol(binanceSymbol, stratsForSymbol);
    }
  }

  // Poll API every 60s for newly deployed strategies
  setInterval(async () => {
    console.log('[Worker] 🔄 Refreshing active strategies from API...');
    const updatedStrategies = await fetchActiveStrategies();

    for (const strategy of updatedStrategies) {
      if (!strategyMap.has(strategy.strategyId)) {
        console.log(`[Worker] New strategy detected: ${strategy.strategyId} (${strategy.symbol})`);
        strategyMap.set(strategy.strategyId, strategy);

        const bsym = toBinanceStreamSymbol(strategy.symbol);
        subscribeToSymbol(bsym, [strategy]);
      }
    }
  }, 60_000);

  console.log('[Worker] 🟢 Worker running. Press Ctrl+C to stop.\n');
}

main().catch((err) => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});

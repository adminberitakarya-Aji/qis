// Qis Exchange Engine
//
// Secret Ownership Rule:
//   Only Exchange Engine may handle/receive decrypted secrets.
//   Business engines and API services call Exchange Engine methods with
//   ciphertext still encrypted. Decryption happens inside this module only.
//
// Responsibilities:
//   - REST API
//   - WebSocket (upstream to Binance/Bybit)
//   - Authentication (decryption of stored API credentials)
//   - Order Submission
// Contains no business logic.

import ccxt from 'ccxt';
import { ExchangeEngineCrypto, type DecryptContext } from './crypto.service';

export { ExchangeEngineCrypto, type DecryptContext } from './crypto.service';

export interface ExchangeBalanceItem {
  asset: string;
  free: number;
  used: number;
  total: number;
}

export interface ExchangeBalance {
  exchange: string;
  balances: ExchangeBalanceItem[];
  timestamp: number;
}

export interface MarketTicker {
  symbol: string;
  last: number;
  high: number;
  low: number;
  volume: number;
  change24hPercent: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface OrderExecutionParams {
  exchange: 'binance' | 'bybit';
  apiKey: string;
  apiSecret: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
  clientOrderId: string;
}

export interface OrderExecutionParamsEncrypted {
  exchange: 'binance' | 'bybit';
  encryptedApiKey: string;
  encryptedApiSecret: string;
  keyVersion: number;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
  clientOrderId: string;
  context?: DecryptContext;
}

export interface ExecutionOrderResult {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  status: 'closed' | 'open' | 'canceled';
  executedPrice: number;
  amount: number;
  filled: number;
  remaining: number;
  fee: number;
  feeAsset: string;
  timestamp: number;
}

export class ExchangeEngine {
  private readonly crypto: ExchangeEngineCrypto;

  constructor(crypto?: ExchangeEngineCrypto) {
    // Crypto is created internally if not injected. This keeps the engine
    // usable in unit tests with a mock and ensures the Master Key load
    // happens at engine construction time (fail-fast on missing env).
    this.crypto = crypto ?? new ExchangeEngineCrypto();
  }

  // ============================================================
  // Internal: builds a ccxt client from plaintext credentials.
  // Plaintext credentials must NEVER escape this method.
  // ============================================================
  private createCcxtClient(
    exchangeName: 'binance' | 'bybit',
    apiKey?: string,
    apiSecret?: string
  ): any {
    const norm = exchangeName.toLowerCase();
    const config: Record<string, any> = {
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
      },
    };

    if (apiKey && apiSecret) {
      config.apiKey = apiKey;
      config.secret = apiSecret;
    }

    if (norm === 'binance') {
      return new ccxt.binance(config);
    } else if (norm === 'bybit') {
      return new ccxt.bybit(config);
    } else {
      throw new Error(`Unsupported exchange: ${exchangeName}`);
    }
  }

  // ============================================================
  // Public Plaintext Methods
  //
  // These are retained for testing and for internal calls where the
  // caller already holds the decrypted secret (e.g. another Engine that
  // has itself received it through the *Encrypted methods below — but
  // note: NO engine other than Exchange Engine is supposed to call these
  // with plaintext). New business code should always use *Encrypted.
  // ============================================================

  /**
   * Validates API Key and Secret by attempting a lightweight API fetch.
   * Plaintext-only.
   */
  async testConnection(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string
  ): Promise<boolean> {
    try {
      const client = this.createCcxtClient(exchange, apiKey, apiSecret);
      await client.fetchBalance();
      return true;
    } catch (error: any) {
      console.error(`[ExchangeEngine] Connection test failed for ${exchange}:`, error.message);
      return false;
    }
  }

  async fetchBalance(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string
  ): Promise<ExchangeBalance> {
    const client = this.createCcxtClient(exchange, apiKey, apiSecret);
    const balanceResponse = await client.fetchBalance();
    const balances: ExchangeBalanceItem[] = [];

    if (balanceResponse.total) {
      for (const [asset, totalVal] of Object.entries(balanceResponse.total)) {
        const total = typeof totalVal === 'number' ? totalVal : 0;
        if (total > 0) {
          const freeVal = balanceResponse.free?.[asset];
          const usedVal = balanceResponse.used?.[asset];
          const free = typeof freeVal === 'number' ? freeVal : 0;
          const used = typeof usedVal === 'number' ? usedVal : 0;

          balances.push({
            asset,
            free,
            used,
            total,
          });
        }
      }
    }

    return {
      exchange,
      balances,
      timestamp: Date.now(),
    };
  }

  async fetchPairs(exchange: 'binance' | 'bybit'): Promise<string[]> {
    const client = this.createCcxtClient(exchange);
    const markets = await client.loadMarkets();
    return Object.values(markets)
      .filter((m: any) => m && m.spot && m.active)
      .map((m: any) => m.symbol as string);
  }

  async fetchTicker(exchange: 'binance' | 'bybit', pair: string): Promise<MarketTicker> {
    const client = this.createCcxtClient(exchange);
    const ticker = await client.fetchTicker(pair);

    return {
      symbol: pair,
      last: ticker.last ?? 0,
      high: ticker.high ?? 0,
      low: ticker.low ?? 0,
      volume: ticker.baseVolume ?? 0,
      change24hPercent: ticker.percentage ?? 0,
      bid: ticker.bid ?? 0,
      ask: ticker.ask ?? 0,
      timestamp: ticker.timestamp ?? Date.now(),
    };
  }

  async fetchOHLCV(
    exchange: 'binance' | 'bybit',
    pair: string,
    timeframe: string = '1h',
    limit: number = 100
  ): Promise<Candlestick[]> {
    const client = this.createCcxtClient(exchange);
    const ohlcv: number[][] = await client.fetchOHLCV(pair, timeframe, undefined, limit);
    return ohlcv.map((candle: number[]) => ({
      timestamp: candle[0] ?? 0,
      open: candle[1] ?? 0,
      high: candle[2] ?? 0,
      low: candle[3] ?? 0,
      close: candle[4] ?? 0,
      volume: candle[5] ?? 0,
    }));
  }

  async fetchOrderBook(
    exchange: 'binance' | 'bybit',
    pair: string,
    limit: number = 20
  ): Promise<OrderBook> {
    const client = this.createCcxtClient(exchange);
    const orderbook = await client.fetchOrderBook(pair, limit);
    return {
      symbol: pair,
      bids: (orderbook.bids || []).map((entry: number[]) => ({ price: entry[0], amount: entry[1] })),
      asks: (orderbook.asks || []).map((entry: number[]) => ({ price: entry[0], amount: entry[1] })),
      timestamp: orderbook.timestamp ?? Date.now(),
    };
  }

  async executeOrder(params: OrderExecutionParams): Promise<ExecutionOrderResult> {
    const { exchange, apiKey, apiSecret, symbol, side, amount, price, type = 'market', clientOrderId } = params;
    const client = this.createCcxtClient(exchange, apiKey, apiSecret);

    const order = await client.createOrder(
      symbol,
      type,
      side,
      amount,
      type === 'limit' ? price : undefined,
      { clientOrderId }
    );

    const executedPrice = order.average ?? order.price ?? price ?? 0;
    const feeCost = order.fee?.cost ?? 0;
    const feeCurrency = order.fee?.currency ?? '';

    return {
      id: order.id,
      clientOrderId: (order.clientOrderId as string) || clientOrderId,
      symbol,
      side,
      status: (order.status as any) || (type === 'limit' ? 'open' : 'closed'),
      executedPrice,
      amount: order.amount ?? amount,
      filled: order.filled ?? (type === 'market' ? amount : 0),
      remaining: order.remaining ?? (type === 'market' ? 0 : amount),
      fee: feeCost,
      feeAsset: feeCurrency,
      timestamp: order.timestamp ?? Date.now(),
    };
  }

  async fetchOrder(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<ExecutionOrderResult> {
    const client = this.createCcxtClient(exchange, apiKey, apiSecret);
    const order = await client.fetchOrder(id, symbol);

    return {
      id: order.id,
      clientOrderId: (order.clientOrderId as string) || id,
      symbol,
      side: order.side as 'buy' | 'sell',
      status: (order.status as any) || 'open',
      executedPrice: order.average ?? order.price ?? 0,
      amount: order.amount ?? 0,
      filled: order.filled ?? 0,
      remaining: order.remaining ?? 0,
      fee: order.fee?.cost ?? 0,
      feeAsset: order.fee?.currency ?? '',
      timestamp: order.timestamp ?? Date.now(),
    };
  }

  async cancelOrder(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<boolean> {
    try {
      const client = this.createCcxtClient(exchange, apiKey, apiSecret);
      await client.cancelOrder(id, symbol);
      return true;
    } catch (error: any) {
      console.error(`[ExchangeEngine] Failed to cancel order ${id}:`, error.message);
      return false;
    }
  }

  // ============================================================
  // Public *Encrypted Methods — PREFERRED for all business callers
  //
  // These accept the ciphertext blob + keyVersion and decrypt internally.
  // The plaintext is used only within this method scope, for the ccxt
  // request, and is never returned, logged, or passed back to the caller.
  // Per Secret Ownership Rule #5, ONLY this Engine may decrypt.
  // ============================================================

  async fetchBalanceEncrypted(
    exchange: 'binance' | 'bybit',
    encryptedApiKey: string,
    encryptedApiSecret: string,
    context?: DecryptContext
  ): Promise<ExchangeBalance> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.fetchBalance(exchange, apiKey, apiSecret);
  }

  async testConnectionEncrypted(
    exchange: 'binance' | 'bybit',
    encryptedApiKey: string,
    encryptedApiSecret: string,
    context?: DecryptContext
  ): Promise<boolean> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.testConnection(exchange, apiKey, apiSecret);
  }

  async executeOrderEncrypted(params: OrderExecutionParamsEncrypted): Promise<ExecutionOrderResult> {
    const apiKey = this.crypto.decrypt(params.encryptedApiKey, params.context);
    const apiSecret = this.crypto.decrypt(params.encryptedApiSecret, params.context);
    return this.executeOrder({
      exchange: params.exchange,
      apiKey,
      apiSecret,
      symbol: params.symbol,
      side: params.side,
      amount: params.amount,
      price: params.price,
      type: params.type,
      clientOrderId: params.clientOrderId,
    });
  }

  async fetchOrderEncrypted(
    exchange: 'binance' | 'bybit',
    encryptedApiKey: string,
    encryptedApiSecret: string,
    id: string,
    symbol: string,
    context?: DecryptContext
  ): Promise<ExecutionOrderResult> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.fetchOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  async cancelOrderEncrypted(
    exchange: 'binance' | 'bybit',
    encryptedApiKey: string,
    encryptedApiSecret: string,
    id: string,
    symbol: string,
    context?: DecryptContext
  ): Promise<boolean> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.cancelOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  /**
   * Encrypts a pair of API credentials for at-rest storage. Returns the
   * ciphertext blobs + their keyVersions ready to be written to the DB.
   *
   * Encryption is safe to expose to API services — the Master Key never
   * leaves this Engine, and the resulting ciphertext is useless without it.
   * Decryption, however, must only happen inside this Engine's *Encrypted
   * methods (see Secret Ownership Rule #5).
   */
  encryptCredentials(apiKey: string, apiSecret: string): {
    apiKeyEncrypted: string;
    apiKeyKeyVersion: number;
    apiSecretEncrypted: string;
    apiSecretKeyVersion: number;
  } {
    return {
      apiKeyEncrypted: this.crypto.encrypt(apiKey),
      apiKeyKeyVersion: this.crypto.getCurrentKeyVersion(),
      apiSecretEncrypted: this.crypto.encrypt(apiSecret),
      apiSecretKeyVersion: this.crypto.getCurrentKeyVersion(),
    };
  }
}

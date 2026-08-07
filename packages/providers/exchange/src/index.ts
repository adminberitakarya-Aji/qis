// Qis Exchange Provider Abstraction
//
// This module provides a provider-agnostic interface for exchange operations.
// It decouples the Exchange Engine from ccxt, enabling easier testing,
// future provider additions, and potential custom implementations.

import ccxt from 'ccxt';

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
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
  clientOrderId: string;
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

export type ExchangeName = 'binance' | 'bybit';

// ============================================================
// ExchangeProvider Interface
// ============================================================

export interface ExchangeProvider {
  readonly name: ExchangeName;
  readonly isConfigured: boolean;

  // Public (unauthenticated) methods
  fetchPairs(): Promise<string[]>;
  fetchTicker(pair: string): Promise<MarketTicker>;
  fetchOHLCV(pair: string, timeframe?: string, limit?: number): Promise<Candlestick[]>;
  fetchOrderBook(pair: string, limit?: number): Promise<OrderBook>;

  // Authenticated methods
  testConnection(): Promise<boolean>;
  fetchBalance(): Promise<ExchangeBalance>;
  executeOrder(params: OrderExecutionParams): Promise<ExecutionOrderResult>;
  fetchOrder(id: string, symbol: string): Promise<ExecutionOrderResult>;
  cancelOrder(id: string, symbol: string): Promise<boolean>;

  // Configuration
  setCredentials(apiKey: string, apiSecret: string): void;
  clearCredentials(): void;
}

// ============================================================
// Base Provider with ccxt common logic
// ============================================================

abstract class BaseExchangeProvider implements ExchangeProvider {
  protected client: any;
  protected _isConfigured = false;

  abstract readonly name: ExchangeName;

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  protected abstract createClient(config: Record<string, any>): any;

  protected buildConfig(apiKey?: string, apiSecret?: string): Record<string, any> {
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

    return config;
  }

  setCredentials(apiKey: string, apiSecret: string): void {
    this.client = this.createClient(this.buildConfig(apiKey, apiSecret));
    this._isConfigured = true;
  }

  clearCredentials(): void {
    this.client = this.createClient(this.buildConfig());
    this._isConfigured = false;
  }

  // Public methods (unauthenticated)
  async fetchPairs(): Promise<string[]> {
    this.ensureClient();
    const markets = await this.client.loadMarkets();
    return Object.values(markets)
      .filter((m: any) => m && m.spot && m.active)
      .map((m: any) => m.symbol as string);
  }

  async fetchTicker(pair: string): Promise<MarketTicker> {
    this.ensureClient();
    const ticker = await this.client.fetchTicker(pair);
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
    pair: string,
    timeframe: string = '1h',
    limit: number = 100
  ): Promise<Candlestick[]> {
    this.ensureClient();
    const ohlcv: number[][] = await this.client.fetchOHLCV(pair, timeframe, undefined, limit);
    return ohlcv.map((candle: number[]) => ({
      timestamp: candle[0] ?? 0,
      open: candle[1] ?? 0,
      high: candle[2] ?? 0,
      low: candle[3] ?? 0,
      close: candle[4] ?? 0,
      volume: candle[5] ?? 0,
    }));
  }

  async fetchOrderBook(pair: string, limit: number = 20): Promise<OrderBook> {
    this.ensureClient();
    const orderbook = await this.client.fetchOrderBook(pair, limit);
    return {
      symbol: pair,
      bids: (orderbook.bids || []).map((entry: number[]) => ({ price: entry[0], amount: entry[1] })),
      asks: (orderbook.asks || []).map((entry: number[]) => ({ price: entry[0], amount: entry[1] })),
      timestamp: orderbook.timestamp ?? Date.now(),
    };
  }

  // Authenticated methods
  async testConnection(): Promise<boolean> {
    this.ensureConfigured();
    try {
      await this.client.fetchBalance();
      return true;
    } catch (error: any) {
      console.error(`[${this.name}] Connection test failed:`, error.message);
      return false;
    }
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    this.ensureConfigured();
    const balanceResponse = await this.client.fetchBalance();
    const balances: ExchangeBalanceItem[] = [];

    if (balanceResponse.total) {
      for (const [asset, totalVal] of Object.entries(balanceResponse.total)) {
        const total = typeof totalVal === 'number' ? totalVal : 0;
        if (total > 0) {
          const freeVal = balanceResponse.free?.[asset];
          const usedVal = balanceResponse.used?.[asset];
          const free = typeof freeVal === 'number' ? freeVal : 0;
          const used = typeof usedVal === 'number' ? usedVal : 0;

          balances.push({ asset, free, used, total });
        }
      }
    }

    return {
      exchange: this.name,
      balances,
      timestamp: Date.now(),
    };
  }

  async executeOrder(params: OrderExecutionParams): Promise<ExecutionOrderResult> {
    this.ensureConfigured();
    const { symbol, side, amount, price, type = 'market', clientOrderId } = params;

    const order = await this.client.createOrder(
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

  async fetchOrder(id: string, symbol: string): Promise<ExecutionOrderResult> {
    this.ensureConfigured();
    const order = await this.client.fetchOrder(id, symbol);

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

  async cancelOrder(id: string, symbol: string): Promise<boolean> {
    this.ensureConfigured();
    try {
      await this.client.cancelOrder(id, symbol);
      return true;
    } catch (error: any) {
      console.error(`[${this.name}] Failed to cancel order ${id}:`, error.message);
      return false;
    }
  }

  protected ensureClient(): void {
    if (!this.client) {
      this.client = this.createClient(this.buildConfig());
    }
  }

  protected ensureConfigured(): void {
    if (!this._isConfigured) {
      throw new Error(`${this.name} provider is not configured with API credentials`);
    }
  }
}

// ============================================================
// Binance Provider
// ============================================================

export class BinanceProvider extends BaseExchangeProvider {
  readonly name: ExchangeName = 'binance';

  protected createClient(config: Record<string, any>): any {
    return new ccxt.binance(config);
  }
}

// ============================================================
// Bybit Provider
// ============================================================

export class BybitProvider extends BaseExchangeProvider {
  readonly name: ExchangeName = 'bybit';

  protected createClient(config: Record<string, any>): any {
    return new ccxt.bybit(config);
  }
}

// ============================================================
// Provider Factory
// ============================================================

export function createExchangeProvider(name: ExchangeName): ExchangeProvider {
  switch (name) {
    case 'binance':
      return new BinanceProvider();
    case 'bybit':
      return new BybitProvider();
    default:
      throw new Error(`Unsupported exchange: ${name}`);
  }
}

// ============================================================
// Multi-Exchange Manager (for concurrent multi-exchange operations)
// ============================================================

export class ExchangeManager {
  private providers: Map<ExchangeName, ExchangeProvider> = new Map();

  getProvider(name: ExchangeName): ExchangeProvider {
    let provider = this.providers.get(name);
    if (!provider) {
      provider = createExchangeProvider(name);
      this.providers.set(name, provider);
    }
    return provider;
  }

  async testConnection(name: ExchangeName, apiKey: string, apiSecret: string): Promise<boolean> {
    const provider = this.getProvider(name);
    provider.setCredentials(apiKey, apiSecret);
    return provider.testConnection();
  }

  async fetchBalance(name: ExchangeName, apiKey: string, apiSecret: string): Promise<ExchangeBalance> {
    const provider = this.getProvider(name);
    provider.setCredentials(apiKey, apiSecret);
    return provider.fetchBalance();
  }

  // Unauthenticated methods
  async fetchPairs(name: ExchangeName): Promise<string[]> {
    const provider = this.getProvider(name);
    return provider.fetchPairs();
  }

  async fetchTicker(name: ExchangeName, pair: string): Promise<MarketTicker> {
    const provider = this.getProvider(name);
    return provider.fetchTicker(pair);
  }

  async fetchOHLCV(
    name: ExchangeName,
    pair: string,
    timeframe?: string,
    limit?: number
  ): Promise<Candlestick[]> {
    const provider = this.getProvider(name);
    return provider.fetchOHLCV(pair, timeframe, limit);
  }

  async fetchOrderBook(name: ExchangeName, pair: string, limit?: number): Promise<OrderBook> {
    const provider = this.getProvider(name);
    return provider.fetchOrderBook(pair, limit);
  }

  // Authenticated order methods
  async executeOrder(
    name: ExchangeName,
    apiKey: string,
    apiSecret: string,
    params: OrderExecutionParams
  ): Promise<ExecutionOrderResult> {
    const provider = this.getProvider(name);
    provider.setCredentials(apiKey, apiSecret);
    return provider.executeOrder(params);
  }

  async fetchOrder(
    name: ExchangeName,
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<ExecutionOrderResult> {
    const provider = this.getProvider(name);
    provider.setCredentials(apiKey, apiSecret);
    return provider.fetchOrder(id, symbol);
  }

  async cancelOrder(
    name: ExchangeName,
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<boolean> {
    const provider = this.getProvider(name);
    provider.setCredentials(apiKey, apiSecret);
    return provider.cancelOrder(id, symbol);
  }

  clearAllCredentials(): void {
    for (const provider of this.providers.values()) {
      provider.clearCredentials();
    }
  }
}

// Singleton instance
export const exchangeManager = new ExchangeManager();
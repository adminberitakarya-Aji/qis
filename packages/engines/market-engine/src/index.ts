// Qis Market Engine
// Responsible for fetching, formatting, and presenting market data.
// Only provides market data (candlesticks, orderbook, volume, statistics).

import { ExchangeEngine, Candlestick, MarketTicker, OrderBook } from '@qis/exchange-engine';

export interface MarketStatistics {
  symbol: string;
  exchange: string;
  price: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24hPercent: number;
  volatilityPercent: number;
}

export class MarketEngine {
  constructor(private exchangeEngine: ExchangeEngine = new ExchangeEngine()) {}

  /**
   * Retrieves supported market trading pairs for an exchange.
   */
  async getMarketList(exchange: 'binance' | 'bybit'): Promise<string[]> {
    return this.exchangeEngine.fetchPairs(exchange);
  }

  /**
   * Retrieves ticker info for a pair.
   */
  async getTicker(exchange: 'binance' | 'bybit', symbol: string): Promise<MarketTicker> {
    return this.exchangeEngine.fetchTicker(exchange, symbol);
  }

  /**
   * Retrieves candlestick historical data.
   */
  async getCandlesticks(
    exchange: 'binance' | 'bybit',
    symbol: string,
    timeframe: string = '1h',
    limit: number = 100
  ): Promise<Candlestick[]> {
    return this.exchangeEngine.fetchOHLCV(exchange, symbol, timeframe, limit);
  }

  /**
   * Retrieves orderbook depth.
   */
  async getOrderBook(
    exchange: 'binance' | 'bybit',
    symbol: string,
    limit: number = 20
  ): Promise<OrderBook> {
    return this.exchangeEngine.fetchOrderBook(exchange, symbol, limit);
  }

  /**
   * Calculates market statistics including estimated volatility from recent candles.
   */
  async getMarketStats(
    exchange: 'binance' | 'bybit',
    symbol: string
  ): Promise<MarketStatistics> {
    const ticker = await this.getTicker(exchange, symbol);
    const candles = await this.getCandlesticks(exchange, symbol, '1h', 24);

    let volatilityPercent = 0;
    if (candles.length > 0) {
      const highest = Math.max(...candles.map((c) => c.high));
      const lowest = Math.min(...candles.map((c) => c.low));
      if (lowest > 0) {
        volatilityPercent = ((highest - lowest) / lowest) * 100;
      }
    }

    return {
      symbol,
      exchange,
      price: ticker.last,
      high24h: ticker.high,
      low24h: ticker.low,
      volume24h: ticker.volume,
      change24hPercent: ticker.change24hPercent,
      volatilityPercent: Math.round(volatilityPercent * 100) / 100,
    };
  }
}

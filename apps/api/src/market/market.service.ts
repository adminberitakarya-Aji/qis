import { Injectable } from '@nestjs/common';
import { MarketEngine, type MarketStatistics } from '@qis/market-engine';
import type { Candlestick, MarketTicker, OrderBook } from '@qis/exchange-engine';

@Injectable()
export class MarketService {
  private marketEngine = new MarketEngine();

  async getMarketList(exchange: 'binance' | 'bybit'): Promise<string[]> {
    return await this.marketEngine.getMarketList(exchange);
  }

  async getTicker(exchange: 'binance' | 'bybit', symbol: string): Promise<MarketTicker> {
    return await this.marketEngine.getTicker(exchange, symbol);
  }

  async getCandlesticks(
    exchange: 'binance' | 'bybit',
    symbol: string,
    timeframe: string = '1h',
    limit: number = 100
  ): Promise<Candlestick[]> {
    return await this.marketEngine.getCandlesticks(exchange, symbol, timeframe, limit);
  }

  async getOrderBook(
    exchange: 'binance' | 'bybit',
    symbol: string,
    limit: number = 20
  ): Promise<OrderBook> {
    return await this.marketEngine.getOrderBook(exchange, symbol, limit);
  }

  async getMarketStats(
    exchange: 'binance' | 'bybit',
    symbol: string
  ): Promise<MarketStatistics> {
    return await this.marketEngine.getMarketStats(exchange, symbol);
  }
}

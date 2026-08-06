import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MarketService } from './market.service';

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('list')
  async getList(@Query('exchange') exchange: 'binance' | 'bybit' = 'binance') {
    const data = await this.marketService.getMarketList(exchange);
    return {
      success: true,
      message: 'Supported market trading pairs fetched successfully',
      data,
    };
  }

  @Get('ticker')
  async getTicker(
    @Query('exchange') exchange: 'binance' | 'bybit' = 'binance',
    @Query('symbol') symbol: string = 'BTC/USDT'
  ) {
    const data = await this.marketService.getTicker(exchange, symbol);
    return {
      success: true,
      message: 'Market ticker data fetched successfully',
      data,
    };
  }

  @Get('candlestick')
  async getCandlestick(
    @Query('exchange') exchange: 'binance' | 'bybit' = 'binance',
    @Query('symbol') symbol: string = 'BTC/USDT',
    @Query('timeframe') timeframe: string = '1h',
    @Query('limit') limit: number = 100
  ) {
    const data = await this.marketService.getCandlesticks(exchange, symbol, timeframe, Number(limit));
    return {
      success: true,
      message: 'Candlestick OHLCV data fetched successfully',
      data,
    };
  }

  @Get('orderbook')
  async getOrderBook(
    @Query('exchange') exchange: 'binance' | 'bybit' = 'binance',
    @Query('symbol') symbol: string = 'BTC/USDT',
    @Query('limit') limit: number = 20
  ) {
    const data = await this.marketService.getOrderBook(exchange, symbol, Number(limit));
    return {
      success: true,
      message: 'Orderbook depth fetched successfully',
      data,
    };
  }

  @Get('stats')
  async getStats(
    @Query('exchange') exchange: 'binance' | 'bybit' = 'binance',
    @Query('symbol') symbol: string = 'BTC/USDT'
  ) {
    const data = await this.marketService.getMarketStats(exchange, symbol);
    return {
      success: true,
      message: 'Market statistics fetched successfully',
      data,
    };
  }
}

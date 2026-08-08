import { Injectable } from '@nestjs/common';
import { BacktestEngine, type BacktestResult } from '@qis/backtest-engine';
import { PrismaService } from '../prisma/prisma.service';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Injectable()
export class BacktestService {
  private backtestEngine = new BacktestEngine();

  constructor(private prisma: PrismaService) {}

  /**
   * Runs a synchronous backtest and returns the full result.
   *
   * Per ROADMAP.md Phase 1.1:
   * - One synchronous POST /api/v1/backtest/run endpoint returning a full result
   * - Skip the async job/status/report three-endpoint split until a backtest
   *   run is slow enough to need it
   */
  async runBacktest(dto: RunBacktestDto): Promise<BacktestResult> {
    const result = await this.backtestEngine.runBacktest({
      exchange: dto.exchange,
      pair: dto.pair,
      tradingCapital: dto.tradingCapital,
      sections: dto.sections.map((s) => ({
        index: s.index,
        allocationPercent: s.allocationPercent,
        gridCount: s.gridCount,
        gridDistancePercent: s.gridDistancePercent,
        sectionGapPercent: s.sectionGapPercent,
        minNetProfitPercent: s.minNetProfitPercent,
      })),
      buyFeePercent: dto.buyFeePercent,
      sellFeePercent: dto.sellFeePercent,
      estimatedSlippagePercent: dto.estimatedSlippagePercent,
      candleLimit: dto.candleLimit,
      timeframe: dto.timeframe,
      maxCapitalPerMovementPercent: dto.maxCapitalPerMovementPercent,
    });

    // Persist the ingested candles to the HistoricalCandle table.
    // This is the "Historical OHLCV ingestion" step from ROADMAP.md 1.1.
    // We persist the candles that were actually used in the backtest so
    // future backtests can reuse them without re-fetching from the exchange.
    await this.persistCandles(dto);

    return result;
  }

  /**
   * Persists the candles used in a backtest to the HistoricalCandle table.
   * Uses upsert to avoid duplicate rows on re-ingestion (unique constraint
   * on exchange + pair + timeframe + timestamp).
   */
  private async persistCandles(dto: RunBacktestDto): Promise<void> {
    // The backtest engine fetches candles internally; we don't have direct
    // access to them here. Instead, we re-fetch via the engine's ingestion
    // method so the candles are persisted for future reuse.
    try {
      const candles = await this.backtestEngine.ingestHistoricalCandles(
        dto.exchange,
        dto.pair,
        dto.timeframe ?? '1h',
        dto.candleLimit ?? 500
      );

      for (const candle of candles) {
        await this.prisma.historicalCandle.upsert({
          where: {
            exchange_pair_timeframe_timestamp: {
              exchange: dto.exchange,
              pair: dto.pair,
              timeframe: dto.timeframe ?? '1h',
              timestamp: new Date(candle.timestamp),
            },
          },
          update: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          },
          create: {
            exchange: dto.exchange,
            pair: dto.pair,
            timeframe: dto.timeframe ?? '1h',
            timestamp: new Date(candle.timestamp),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          },
        });
      }
    } catch (err: any) {
      // Persistence is best-effort — a backtest result is still valid even
      // if candle storage fails (e.g. DB unavailable). Log and continue.
      console.warn(`[BacktestService] Failed to persist historical candles: ${err.message}`);
    }
  }
}
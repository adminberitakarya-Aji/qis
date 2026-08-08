import { describe, it, expect, vi } from 'vitest';
import { BacktestEngine, type BacktestCandle } from './index';
import { GridEngine } from '@qis/grid-engine';
import { MarketEngine } from '@qis/market-engine';

describe('BacktestEngine', () => {
  // We inject mocks for the grid and market engines to avoid requiring
  // real exchange connections or the ENCRYPTION_KEY env var.
  const gridEngine = new GridEngine();
  const marketEngine = {
    getCandlesticks: vi.fn(),
  } as unknown as MarketEngine;

  const engine = new BacktestEngine(gridEngine, marketEngine);

  const sections = [
    { index: 0, allocationPercent: 50, gridCount: 3, gridDistancePercent: 1.0, sectionGapPercent: 2.0, minNetProfitPercent: 0.5 },
    { index: 1, allocationPercent: 50, gridCount: 2, gridDistancePercent: 1.0, sectionGapPercent: 3.0, minNetProfitPercent: 0.8 },
  ];

  // Generate a synthetic uptrend then downtrend so buys and sells both occur
  function makeCandles(count: number): BacktestCandle[] {
    const candles: BacktestCandle[] = [];
    const startTime = 1700000000000;
    for (let i = 0; i < count; i++) {
      const base = 100 + Math.sin(i / 5) * 5;
      candles.push({
        timestamp: startTime + i * 3600_000,
        open: base,
        high: base + 1,
        low: base - 1,
        close: base,
        volume: 1000,
      });
    }
    return candles;
  }

  describe('runBacktest', () => {
    it('returns a full result with equity curve and metrics', async () => {
      const candles = makeCandles(200);
      const result = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
      });

      expect(result.exchange).toBe('binance');
      expect(result.pair).toBe('BTC/USDT');
      expect(result.candlesCount).toBe(200);
      expect(result.totalCapital).toBe(10000);
      expect(result.equityCurve).toHaveLength(200);
      expect(result.grid.totalOrderCount).toBe(5);
      expect(result.grid.lowestGridPrice).toBeLessThan(result.grid.highestGridPrice);
      expect(result.totalTrades).toBeGreaterThan(0);
      expect(result.winRatePercent).toBeGreaterThanOrEqual(0);
      expect(result.winRatePercent).toBeLessThanOrEqual(100);
      expect(result.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    });

    it('models fees and slippage in the result', async () => {
      const candles = makeCandles(200);
      const result = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
        buyFeePercent: 0.1,
        sellFeePercent: 0.1,
        estimatedSlippagePercent: 0.05,
      });

      expect(result.totalFeesUsdt).toBeGreaterThan(0);
      // Every trade should have buy and sell fees recorded
      for (const trade of result.trades) {
        expect(trade.buyFee).toBeGreaterThan(0);
        expect(trade.sellFee).toBeGreaterThan(0);
        expect(trade.buyPrice).toBeGreaterThan(trade.gridPrice); // slippage adds to buy
        expect(trade.sellPrice).toBeLessThan(trade.gridPrice * 1.1); // TP with slippage
      }
    });

    it('throws when no candles are available', async () => {
      // Mock the market engine to return empty array so the "no candles" path is hit
      (marketEngine.getCandlesticks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await expect(
        engine.runBacktest({
          exchange: 'binance',
          pair: 'BTC/USDT',
          tradingCapital: 10000,
          sections,
          // Don't pass candles — let it try to fetch from market engine
        })
      ).rejects.toThrow('No candles available for backtest');
    });

    it('handles a flat market with no trades', async () => {
      const candles: BacktestCandle[] = Array.from({ length: 50 }).map((_, i) => ({
        timestamp: 1700000000000 + i * 3600_000,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      }));

      const result = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
      });

      expect(result.totalTrades).toBe(0);
      expect(result.netProfitUsdt).toBe(0);
      expect(result.winRatePercent).toBe(0);
      expect(result.equityCurve).toHaveLength(50);
    });
  });

  describe('Capital Protection on Gaps', () => {
    // A single crash candle whose low drops far enough to cross every grid
    // level at once (all 5 levels across both sections).
    function makeCrashCandles(): BacktestCandle[] {
      return [
        // First candle establishes the reference price the grid is built from.
        { timestamp: 1700000000000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        // Second candle crashes hard enough to cross every grid level.
        { timestamp: 1700003600000, open: 100, high: 100, low: 50, close: 60, volume: 5000 },
      ];
    }

    it('permanently skips levels beyond maxCapitalPerMovementPercent instead of filling all of them', async () => {
      const candles = makeCrashCandles();

      const unprotected = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
        maxCapitalPerMovementPercent: 100, // effectively no cap
      });

      const protectedResult = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
        maxCapitalPerMovementPercent: 20, // tight cap — only a couple of levels fit
      });

      // Without a meaningful cap, the crash candle should fill every level
      // it crosses in one shot.
      expect(unprotected.gapProtectionSkippedCount).toBe(0);

      // With a tight cap, some levels crossed by the same candle must be
      // left unfilled rather than all executed at once.
      expect(protectedResult.gapProtectionSkippedCount).toBeGreaterThan(0);

      // The protected run must never deploy more buy-side capital in that
      // single crossing than the configured budget allows.
      const totalBoughtGridsProtected = protectedResult.grid.totalOrderCount - protectedResult.gapProtectionSkippedCount;
      expect(totalBoughtGridsProtected).toBeLessThan(unprotected.grid.totalOrderCount);
    });

    it('never retries a gap-skipped level later, even if price stays below it', async () => {
      // After the crash, price stays low for many candles — if skipped
      // levels were retried, they'd eventually all fill. Production never
      // retries them (the worker abandons a crossed-but-skipped level), so
      // the backtest must match: gapProtectionSkippedCount should reflect
      // only the ONE crossing event, not grow further as price lingers low.
      const candles = makeCrashCandles();
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: 1700003600000 + (i + 1) * 3600_000,
          open: 60,
          high: 61,
          low: 59,
          close: 60,
          volume: 1000,
        });
      }

      const result = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles,
        maxCapitalPerMovementPercent: 20,
      });

      const skippedAtCrash = result.gapProtectionSkippedCount;
      expect(skippedAtCrash).toBeGreaterThan(0);

      // Re-run with the lingering-low candles removed (crash candle only)
      // to confirm the skip count is identical — proving the later candles
      // (where low=59, still below the skipped levels' grid prices) did not
      // cause any additional skip/fill activity for those same levels.
      const crashOnly = await engine.runBacktest({
        exchange: 'binance',
        pair: 'BTC/USDT',
        tradingCapital: 10000,
        sections,
        candles: candles.slice(0, 2),
        maxCapitalPerMovementPercent: 20,
      });

      expect(crashOnly.gapProtectionSkippedCount).toBe(skippedAtCrash);
    });
  });

  describe('ingestHistoricalCandles', () => {
    it('fetches candles from the market engine', async () => {
      const mockCandles = [
        { timestamp: 1700000000000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 1700003600000, open: 100, high: 102, low: 98, close: 101, volume: 1000 },
      ];
      (marketEngine.getCandlesticks as ReturnType<typeof vi.fn>).mockResolvedValue(mockCandles);

      const candles = await engine.ingestHistoricalCandles('binance', 'BTC/USDT', '1h', 2);
      expect(candles).toHaveLength(2);
      expect(candles[0].timestamp).toBe(1700000000000);
      expect(candles[0].close).toBe(100);
      expect(marketEngine.getCandlesticks).toHaveBeenCalledWith('binance', 'BTC/USDT', '1h', 2);
    });
  });
});
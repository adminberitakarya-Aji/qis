// Qis Backtest Engine
// Responsible for:
// - Historical OHLCV ingestion (reusing @qis/market-engine's exchange fetch)
// - Candle-close simulation (not tick-level replay yet)
// - Modeling exchange fees and a fixed slippage assumption
// - Producing a full backtest result (equity curve, max drawdown, win rate, net profit)
//
// Per ROADMAP.md Phase 1.1:
// - Reuses @qis/grid-engine's existing price-crossing logic directly
// - Funding rates, partial fills, and latency simulation are Phase 2+ refinements

import { GridEngine } from '@qis/grid-engine';
import { MarketEngine } from '@qis/market-engine';
import type { Blueprint, GridSection } from '@qis/shared';

// ============================================================
// Types
// ============================================================

export interface BacktestCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestInput {
  exchange: 'binance' | 'bybit';
  pair: string;
  tradingCapital: number;
  sections: GridSection[];
  // Fee & slippage assumptions (defaults match production grid-engine defaults)
  buyFeePercent?: number; // default 0.1%
  sellFeePercent?: number; // default 0.1%
  estimatedSlippagePercent?: number; // default 0.05%
  // Optional: pre-fetched candles. If not provided, the engine fetches from the exchange.
  candles?: BacktestCandle[];
  // Optional: number of candles to fetch if candles are not provided
  candleLimit?: number; // default 500
  timeframe?: string; // default '1h'
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPercent: number;
}

export interface BacktestTrade {
  gridPrice: number;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  buyFee: number;
  sellFee: number;
  netProfitUsdt: number;
  netProfitPercent: number;
  buyTimestamp: number;
  sellTimestamp: number;
}

export interface BacktestResult {
  exchange: string;
  pair: string;
  timeframe: string;
  candlesCount: number;
  totalCapital: number;
  // Performance metrics
  netProfitUsdt: number;
  netProfitPercent: number;
  maxDrawdownPercent: number;
  winRatePercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalFeesUsdt: number;
  // Outputs
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
  // Grid info
  grid: {
    totalOrderCount: number;
    lowestGridPrice: number;
    highestGridPrice: number;
  };
}

// ============================================================
// Backtest Engine
// ============================================================

export class BacktestEngine {
  constructor(
    private gridEngine: GridEngine = new GridEngine(),
    private marketEngine: MarketEngine = new MarketEngine()
  ) {}

  /**
   * Ingests historical OHLCV candles from the exchange and returns them.
   * This is the ingestion step — the caller (API service) persists them
   * to the HistoricalCandle table.
   */
  async ingestHistoricalCandles(
    exchange: 'binance' | 'bybit',
    pair: string,
    timeframe: string = '1h',
    limit: number = 500
  ): Promise<BacktestCandle[]> {
    const candles = await this.marketEngine.getCandlesticks(exchange, pair, timeframe, limit) ?? [];
    return candles.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  /**
   * Runs a full backtest simulation against historical candles.
   *
   * Uses candle-close simulation (not tick-level replay):
   * - For each candle, checks if the low crosses any pending grid BUY level
   * - If a buy is held, checks if the high crosses the TP price
   * - Models exchange fees (buy + sell) and a fixed slippage assumption
   */
  async runBacktest(input: BacktestInput): Promise<BacktestResult> {
    const {
      exchange,
      pair,
      tradingCapital,
      sections,
      buyFeePercent = 0.1,
      sellFeePercent = 0.1,
      estimatedSlippagePercent = 0.05,
      candleLimit = 500,
      timeframe = '1h',
    } = input;

    // 1. Get candles (either provided or fetched from exchange)
    let candles = input.candles;
    if (!candles || candles.length === 0) {
      candles = await this.ingestHistoricalCandles(exchange, pair, timeframe, candleLimit);
      if (!candles) {
        candles = [];
      }
    }

    if (candles.length === 0) {
      throw new Error('No candles available for backtest');
    }

    // 2. Build the grid using the first candle's close as the reference price
    //    (same as production: grid is built at strategy start)
    const firstCandlePrice = candles[0].close;
    const gridBuildResult = this.gridEngine.buildGrid({
      currentPrice: firstCandlePrice,
      totalCapital: tradingCapital,
      buyFeePercent,
      sellFeePercent,
      estimatedSlippagePercent,
      sections: sections.map((s) => ({
        allocationPercent: s.allocationPercent,
        gridCount: s.gridCount,
        gridDistancePercent: s.gridDistancePercent,
        sectionGapPercent: s.sectionGapPercent,
        minNetProfitPercent: s.minNetProfitPercent,
      })),
    });

    // 3. Initialize order states (same price-crossing logic as production)
    const orderStates = gridBuildResult.sections.flatMap((s) =>
      s.orders.map((o) => ({
        ...o,
        isHolding: false,
        buyPrice: 0,
        buyTimestamp: 0,
        buyFee: 0,
        quantity: 0,
      }))
    );

    // 4. Simulate candle-by-candle
    let netProfit = 0;
    let totalFees = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let peakEquity = tradingCapital;
    let maxDrawdown = 0;
    const equityCurve: BacktestEquityPoint[] = [];
    const trades: BacktestTrade[] = [];

    for (const candle of candles) {
      let currentEquity = tradingCapital + netProfit;

      for (const order of orderStates) {
        // BUY fill: candle low crosses or touches grid level price
        if (!order.isHolding && candle.low <= order.gridPrice) {
          // Apply slippage: buy executes at grid price + slippage
          const buyPrice = order.gridPrice * (1 + estimatedSlippagePercent / 100);
          const buyFee = order.allocatedCapitalUsdt * (buyFeePercent / 100);
          order.isHolding = true;
          order.buyPrice = buyPrice;
          order.buyTimestamp = candle.timestamp;
          order.buyFee = buyFee;
          order.quantity = order.allocatedCapitalUsdt / buyPrice;
          totalFees += buyFee;
          totalTrades++;
        }

        // SELL fill: candle high crosses or touches Take Profit price
        if (order.isHolding && candle.high >= order.estimatedTpPrice) {
          // Apply slippage: sell executes at TP price - slippage
          const sellPrice = order.estimatedTpPrice * (1 - estimatedSlippagePercent / 100);
          const sellProceeds = order.quantity * sellPrice;
          const sellFee = sellProceeds * (sellFeePercent / 100);
          const buyCost = order.allocatedCapitalUsdt + order.buyFee;
          const profitRound = sellProceeds - sellFee - buyCost;

          netProfit += profitRound;
          totalFees += sellFee;
          totalTrades++;

          if (profitRound > 0) winningTrades++;
          else losingTrades++;

          trades.push({
            gridPrice: order.gridPrice,
            buyPrice: order.buyPrice,
            sellPrice,
            quantity: order.quantity,
            buyFee: order.buyFee,
            sellFee,
            netProfitUsdt: Number(profitRound.toFixed(6)),
            netProfitPercent: Number(((profitRound / order.allocatedCapitalUsdt) * 100).toFixed(4)),
            buyTimestamp: order.buyTimestamp,
            sellTimestamp: candle.timestamp,
          });

          order.isHolding = false;
        }

        // Calculate unrealized drawdown for held positions
        if (order.isHolding) {
          const unrealizedLoss = order.allocatedCapitalUsdt * ((candle.close - order.buyPrice) / order.buyPrice);
          currentEquity += unrealizedLoss;
        }
      }

      // Track equity curve and max drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }

      equityCurve.push({
        timestamp: candle.timestamp,
        equity: Number(currentEquity.toFixed(6)),
        drawdownPercent: Number(dd.toFixed(4)),
      });
    }

    // 5. Compute final metrics
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const netProfitPercent = tradingCapital > 0 ? (netProfit / tradingCapital) * 100 : 0;

    return {
      exchange,
      pair,
      timeframe,
      candlesCount: candles.length,
      totalCapital: tradingCapital,
      netProfitUsdt: Number(netProfit.toFixed(6)),
      netProfitPercent: Number(netProfitPercent.toFixed(4)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(4)),
      winRatePercent: Number(winRate.toFixed(2)),
      totalTrades,
      winningTrades,
      losingTrades,
      totalFeesUsdt: Number(totalFees.toFixed(6)),
      equityCurve,
      trades,
      grid: {
        totalOrderCount: gridBuildResult.totalOrderCount,
        lowestGridPrice: gridBuildResult.lowestGridPrice,
        highestGridPrice: gridBuildResult.highestGridPrice,
      },
    };
  }

  /**
   * Convenience method: run a backtest directly from a Blueprint.
   * The blueprint's sections are used to build the grid.
   */
  async runBacktestFromBlueprint(
    blueprint: Blueprint,
    options?: {
      candles?: BacktestCandle[];
      candleLimit?: number;
      timeframe?: string;
      buyFeePercent?: number;
      sellFeePercent?: number;
      estimatedSlippagePercent?: number;
    }
  ): Promise<BacktestResult> {
    return this.runBacktest({
      exchange: blueprint.exchange,
      pair: blueprint.pair,
      tradingCapital: blueprint.tradingCapital,
      sections: blueprint.sections,
      candles: options?.candles,
      candleLimit: options?.candleLimit,
      timeframe: options?.timeframe,
      buyFeePercent: options?.buyFeePercent,
      sellFeePercent: options?.sellFeePercent,
      estimatedSlippagePercent: options?.estimatedSlippagePercent,
    });
  }
}
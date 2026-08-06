// Qis Strategy Engine
// Responsible for:
// - Generating Strategy Blueprints
// - Validating Blueprints
// - Simulating Strategy Blueprints against OHLCV Candles

import { AiEngine } from '@qis/ai-engine';
import { validateBlueprint, DEFAULT_VALIDITY_WINDOW_MINUTES } from '@qis/core';
import { GridEngine } from '@qis/grid-engine';
import { MarketEngine } from '@qis/market-engine';
import type { Blueprint, GridSection } from '@qis/shared';

export interface BuildStrategyInput {
  exchange: 'binance' | 'bybit';
  pair: string;
  capital: number;
  sectionCount: 1 | 2 | 3;
  capitalAllocationPercent?: number[]; // e.g. [35, 35, 30]
  riskPreference?: 'low' | 'medium' | 'high';
}

export interface DetailedSimulationResult {
  blueprintId: string;
  pair: string;
  totalCapital: number;
  simulatedCandlesCount: number;
  executedOrdersCount: number;
  completedGridRounds: number;
  capitalUsagePeakUsdt: number;
  capitalUsagePeakPercent: number;
  totalFeesUsdt: number;
  estimatedNetProfitUsdt: number;
  estimatedNetProfitPercent: number;
  maxDrawdownPercent: number;
}

export class StrategyEngine {
  constructor(
    private aiEngine: AiEngine = new AiEngine(),
    private gridEngine: GridEngine = new GridEngine(),
    private marketEngine: MarketEngine = new MarketEngine()
  ) {}

  /**
   * Generates a deterministic Strategy Blueprint based on User Inputs and AI Recommendations.
   */
  async buildStrategy(input: BuildStrategyInput): Promise<Blueprint> {
    const { exchange, pair, capital, sectionCount } = input;

    // Default capital allocations if not provided (must sum to 100%)
    let allocations = input.capitalAllocationPercent;
    if (!allocations || allocations.length !== sectionCount) {
      if (sectionCount === 1) allocations = [100];
      else if (sectionCount === 2) allocations = [50, 50];
      else allocations = [35, 35, 30];
    }

    const totalAlloc = allocations.reduce((a, b) => a + b, 0);
    if (Math.abs(totalAlloc - 100) > 0.001) {
      throw new Error(`Total capital allocation must equal 100%, got ${totalAlloc}%`);
    }

    // Get AI Recommendations for grid configuration & section parameters
    const aiRec = await this.aiEngine.recommendStrategyParams(exchange, pair, sectionCount, capital);

    // Fetch current price for grid builder
    let currentPrice = 100;
    try {
      const ticker = await this.marketEngine.getTicker(exchange, pair);
      currentPrice = ticker.last || currentPrice;
    } catch {
      // Use fallback price if exchange engine ticker is unavailable
    }

    // Build grid structure using Grid Engine
    const gridBuildInput = {
      currentPrice,
      totalCapital: capital,
      sections: allocations.map((allocPercent, idx) => {
        const aiSec = aiRec.recommendedSections[idx] || {
          gridCount: 10,
          gridDistancePercent: 0.5,
          sectionGapPercent: 2.0,
          minNetProfitPercent: 0.5 + idx * 0.3,
        };
        return {
          allocationPercent: allocPercent,
          gridCount: aiSec.gridCount,
          gridDistancePercent: aiSec.gridDistancePercent,
          sectionGapPercent: aiSec.sectionGapPercent,
          minNetProfitPercent: aiSec.minNetProfitPercent,
        };
      }),
    };

    const gridResult = this.gridEngine.buildGrid(gridBuildInput);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_VALIDITY_WINDOW_MINUTES * 60 * 1000);

    const sections: GridSection[] = gridResult.sections.map((secResult, idx) => {
      return {
        index: idx,
        allocationPercent: secResult.allocationPercent,
        gridCount: secResult.gridCount,
        gridDistancePercent: secResult.gridDistancePercent,
        sectionGapPercent: secResult.sectionGapPercent,
        minNetProfitPercent: secResult.minNetProfitPercent,
      };
    });

    const blueprint: Blueprint = {
      id: `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      exchange,
      pair,
      tradingCapital: capital,
      sectionCount,
      sections,
      capitalProtectionFloor: Number((gridResult.lowestGridPrice * 0.85).toFixed(6)),
      floorAction: 'notify',
      maxCapitalPerMovementPercent: aiRec.maxCapitalPerMovementPercent,
      maxDrawdownAlertPercent: aiRec.maxDrawdownAlertPercent,
      confidenceScore: aiRec.confidenceScore,
      aiReasoning: aiRec.overallReasoning,
      createdAt: now,
      expiresAt,
    };

    // Validate generated Blueprint against business rules
    const validationErrors = validateBlueprint(blueprint);
    if (validationErrors.length > 0) {
      console.warn('[StrategyEngine] Blueprint validation warnings:', validationErrors);
    }

    return blueprint;
  }

  /**
   * Simulates a Strategy Blueprint against historical candlestick data.
   */
  async simulateStrategy(
    blueprint: Blueprint,
    customCandles?: Array<{ high: number; low: number; close: number }>
  ): Promise<DetailedSimulationResult> {
    let candles = customCandles;
    if (!candles || candles.length === 0) {
      try {
        candles = await this.marketEngine.getCandlesticks(blueprint.exchange, blueprint.pair, '1h', 100);
      } catch {
        // Fallback synthetic candles for simulation if live candles fail
        candles = Array.from({ length: 100 }).map((_, i) => {
          const base = 100 + Math.sin(i / 5) * 5;
          return { high: base + 1, low: base - 1, close: base };
        });
      }
    }

    const firstCandlePrice = candles[0]?.close || 100;
    const gridBuildResult = this.gridEngine.buildGrid({
      currentPrice: firstCandlePrice,
      totalCapital: blueprint.tradingCapital,
      sections: blueprint.sections.map((s) => ({
        allocationPercent: s.allocationPercent,
        gridCount: s.gridCount,
        gridDistancePercent: s.gridDistancePercent,
        sectionGapPercent: s.sectionGapPercent,
        minNetProfitPercent: s.minNetProfitPercent,
      })),
    });

    let totalFees = 0;
    let netProfit = 0;
    let peakCapitalUsage = 0;
    let completedRounds = 0;
    let totalExecutions = 0;

    // Track active position state for each grid order level
    const orderStates = gridBuildResult.sections.flatMap((s) =>
      s.orders.map((o) => ({
        ...o,
        isHolding: false,
        buyPrice: 0,
      }))
    );

    let maxDrawdown = 0;
    let peakEquity = blueprint.tradingCapital;

    for (const candle of candles) {
      let currentEquity = blueprint.tradingCapital + netProfit;

      for (const order of orderStates) {
        // Check Buy fill: candle low crosses or touches grid level price
        if (!order.isHolding && candle.low <= order.gridPrice) {
          order.isHolding = true;
          order.buyPrice = order.gridPrice;
          const fee = order.allocatedCapitalUsdt * 0.001; // 0.1% buy fee
          totalFees += fee;
          totalExecutions++;

          const activeCapital = orderStates
            .filter((o) => o.isHolding)
            .reduce((sum, o) => sum + o.allocatedCapitalUsdt, 0);
          if (activeCapital > peakCapitalUsage) {
            peakCapitalUsage = activeCapital;
          }
        }

        // Check Sell fill: candle high crosses or touches Take Profit price
        if (order.isHolding && candle.high >= order.estimatedTpPrice) {
          const sellProceeds = order.estimatedQuantity * order.estimatedTpPrice;
          const sellFee = sellProceeds * 0.001;
          const buyCost = order.allocatedCapitalUsdt + order.allocatedCapitalUsdt * 0.001;
          const profitRound = sellProceeds - sellFee - buyCost;

          netProfit += profitRound;
          totalFees += sellFee;
          completedRounds++;
          totalExecutions++;
          order.isHolding = false;
        }

        // Calculate unrealized drawdown
        if (order.isHolding) {
          const unrealizedLoss = order.allocatedCapitalUsdt * ((candle.close - order.buyPrice) / order.buyPrice);
          currentEquity += unrealizedLoss;
        }
      }

      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = ((peakEquity - currentEquity) / peakEquity) * 100;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    return {
      blueprintId: blueprint.id,
      pair: blueprint.pair,
      totalCapital: blueprint.tradingCapital,
      simulatedCandlesCount: candles.length,
      executedOrdersCount: totalExecutions,
      completedGridRounds: completedRounds,
      capitalUsagePeakUsdt: Number(peakCapitalUsage.toFixed(2)),
      capitalUsagePeakPercent: Number(((peakCapitalUsage / blueprint.tradingCapital) * 100).toFixed(2)),
      totalFeesUsdt: Number(totalFees.toFixed(2)),
      estimatedNetProfitUsdt: Number(netProfit.toFixed(2)),
      estimatedNetProfitPercent: Number(((netProfit / blueprint.tradingCapital) * 100).toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
    };
  }
}

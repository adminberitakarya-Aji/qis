// Qis Portfolio Engine
// Responsible for:
// - Balance Aggregation
// - Capital Allocation Tracking
// - Realized PnL Calculation
// - Unrealized PnL Estimation
// - Position Summary per Strategy

import { ExchangeEngine, type ExchangeBalance } from '@qis/exchange-engine';

export interface StrategyOrderSnapshot {
  clientOrderId: string;
  status: string;
  allocatedCapital: number;
  buyFilledPrice: number | null;
  buyFilledQuantity: number | null;
  buyFee: number | null;
  tpFilledPrice: number | null;
  tpFee: number | null;
  realizedPnl: number | null;
  gridPrice: number;
  tpPrice: number;
}

export interface StrategyPortfolioSummary {
  strategyId: string;
  blueprintId: string;
  exchange: string;
  pair: string;
  totalCapital: number;
  allocatedCapital: number;
  freeCapital: number;
  realizedPnlUsdt: number;
  unrealizedPnlUsdt: number;
  openPositionsCount: number;
  completedRoundsCount: number;
  totalOrdersCount: number;
  winRate: number; // percent of completed rounds that were profitable
}

export interface PortfolioOverview {
  exchange: string;
  totalBalanceUsdt: number;
  freeBalanceUsdt: number;
  allocatedInStrategiesUsdt: number;
  totalRealizedPnlUsdt: number;
  totalUnrealizedPnlUsdt: number;
  strategies: StrategyPortfolioSummary[];
  assetBreakdown: Array<{
    asset: string;
    free: number;
    used: number;
    total: number;
    estimatedUsdt: number;
  }>;
  lastUpdatedAt: number;
}

export interface CurrentPriceMap {
  [pair: string]: number; // e.g. 'BTC/USDT' -> 65000
}

export class PortfolioEngine {
  private exchangeEngine: ExchangeEngine;

  constructor() {
    this.exchangeEngine = new ExchangeEngine();
  }

  /**
   * Aggregates portfolio overview from exchange balance + active strategy snapshots.
   */
  async buildPortfolioOverview(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    activeStrategies: Array<{
      strategyId: string;
      blueprintId: string;
      pair: string;
      capital: number;
      orders: StrategyOrderSnapshot[];
    }>,
    currentPrices: CurrentPriceMap
  ): Promise<PortfolioOverview> {
    // Fetch live balance
    const balance: ExchangeBalance = await this.exchangeEngine.fetchBalance(
      exchange,
      apiKey,
      apiSecret
    );

    const usdtAsset = balance.balances.find((b: any) => b.asset === 'USDT');
    const totalUsdt = usdtAsset?.total ?? 0;
    const freeUsdt = usdtAsset?.free ?? 0;

    // Build strategy summaries
    const strategySummaries: StrategyPortfolioSummary[] = activeStrategies.map(
      (strat) => {
        const summary = this.calculateStrategySummary(
          strat.strategyId,
          strat.blueprintId,
          exchange,
          strat.pair,
          strat.capital,
          strat.orders,
          currentPrices[strat.pair] ?? 0
        );
        return summary;
      }
    );

    const totalAllocated = strategySummaries.reduce(
      (sum, s) => sum + s.allocatedCapital,
      0
    );
    const totalRealizedPnl = strategySummaries.reduce(
      (sum, s) => sum + s.realizedPnlUsdt,
      0
    );
    const totalUnrealizedPnl = strategySummaries.reduce(
      (sum, s) => sum + s.unrealizedPnlUsdt,
      0
    );

    // Build asset breakdown with USDT estimation
    const assetBreakdown = balance.balances.map((b: any) => {
      let estimatedUsdt = 0;
      if (b.asset === 'USDT') {
        estimatedUsdt = b.total;
      } else {
        // Try to find price from current prices map
        const pairKey = `${b.asset}/USDT`;
        const price = currentPrices[pairKey] ?? 0;
        estimatedUsdt = b.total * price;
      }
      return {
        asset: b.asset,
        free: b.free,
        used: b.used,
        total: b.total,
        estimatedUsdt: Number(estimatedUsdt.toFixed(2)),
      };
    });

    return {
      exchange,
      totalBalanceUsdt: Number(totalUsdt.toFixed(2)),
      freeBalanceUsdt: Number(freeUsdt.toFixed(2)),
      allocatedInStrategiesUsdt: Number(totalAllocated.toFixed(2)),
      totalRealizedPnlUsdt: Number(totalRealizedPnl.toFixed(4)),
      totalUnrealizedPnlUsdt: Number(totalUnrealizedPnl.toFixed(4)),
      strategies: strategySummaries,
      assetBreakdown,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * Calculates portfolio summary for a single active strategy.
   */
  calculateStrategySummary(
    strategyId: string,
    blueprintId: string,
    exchange: string,
    pair: string,
    totalCapital: number,
    orders: StrategyOrderSnapshot[],
    currentPrice: number
  ): StrategyPortfolioSummary {
    let realizedPnl = 0;
    let unrealizedPnl = 0;
    let allocatedCapital = 0;
    let openPositions = 0;
    let completedRounds = 0;
    let profitableRounds = 0;

    for (const order of orders) {
      // Completed (TP hit)
      if (order.status === 'tp_filled' && order.realizedPnl !== null) {
        realizedPnl += order.realizedPnl;
        completedRounds++;
        if (order.realizedPnl > 0) profitableRounds++;
      }

      // Open position (buy filled, TP not yet hit)
      if (order.status === 'filled' || order.status === 'tp_placed') {
        openPositions++;
        allocatedCapital += order.allocatedCapital;

        // Unrealized PnL based on current market price
        if (order.buyFilledPrice && order.buyFilledQuantity && currentPrice > 0) {
          const currentValue = order.buyFilledQuantity * currentPrice;
          const costBasis = order.buyFilledQuantity * order.buyFilledPrice;
          unrealizedPnl += currentValue - costBasis;
        }
      }

      // Capital still in pending/placed orders (not yet filled)
      if (order.status === 'placed' || order.status === 'pending') {
        allocatedCapital += order.allocatedCapital;
      }
    }

    const winRate =
      completedRounds > 0
        ? Number(((profitableRounds / completedRounds) * 100).toFixed(1))
        : 0;

    return {
      strategyId,
      blueprintId,
      exchange,
      pair,
      totalCapital: Number(totalCapital.toFixed(2)),
      allocatedCapital: Number(allocatedCapital.toFixed(2)),
      freeCapital: Number((totalCapital - allocatedCapital).toFixed(2)),
      realizedPnlUsdt: Number(realizedPnl.toFixed(4)),
      unrealizedPnlUsdt: Number(unrealizedPnl.toFixed(4)),
      openPositionsCount: openPositions,
      completedRoundsCount: completedRounds,
      totalOrdersCount: orders.length,
      winRate,
    };
  }

  /**
   * Calculates realized PnL for a list of completed orders.
   */
  calculateRealizedPnl(orders: StrategyOrderSnapshot[]): number {
    return orders
      .filter((o) => o.status === 'tp_filled' && o.realizedPnl !== null)
      .reduce((sum, o) => sum + (o.realizedPnl ?? 0), 0);
  }
}

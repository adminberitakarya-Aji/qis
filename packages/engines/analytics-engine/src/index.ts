// Qis Analytics Engine
// Responsible for:
// - Trading Statistics Calculation
// - Win Rate, Profit Factor, Sharpe-like metrics
// - Fee tracking
// - Max Drawdown calculation
// - Daily/Monthly performance aggregation

export interface CompletedOrderRecord {
  clientOrderId: string;
  strategyId: string;
  pair: string;
  sectionIndex: number;
  allocatedCapital: number;
  buyFilledPrice: number;
  buyFilledQuantity: number;
  buyFee: number;
  tpFilledPrice: number;
  tpFee: number;
  realizedPnl: number;
  buyFilledAt: Date;
  tpFilledAt: Date;
}

export interface StrategyAnalytics {
  strategyId: string;
  pair: string;
  totalRounds: number;
  winningRounds: number;
  losingRounds: number;
  winRate: number;
  totalRealizedPnlUsdt: number;
  totalFeesUsdt: number;
  netPnlUsdt: number;
  netPnlPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  avgPnlPerRoundUsdt: number;
  avgHoldingDurationHours: number;
  bestRoundPnlUsdt: number;
  worstRoundPnlUsdt: number;
  dailyBreakdown: DailyPerformance[];
}

export interface DailyPerformance {
  date: string;
  rounds: number;
  realizedPnlUsdt: number;
  feesUsdt: number;
  netPnlUsdt: number;
}

export interface UserAnalyticsSummary {
  totalRealizedPnlUsdt: number;
  totalFeesUsdt: number;
  netPnlUsdt: number;
  totalRounds: number;
  winRate: number;
  activeStrategiesCount: number;
  bestPairByPnl: string | null;
  monthlyBreakdown: MonthlyPerformance[];
}

export interface MonthlyPerformance {
  month: string;
  rounds: number;
  realizedPnlUsdt: number;
  feesUsdt: number;
  netPnlUsdt: number;
}

export class AnalyticsEngine {
  calculateStrategyAnalytics(
    strategyId: string,
    pair: string,
    totalCapital: number,
    completedOrders: CompletedOrderRecord[]
  ): StrategyAnalytics {
    if (completedOrders.length === 0) {
      return this.emptyStrategyAnalytics(strategyId, pair);
    }

    let totalPnl = 0;
    let totalFees = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;
    let totalHoldingMs = 0;
    let bestPnl = -Infinity;
    let worstPnl = Infinity;

    const cumulativePnlSeries: number[] = [];
    let runningPnl = 0;

    const dailyMap = new Map<string, DailyPerformance>();

    for (const order of completedOrders) {
      const roundPnl = order.realizedPnl;
      const roundFees = order.buyFee + order.tpFee;

      runningPnl += roundPnl;
      cumulativePnlSeries.push(runningPnl);

      totalPnl += roundPnl;
      totalFees += roundFees;

      if (roundPnl > 0) {
        grossProfit += roundPnl;
        wins++;
      } else {
        grossLoss += Math.abs(roundPnl);
        losses++;
      }

      if (roundPnl > bestPnl) bestPnl = roundPnl;
      if (roundPnl < worstPnl) worstPnl = roundPnl;

      const holdingMs = order.tpFilledAt.getTime() - order.buyFilledAt.getTime();
      totalHoldingMs += holdingMs;

      const dateKey = order.tpFilledAt.toISOString().slice(0, 10);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { date: dateKey, rounds: 0, realizedPnlUsdt: 0, feesUsdt: 0, netPnlUsdt: 0 });
      }
      const day = dailyMap.get(dateKey)!;
      day.rounds++;
      day.realizedPnlUsdt = Number((day.realizedPnlUsdt + roundPnl).toFixed(4));
      day.feesUsdt = Number((day.feesUsdt + roundFees).toFixed(4));
      day.netPnlUsdt = Number((day.realizedPnlUsdt - day.feesUsdt).toFixed(4));
    }

    const totalRounds = completedOrders.length;
    const winRate = totalRounds > 0 ? Number(((wins / totalRounds) * 100).toFixed(1)) : 0;
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0;
    const maxDrawdownPercent = this.calculateMaxDrawdown(cumulativePnlSeries, totalCapital);
    const avgHoldingHours = totalRounds > 0 ? totalHoldingMs / totalRounds / 3_600_000 : 0;
    const netPnl = totalPnl - totalFees;

    return {
      strategyId,
      pair,
      totalRounds,
      winningRounds: wins,
      losingRounds: losses,
      winRate,
      totalRealizedPnlUsdt: Number(totalPnl.toFixed(4)),
      totalFeesUsdt: Number(totalFees.toFixed(4)),
      netPnlUsdt: Number(netPnl.toFixed(4)),
      netPnlPercent: totalCapital > 0 ? Number(((netPnl / totalCapital) * 100).toFixed(2)) : 0,
      profitFactor,
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      avgPnlPerRoundUsdt: totalRounds > 0 ? Number((totalPnl / totalRounds).toFixed(4)) : 0,
      avgHoldingDurationHours: Number(avgHoldingHours.toFixed(2)),
      bestRoundPnlUsdt: Number((bestPnl === -Infinity ? 0 : bestPnl).toFixed(4)),
      worstRoundPnlUsdt: Number((worstPnl === Infinity ? 0 : worstPnl).toFixed(4)),
      dailyBreakdown: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  buildUserSummary(
    activeStrategiesCount: number,
    allCompletedOrders: CompletedOrderRecord[]
  ): UserAnalyticsSummary {
    if (allCompletedOrders.length === 0) {
      return {
        totalRealizedPnlUsdt: 0,
        totalFeesUsdt: 0,
        netPnlUsdt: 0,
        totalRounds: 0,
        winRate: 0,
        activeStrategiesCount,
        bestPairByPnl: null,
        monthlyBreakdown: [],
      };
    }

    let totalPnl = 0;
    let totalFees = 0;
    let wins = 0;
    const monthlyMap = new Map<string, MonthlyPerformance>();
    const pairPnlMap = new Map<string, number>();

    for (const order of allCompletedOrders) {
      const roundPnl = order.realizedPnl;
      const roundFees = order.buyFee + order.tpFee;
      totalPnl += roundPnl;
      totalFees += roundFees;
      if (roundPnl > 0) wins++;

      const monthKey = order.tpFilledAt.toISOString().slice(0, 7);
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { month: monthKey, rounds: 0, realizedPnlUsdt: 0, feesUsdt: 0, netPnlUsdt: 0 });
      }
      const month = monthlyMap.get(monthKey)!;
      month.rounds++;
      month.realizedPnlUsdt = Number((month.realizedPnlUsdt + roundPnl).toFixed(4));
      month.feesUsdt = Number((month.feesUsdt + roundFees).toFixed(4));
      month.netPnlUsdt = Number((month.realizedPnlUsdt - month.feesUsdt).toFixed(4));

      pairPnlMap.set(order.pair, (pairPnlMap.get(order.pair) ?? 0) + roundPnl);
    }

    const totalRounds = allCompletedOrders.length;
    const netPnl = totalPnl - totalFees;
    const winRate = totalRounds > 0 ? Number(((wins / totalRounds) * 100).toFixed(1)) : 0;

    let bestPair: string | null = null;
    let bestPairPnl = -Infinity;
    for (const [pair, pnl] of pairPnlMap.entries()) {
      if (pnl > bestPairPnl) {
        bestPairPnl = pnl;
        bestPair = pair;
      }
    }

    return {
      totalRealizedPnlUsdt: Number(totalPnl.toFixed(4)),
      totalFeesUsdt: Number(totalFees.toFixed(4)),
      netPnlUsdt: Number(netPnl.toFixed(4)),
      totalRounds,
      winRate,
      activeStrategiesCount,
      bestPairByPnl: bestPair,
      monthlyBreakdown: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  private calculateMaxDrawdown(cumulativePnlSeries: number[], totalCapital: number): number {
    if (cumulativePnlSeries.length === 0 || totalCapital <= 0) return 0;

    let maxDrawdown = 0;
    let peak = totalCapital + cumulativePnlSeries[0];

    for (const pnl of cumulativePnlSeries) {
      const equity = totalCapital + pnl;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return maxDrawdown;
  }

  private emptyStrategyAnalytics(strategyId: string, pair: string): StrategyAnalytics {
    return {
      strategyId,
      pair,
      totalRounds: 0,
      winningRounds: 0,
      losingRounds: 0,
      winRate: 0,
      totalRealizedPnlUsdt: 0,
      totalFeesUsdt: 0,
      netPnlUsdt: 0,
      netPnlPercent: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      avgPnlPerRoundUsdt: 0,
      avgHoldingDurationHours: 0,
      bestRoundPnlUsdt: 0,
      worstRoundPnlUsdt: 0,
      dailyBreakdown: [],
    };
  }
}

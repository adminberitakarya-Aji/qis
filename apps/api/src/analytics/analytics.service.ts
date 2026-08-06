import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsEngine, type CompletedOrderRecord } from '@qis/analytics-engine';

@Injectable()
export class AnalyticsService {
  private analyticsEngine = new AnalyticsEngine();

  constructor(private readonly prisma: PrismaService) {}

  async getUserAnalytics(userId: string) {
    const activeCount = await this.prisma.gridStrategy.count({
      where: { userId, status: 'active' },
    });

    const completedOrdersRaw = await this.prisma.gridOrder.findMany({
      where: {
        gridStrategy: { userId },
        status: 'tp_filled',
        filledAt: { not: null },
        tpFilledAt: { not: null },
      },
      include: { gridStrategy: true },
    });

    const completedRecords: CompletedOrderRecord[] = completedOrdersRaw.map((o) => ({
      clientOrderId: o.clientOrderId,
      strategyId: o.gridStrategyId,
      pair: o.gridStrategy.pair,
      sectionIndex: o.sectionIndex,
      allocatedCapital: o.allocatedCapital,
      buyFilledPrice: o.buyFilledPrice ?? o.gridPrice,
      buyFilledQuantity: o.buyFilledQuantity ?? o.estimatedQuantity,
      buyFee: o.buyFee ?? 0,
      tpFilledPrice: o.tpFilledPrice ?? o.tpPrice,
      tpFee: o.tpFee ?? 0,
      realizedPnl: o.realizedPnl ?? 0,
      buyFilledAt: o.filledAt!,
      tpFilledAt: o.tpFilledAt!,
    }));

    return this.analyticsEngine.buildUserSummary(activeCount, completedRecords);
  }

  async getStrategyAnalytics(userId: string, strategyId: string) {
    const strategy = await this.prisma.gridStrategy.findUnique({
      where: { id: strategyId },
      include: {
        orders: {
          where: { status: 'tp_filled', filledAt: { not: null }, tpFilledAt: { not: null } },
        },
      },
    });

    if (!strategy || strategy.userId !== userId) {
      throw new NotFoundException('Strategy not found');
    }

    const completedRecords: CompletedOrderRecord[] = strategy.orders.map((o) => ({
      clientOrderId: o.clientOrderId,
      strategyId: o.gridStrategyId,
      pair: strategy.pair,
      sectionIndex: o.sectionIndex,
      allocatedCapital: o.allocatedCapital,
      buyFilledPrice: o.buyFilledPrice ?? o.gridPrice,
      buyFilledQuantity: o.buyFilledQuantity ?? o.estimatedQuantity,
      buyFee: o.buyFee ?? 0,
      tpFilledPrice: o.tpFilledPrice ?? o.tpPrice,
      tpFee: o.tpFee ?? 0,
      realizedPnl: o.realizedPnl ?? 0,
      buyFilledAt: o.filledAt!,
      tpFilledAt: o.tpFilledAt!,
    }));

    return this.analyticsEngine.calculateStrategyAnalytics(
      strategy.id,
      strategy.pair,
      strategy.capital,
      completedRecords,
    );
  }
}

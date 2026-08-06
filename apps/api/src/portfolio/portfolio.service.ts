import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { PortfolioEngine, type StrategyOrderSnapshot } from '@qis/portfolio-engine';
import { MarketEngine } from '@qis/market-engine';

@Injectable()
export class PortfolioService {
  private portfolioEngine = new PortfolioEngine();
  private marketEngine = new MarketEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getPortfolioOverview(userId: string, exchangeAccountId: string) {
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: exchangeAccountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Exchange account not found');
    }

    const apiKey = this.crypto.decrypt(account.apiKey);
    const apiSecret = this.crypto.decrypt(account.apiSecret);

    // Fetch active strategies for user
    const activeStrategies = await this.prisma.gridStrategy.findMany({
      where: { userId, exchange: account.exchange, status: 'active' },
      include: { orders: true },
    });

    // Fetch current prices for active strategy pairs
    const pairs = Array.from(new Set(activeStrategies.map((s) => s.pair)));
    const currentPrices: Record<string, number> = {};

    for (const pair of pairs) {
      try {
        const ticker = await this.marketEngine.getTicker(
          account.exchange as 'binance' | 'bybit',
          pair,
        );
        currentPrices[pair] = ticker.last;
      } catch {
        currentPrices[pair] = 0;
      }
    }

    const strategyInputs = activeStrategies.map((s) => ({
      strategyId: s.id,
      blueprintId: s.blueprintId,
      pair: s.pair,
      capital: s.capital,
      orders: s.orders.map(
        (o): StrategyOrderSnapshot => ({
          clientOrderId: o.clientOrderId,
          status: o.status,
          allocatedCapital: o.allocatedCapital,
          buyFilledPrice: o.buyFilledPrice,
          buyFilledQuantity: o.buyFilledQuantity,
          buyFee: o.buyFee,
          tpFilledPrice: o.tpFilledPrice,
          tpFee: o.tpFee,
          realizedPnl: o.realizedPnl,
          gridPrice: o.gridPrice,
          tpPrice: o.tpPrice,
        }),
      ),
    }));

    return this.portfolioEngine.buildPortfolioOverview(
      account.exchange as 'binance' | 'bybit',
      apiKey,
      apiSecret,
      strategyInputs,
      currentPrices,
    );
  }
}

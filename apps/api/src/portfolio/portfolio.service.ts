import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioEngine, type StrategyOrderSnapshot } from '@qis/portfolio-engine';
import { MarketEngine } from '@qis/market-engine';
import { EXCHANGE_ENGINE } from '../engines/engines.module';
import { ExchangeEngine } from '@qis/exchange-engine';

@Injectable()
export class PortfolioService {
  private portfolioEngine: PortfolioEngine;
  private marketEngine = new MarketEngine();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ENGINE) exchangeEngine: ExchangeEngine,
  ) {
    // Inject the same Exchange Engine singleton that every other module uses,
    // so Portfolio Engine participates in the shared Master Key boundary.
    this.portfolioEngine = new PortfolioEngine(exchangeEngine);
  }

  async getPortfolioOverview(userId: string, exchangeAccountId: string) {
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: exchangeAccountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Exchange account not found');
    }

    // Fetch active strategies scoped to the specific exchange account.
    // This is correct because a user can have multiple accounts per exchange,
    // and capital is committed per-account per Rule #6.
    const activeStrategies = await this.prisma.gridStrategy.findMany({
      where: { userId, exchangeAccountId: account.id, status: 'active' },
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

    // Per Secret Ownership Rule #5: forward the ciphertext blob + keyVersion
    // + audit context. Decryption happens inside Exchange Engine, which logs
    // the event and never returns the plaintext to this scope.
    return this.portfolioEngine.buildPortfolioOverviewEncrypted(
      account.exchange as 'binance' | 'bybit',
      {
        encryptedApiKey: account.apiKeyEncrypted,
        encryptedApiSecret: account.apiSecretEncrypted,
        keyVersion: account.apiKeyKeyVersion,
        context: {
          exchangeAccountId: account.id,
          userId: account.userId,
          purpose: 'portfolioOverview',
        },
      },
      strategyInputs,
      currentPrices,
    );
  }

  /**
   * Computes committed capital (sum of `capital` across active strategies)
   * for a specific exchange account, on-the-fly per Concurrency Rule #6.
   * This is the single source of truth used by Strategy Engine before
   * approving a new Blueprint.
   */
  async getCommittedCapital(userId: string, exchangeAccountId: string) {
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: exchangeAccountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Exchange account not found');
    }

    const aggregate = await this.prisma.gridStrategy.aggregate({
      where: { exchangeAccountId: account.id, status: 'active' },
      _sum: { capital: true },
      _count: { _all: true },
    });

    return {
      exchangeAccountId: account.id,
      exchange: account.exchange,
      committedCapital: aggregate._sum.capital ?? 0,
      activeStrategyCount: aggregate._count._all,
    };
  }
}

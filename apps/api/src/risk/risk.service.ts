import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskEngine, type RiskCheckOutcome, type RiskConfig } from '@qis/risk-engine';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertingService } from '../ops-alerting/ops-alerting.service';

@Injectable()
export class RiskService {
  private riskEngine: RiskEngine;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly opsAlerting: OpsAlertingService,
  ) {
    this.riskEngine = new RiskEngine(this.loadConfig());
  }

  /**
   * Loads risk configuration from environment variables, falling back
   * to conservative defaults from the RiskEngine.
   */
  private loadConfig(): RiskConfig {
    const defaults = RiskEngine.defaultConfig();
    return {
      maxConcurrentStrategiesPerUser: this.configService.get<number>(
        'RISK_MAX_CONCURRENT_STRATEGIES',
        defaults.maxConcurrentStrategiesPerUser,
      ),
      maxCapitalPerPair: this.configService.get<number>(
        'RISK_MAX_CAPITAL_PER_PAIR',
        defaults.maxCapitalPerPair,
      ),
      maxCapitalPerUser: this.configService.get<number>(
        'RISK_MAX_CAPITAL_PER_USER',
        defaults.maxCapitalPerUser,
      ),
    };
  }

  /**
   * Runs pre-trade risk checks for a proposed strategy launch.
   *
   * Per ROADMAP.md Phase 2:
   * - Capital allocation check against Portfolio Engine's uncommitted balance
   * - Max concurrent strategies per user
   * - Max capital per pair
   * - Max capital per user
   *
   * If the check is blocked, an ops alert is sent via Phase 0's alerting
   * channel (Telegram) — "Strategy blocked: capital limit exceeded" is
   * enough until there's a reason to visualize it.
   */
  async checkPreTrade(
    userId: string,
    exchangeAccountId: string,
    pair: string,
    capital: number,
  ): Promise<RiskCheckOutcome> {
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: exchangeAccountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Exchange account not found');
    }

    // Aggregate committed capital and active strategy count for this account
    const aggregate = await this.prisma.gridStrategy.aggregate({
      where: { exchangeAccountId: account.id, status: 'active' },
      _sum: { capital: true },
      _count: { _all: true },
    });

    // Aggregate committed capital for the same pair on this account
    const pairAggregate = await this.prisma.gridStrategy.aggregate({
      where: { exchangeAccountId: account.id, status: 'active', pair },
      _sum: { capital: true },
    });

    const committedCapital = aggregate._sum.capital ?? 0;
    const activeStrategyCount = aggregate._count._all;
    const committedCapitalOnPair = pairAggregate._sum.capital ?? 0;

    const outcome = this.riskEngine.checkPreTrade({
      userId,
      exchangeAccountId,
      pair,
      capital,
      committedCapital,
      activeStrategyCount,
      committedCapitalOnPair,
    });

    // Reuse Phase 0's alerting channel for risk events.
    // A Telegram message "Strategy blocked: capital limit exceeded" is
    // enough until there's a reason to visualize it.
    if (outcome.blocked) {
      await this.opsAlerting.riskCheckBlocked({
        userId,
        exchangeAccountId,
        pair,
        capital,
        reasons: outcome.reasons.map((r) => r.code),
      });
    }

    return outcome;
  }
}
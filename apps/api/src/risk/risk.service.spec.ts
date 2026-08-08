import { NotFoundException } from '@nestjs/common';
import { RiskService } from './risk.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { OpsAlertingService } from '../ops-alerting/ops-alerting.service';

/**
 * Regression tests for a real bug: RiskConfig documents maxCapitalPerUser,
 * maxConcurrentStrategiesPerUser, and maxCapitalPerPair as user-wide limits
 * ("across all strategies per user" / "per user"), but checkPreTrade()
 * originally aggregated committed capital and active strategy count by
 * `exchangeAccountId` only. A user with multiple exchange accounts (e.g.
 * Binance + Bybit — the schema explicitly supports this via
 * ExchangeAccount) could exceed a "per user" limit by spreading strategies
 * across accounts, each individually staying under the threshold computed
 * for that one account.
 *
 * Fix: aggregate by `userId` instead of `exchangeAccountId` so the limit
 * is enforced across the user's full footprint, matching the documented
 * semantics.
 */

function buildConfigServiceMock(): ConfigService {
  const values: Record<string, number> = {
    RISK_MAX_CONCURRENT_STRATEGIES: 5,
    RISK_MAX_CAPITAL_PER_PAIR: 50000,
    RISK_MAX_CAPITAL_PER_USER: 100000,
  };
  return {
    get: jest.fn((key: string, fallback: number) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function buildService(prismaMock: any) {
  const configServiceMock = buildConfigServiceMock();
  const opsAlertingMockRaw = {
    riskCheckBlocked: jest.fn(),
  };
  const opsAlertingMock = opsAlertingMockRaw as unknown as OpsAlertingService;

  const service = new RiskService(
    prismaMock as unknown as PrismaService,
    configServiceMock,
    opsAlertingMock,
  );

  return { service, opsAlertingMock: opsAlertingMockRaw };
}

describe('RiskService.checkPreTrade — user-wide aggregation', () => {
  it('aggregates committed capital across ALL of the user’s exchange accounts, not just the one being used', async () => {
    const account = { id: 'account_binance', userId: 'user_1' };

    const prismaMock = {
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
      gridStrategy: {
        // Simulate: this user has $90k committed total across accounts
        // (e.g. $50k on Binance, $40k on Bybit), well under the $100k
        // maxCapitalPerUser limit — but if the query were scoped to only
        // the Binance account, it would see just $50k and wrongly approve
        // a new $60k strategy that would push the TRUE total to $150k.
        aggregate: jest.fn().mockResolvedValue({
          _sum: { capital: 90000 },
          _count: { _all: 4 },
        }),
      },
    };

    const { service } = buildService(prismaMock);

    await service.checkPreTrade('user_1', 'account_binance', 'BTC/USDT', 60000);

    // The critical assertion: the aggregate query must be scoped by
    // userId, not exchangeAccountId, so it captures capital committed on
    // every account this user owns.
    expect(prismaMock.gridStrategy.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_1', status: 'active' }),
      }),
    );
    // Explicitly must NOT scope the main aggregate by exchangeAccountId —
    // that was the exact bug.
    const call = prismaMock.gridStrategy.aggregate.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('exchangeAccountId');
  });

  it('blocks a new strategy that would push the USER-WIDE total over the limit, even though the single account is under it', async () => {
    const account = { id: 'account_binance', userId: 'user_1' };

    const prismaMock = {
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
      gridStrategy: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { capital: 90000 }, // true user-wide total across all accounts
          _count: { _all: 4 },
        }),
      },
    };

    const { service, opsAlertingMock } = buildService(prismaMock);

    // 90,000 already committed (across accounts) + 60,000 new = 150,000,
    // which exceeds the 100,000 maxCapitalPerUser limit.
    const outcome = await service.checkPreTrade('user_1', 'account_binance', 'BTC/USDT', 60000);

    expect(outcome.blocked).toBe(true);
    expect(outcome.reasons.map((r) => r.code)).toContain('MAX_CAPITAL_PER_USER_EXCEEDED');
    expect(opsAlertingMock.riskCheckBlocked).toHaveBeenCalledTimes(1);
  });

  it('also scopes the per-pair aggregate by userId, not exchangeAccountId', async () => {
    const account = { id: 'account_binance', userId: 'user_1' };

    const prismaMock = {
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
      gridStrategy: {
        aggregate: jest
          .fn()
          // First call: overall aggregate
          .mockResolvedValueOnce({ _sum: { capital: 1000 }, _count: { _all: 1 } })
          // Second call: per-pair aggregate
          .mockResolvedValueOnce({ _sum: { capital: 2000 } }),
      },
    };

    const { service } = buildService(prismaMock);

    await service.checkPreTrade('user_1', 'account_binance', 'BTC/USDT', 500);

    const secondCall = prismaMock.gridStrategy.aggregate.mock.calls[1][0];
    expect(secondCall.where).toEqual(
      expect.objectContaining({ userId: 'user_1', status: 'active', pair: 'BTC/USDT' }),
    );
    expect(secondCall.where).not.toHaveProperty('exchangeAccountId');
  });

  it('throws NotFoundException when the exchange account does not belong to the requesting user', async () => {
    const prismaMock = {
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'account_1', userId: 'someone_else' }),
      },
      gridStrategy: { aggregate: jest.fn() },
    };

    const { service } = buildService(prismaMock);

    await expect(
      service.checkPreTrade('user_1', 'account_1', 'BTC/USDT', 1000),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.gridStrategy.aggregate).not.toHaveBeenCalled();
  });
});
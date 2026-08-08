import { NotFoundException } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StrategyService } from '../strategy/strategy.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { OpsAlertingService } from '../ops-alerting/ops-alerting.service';
import type { RiskService } from '../risk/risk.service';
import type { ExchangeEngine } from '@qis/exchange-engine';

/**
 * Regression tests for the atomic-claim fixes in triggerGridOrder() and
 * stopExecution(). See the block comments above each method in
 * execution.service.ts for the full rationale.
 *
 * IMPORTANT: this file was previously deleted wholesale (Phase 0 "safety
 * net" commit) after ExecutionService's constructor gained two new
 * dependencies (OpsAlertingService, RiskService), which broke the old
 * mocks. The fix is never allowed to go untested again — if
 * ExecutionService's constructor changes, update buildService() below
 * rather than deleting this file.
 *
 * Bug being guarded against: the original implementation did a separate
 * findUnique() status/ownership check followed by a later update(). That
 * read-then-write pattern is racy — two near-simultaneous calls for the
 * same orderId/strategyId (worker retry after a timeout, a second worker
 * instance, a double-tap on "Stop" in the UI, a retried API call, etc.)
 * could both pass the guard check before either write landed:
 *   - triggerGridOrder: two real market buys for the same grid level
 *   - stopExecution: cancelAllOpenOrdersEncrypted() running twice
 * A single conditional `updateMany({ where: { ..., status: X }, data: {
 * status: Y } })` closes this — only the caller whose WHERE clause still
 * matches the current row state gets count === 1.
 *
 * Caveat: these are unit-level tests with a mocked Prisma client. They
 * prove the application code depends correctly on the atomic-update
 * contract (correct WHERE clause, correct gating on the result), not that
 * Postgres itself serializes concurrent UPDATE ... WHERE statements — that
 * guarantee comes from the database itself. See the skipped integration
 * suite at the bottom for what a real-DB proof would look like.
 */

type MockOrderRow = {
  id: string;
  status: string;
  gridStrategy: any;
  clientOrderId: string;
  exchangeOrderId: string | null;
  tpExchangeOrderId: string | null;
  sectionIndex: number;
  orderIndex: number;
  globalOrderIndex: number;
  gridPrice: number;
  tpPrice: number;
  allocatedCapital: number;
  estimatedQuantity: number;
};

function buildOrderRow(overrides: Partial<MockOrderRow> = {}): MockOrderRow {
  return {
    id: 'order_1',
    status: 'pending',
    clientOrderId: 'strategy_1_g1',
    exchangeOrderId: null,
    tpExchangeOrderId: null,
    sectionIndex: 0,
    orderIndex: 0,
    globalOrderIndex: 1,
    gridPrice: 100,
    tpPrice: 101,
    allocatedCapital: 50,
    estimatedQuantity: 0.5,
    gridStrategy: {
      id: 'strategy_1',
      userId: 'user_1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeAccountId: 'account_1',
    },
    ...overrides,
  };
}

function buildStrategyRow(overrides: Partial<any> = {}): any {
  return {
    id: 'strategy_1',
    userId: 'user_1',
    status: 'active',
    exchange: 'binance',
    pair: 'BTC/USDT',
    exchangeAccountId: 'account_1',
    orders: [],
    ...overrides,
  };
}

function buildService(prismaMock: any) {
  const strategyServiceMock = {} as unknown as StrategyService;
  const realtimeMock = { emitOrderUpdate: jest.fn() } as unknown as RealtimeGateway;
  const idempotencyMock = {
    getExistingResponse: jest.fn(),
    storeResponse: jest.fn(),
  } as unknown as IdempotencyService;
  const opsAlertingMock = {
    alert: jest.fn(),
    critical: jest.fn(),
    warning: jest.fn(),
    workerCrashed: jest.fn(),
    workerWebSocketReconnectFailed: jest.fn(),
    triggerGridOrderError: jest.fn(),
    stopExecutionError: jest.fn(),
    exchangeRetryExhausted: jest.fn(),
    databaseConnectionError: jest.fn(),
    genericCritical: jest.fn(),
    riskCheckBlocked: jest.fn(),
  } as unknown as OpsAlertingService;
  const riskServiceMock = {
    checkPreTrade: jest.fn(),
  } as unknown as RiskService;
  // ExecutionService only stores this to build `new ExecutionEngine(exchangeEngine)`
  // internally; we overwrite `executionEngine` after construction below, so
  // this mock is never actually invoked.
  const exchangeEngineMock = {} as unknown as ExchangeEngine;

  const service = new ExecutionService(
    prismaMock as unknown as PrismaService,
    exchangeEngineMock,
    strategyServiceMock,
    realtimeMock,
    idempotencyMock,
    opsAlertingMock,
    riskServiceMock,
  );

  const executionEngineMock = {
    executeSingleMarketBuyEncrypted: jest.fn().mockResolvedValue({
      exchangeOrderId: 'ex_order_1',
      filledPrice: 99.5,
      filledQuantity: 0.5,
      fee: 0.05,
      tpExchangeOrderId: 'ex_tp_1',
    }),
    cancelAllOpenOrdersEncrypted: jest.fn(),
  };
  // Private field in TS, accessible at runtime — swap in a full mock so the
  // test never touches real ExchangeEngine / ccxt / crypto code.
  (service as any).executionEngine = executionEngineMock;

  return { service, executionEngineMock, realtimeMock, opsAlertingMock };
}

describe('ExecutionService.triggerGridOrder — atomic claim', () => {
  it('claims the order (updateMany count=1) and only then calls the exchange', async () => {
    const order = buildOrderRow();
    const account = { id: 'account_1', userId: 'user_1', apiKeyEncrypted: 'enc_key', apiSecretEncrypted: 'enc_secret', apiKeyKeyVersion: 1 };

    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    const result = await service.triggerGridOrder('order_1', 99.5);

    expect(prismaMock.gridOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order_1', status: 'pending' },
      data: { status: 'filled', placedAt: expect.any(Date) },
    });

    expect(executionEngineMock.executeSingleMarketBuyEncrypted).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      orderId: 'order_1',
      status: 'tp_placed',
      exchangeOrderId: 'ex_order_1',
      tpExchangeOrderId: 'ex_tp_1',
    });
  });

  it('does NOT call the exchange when the claim fails because the order is already filled', async () => {
    const alreadyFilled = buildOrderRow({ status: 'filled' });

    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(alreadyFilled),
        update: jest.fn(),
      },
      exchangeAccount: {
        findUnique: jest.fn(),
      },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    const result = await service.triggerGridOrder('order_1', 99.5);

    expect(result).toEqual({ skipped: true, reason: 'Order already processed' });
    expect(executionEngineMock.executeSingleMarketBuyEncrypted).not.toHaveBeenCalled();
    expect(prismaMock.exchangeAccount.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the order does not exist at all', async () => {
    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      exchangeAccount: { findUnique: jest.fn() },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    await expect(service.triggerGridOrder('missing_order', 99.5)).rejects.toThrow(NotFoundException);
    expect(executionEngineMock.executeSingleMarketBuyEncrypted).not.toHaveBeenCalled();
  });

  it('marks the order as error (without leaving it stuck at "filled") if no exchange account is bound', async () => {
    const order = buildOrderRow();

    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    await expect(service.triggerGridOrder('order_1', 99.5)).rejects.toThrow(NotFoundException);
    expect(executionEngineMock.executeSingleMarketBuyEncrypted).not.toHaveBeenCalled();
    expect(prismaMock.gridOrder.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: 'error' },
    });
  });

  it('simulated concurrency: two callers racing for the same order → exactly one executes, one is skipped', async () => {
    const order = buildOrderRow();
    const account = { id: 'account_1', userId: 'user_1', apiKeyEncrypted: 'enc_key', apiSecretEncrypted: 'enc_secret', apiKeyKeyVersion: 1 };

    // Shared mutable "row" standing in for the DB. The updateMany mock
    // reproduces the semantics of `UPDATE ... WHERE status = 'pending'`:
    // only the first caller whose WHERE clause still matches the current
    // row state gets count=1; every other caller gets count=0.
    const sharedRow = { status: 'pending' };

    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn(({ where, data }: any) => {
          if (sharedRow.status === where.status) {
            sharedRow.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: jest.fn().mockImplementation(() => ({ ...order, status: sharedRow.status })),
        update: jest.fn().mockResolvedValue({}),
      },
      exchangeAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
      },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    const [resultA, resultB] = await Promise.all([
      service.triggerGridOrder('order_1', 99.5),
      service.triggerGridOrder('order_1', 99.5),
    ]);

    const results = [resultA, resultB];
    const executedCount = results.filter((r: any) => !r.skipped).length;
    const skippedCount = results.filter((r: any) => r.skipped).length;

    expect(executedCount).toBe(1);
    expect(skippedCount).toBe(1);
    expect(executionEngineMock.executeSingleMarketBuyEncrypted).toHaveBeenCalledTimes(1);
  });
});

describe('ExecutionService.stopExecution — atomic claim', () => {
  it('claims the strategy (active -> stopping) scoped to the owning user before doing anything else', async () => {
    const strategy = buildStrategyRow();
    const account = { id: 'account_1', userId: 'user_1', apiKeyEncrypted: 'k', apiSecretEncrypted: 's', apiKeyKeyVersion: 1 };

    const prismaMock = {
      gridStrategy: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(strategy),
        update: jest.fn().mockResolvedValue({ id: 'strategy_1', status: 'stopped', stoppedAt: new Date() }),
      },
      exchangeAccount: { findUnique: jest.fn().mockResolvedValue(account) },
      gridOrder: { update: jest.fn().mockResolvedValue({}) },
    };

    const { service, executionEngineMock } = buildService(prismaMock);
    executionEngineMock.cancelAllOpenOrdersEncrypted.mockResolvedValue({ canceled: [], errors: [] });

    const result = await service.stopExecution('user_1', 'strategy_1');

    expect(prismaMock.gridStrategy.updateMany).toHaveBeenCalledWith({
      where: { id: 'strategy_1', userId: 'user_1', status: 'active' },
      data: { status: 'stopping' },
    });
    expect(result).toMatchObject({ strategyId: 'strategy_1', status: 'stopped' });
  });

  it('does NOT attempt to cancel orders when the claim fails because the strategy is already stopped', async () => {
    const prismaMock = {
      gridStrategy: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(buildStrategyRow({ status: 'stopped' })),
        update: jest.fn(),
      },
      exchangeAccount: { findUnique: jest.fn() },
      gridOrder: { update: jest.fn() },
    };

    const { service, executionEngineMock } = buildService(prismaMock);

    await expect(service.stopExecution('user_1', 'strategy_1')).rejects.toThrow('Strategy is not active');
    expect(executionEngineMock.cancelAllOpenOrdersEncrypted).not.toHaveBeenCalled();
    expect(prismaMock.exchangeAccount.findUnique).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the strategy belongs to a different user, without leaking existence', async () => {
    const prismaMock = {
      gridStrategy: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }), // WHERE included userId, so a mismatch also yields count 0
        findUnique: jest.fn().mockResolvedValue(buildStrategyRow({ userId: 'someone_else' })),
        update: jest.fn(),
      },
      exchangeAccount: { findUnique: jest.fn() },
      gridOrder: { update: jest.fn() },
    };

    const { service } = buildService(prismaMock);

    await expect(service.stopExecution('user_1', 'strategy_1')).rejects.toThrow('You do not own this strategy');
  });

  it('simulated concurrency: two "Stop" calls racing for the same strategy → exactly one cancels, one is rejected', async () => {
    const account = { id: 'account_1', userId: 'user_1', apiKeyEncrypted: 'k', apiSecretEncrypted: 's', apiKeyKeyVersion: 1 };
    const sharedRow = { status: 'active', userId: 'user_1' };

    const prismaMock = {
      gridStrategy: {
        updateMany: jest.fn(({ where, data }: any) => {
          if (sharedRow.status === where.status && sharedRow.userId === where.userId) {
            sharedRow.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: jest.fn().mockImplementation(() =>
          buildStrategyRow({ status: sharedRow.status, userId: sharedRow.userId }),
        ),
        update: jest.fn().mockResolvedValue({ id: 'strategy_1', status: 'stopped', stoppedAt: new Date() }),
      },
      exchangeAccount: { findUnique: jest.fn().mockResolvedValue(account) },
      gridOrder: { update: jest.fn().mockResolvedValue({}) },
    };

    const { service, executionEngineMock } = buildService(prismaMock);
    executionEngineMock.cancelAllOpenOrdersEncrypted.mockResolvedValue({ canceled: [], errors: [] });

    const settled = await Promise.allSettled([
      service.stopExecution('user_1', 'strategy_1'),
      service.stopExecution('user_1', 'strategy_1'),
    ]);

    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(executionEngineMock.cancelAllOpenOrdersEncrypted).toHaveBeenCalledTimes(1);
  });
});

/**
 * Integration-level proof that Postgres itself serializes the conditional
 * UPDATE (the guarantee the unit tests above assume). Requires a real
 * database and is skipped by default — wire up TEST_DATABASE_URL and a
 * seeded row in CI to enable it.
 */
describe.skip('ExecutionService — real database concurrency (integration)', () => {
  it('only one of N concurrent claims against a live Postgres row succeeds', async () => {
    // Intentionally left unimplemented — requires TEST_DATABASE_URL wiring.
  });
});
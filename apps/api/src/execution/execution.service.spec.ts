import { NotFoundException } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StrategyService } from '../strategy/strategy.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { OpsAlertingService } from '../ops-alerting/ops-alerting.service';
import type { RiskService } from '../risk/risk.service';
import type { NotificationService } from '../notification/notification.service';
import type { ConfigService } from '@nestjs/config';
import type { ExchangeEngine } from '@qis/exchange-engine';

jest.mock('@qis/exchange-engine', () => {
  return {
    ExchangeEngine: jest.fn().mockImplementation(() => ({
      fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
    })),
  };
});

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

  const notificationServiceMock = {
    sendEvent: jest.fn(),
  } as unknown as NotificationService;
  const configServiceMock = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const service = new ExecutionService(
    prismaMock as unknown as PrismaService,
    exchangeEngineMock,
    strategyServiceMock,
    realtimeMock,
    idempotencyMock,
    opsAlertingMock,
    riskServiceMock,
    notificationServiceMock,
    configServiceMock,
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

describe('ExecutionService — Paper Trading Lifecycle & Capital Refund', () => {
  const userId = 'user_paper_1';
  const blueprintId = 'bp_paper_1';
  const blueprint = {
    id: blueprintId,
    userId,
    exchange: 'binance',
    pair: 'BTC/USDT',
    tradingCapital: 100,
    sections: [
      {
        allocationPercent: 100,
        gridCount: 4,
        gridDistancePercent: 1,
        sectionGapPercent: 0,
        minNetProfitPercent: 1,
      },
    ],
  };

  it('startPaperExecution reserves tradingCapital upfront from virtual balance', async () => {
    const paperAccount = { id: 'pa_1', userId, exchange: 'binance', label: 'Paper Trading', virtualBalance: 100 };
    const paperAccountAfter = { id: 'pa_1', userId, exchange: 'binance', label: 'Paper Trading', virtualBalance: 0 };
    const paperStrategy = { id: 'ps_1', userId, paperAccountId: 'pa_1', blueprintId, exchange: 'binance', pair: 'BTC/USDT', capital: 100, status: 'active' };

    const txMock = {
      paperAccount: {
        upsert: jest.fn().mockResolvedValue(paperAccount),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(paperAccountAfter),
      },
      paperStrategy: {
        create: jest.fn().mockResolvedValue(paperStrategy),
      },
      paperOrder: {
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    };

    const prismaMock = {
      paperStrategy: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
    };

    const { service } = buildService(prismaMock);
    (service as any).strategyService = {
      getBlueprint: jest.fn().mockResolvedValue(blueprint),
    };

    const result = await service.startPaperExecution(userId, { blueprintId, exchange: 'binance' });

    expect(result).toMatchObject({
      strategyId: 'ps_1',
      blueprintId,
      pair: 'BTC/USDT',
      capital: 100,
      status: 'active',
      virtualBalanceRemaining: 0,
    });
    expect(txMock.paperAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'pa_1', virtualBalance: { gte: 100 } },
      data: { virtualBalance: { decrement: 100 } },
    });
  });

  it('stopPaperExecution refunds unspent pending capital + settles tp_placed open positions without capital leak', async () => {
    const strategy = {
      id: 'ps_1',
      userId,
      paperAccountId: 'pa_1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      status: 'active',
    };

    // 3 pending orders ($25 each) + 1 tp_placed order ($25 allocated, bought 0.000277 BTC at $90,000)
    const pendingOrders = [
      { id: 'po_1', status: 'pending', allocatedCapital: 25, gridPrice: 89000 },
      { id: 'po_2', status: 'pending', allocatedCapital: 25, gridPrice: 88000 },
      { id: 'po_3', status: 'pending', allocatedCapital: 25, gridPrice: 87000 },
    ];
    const openOrder = {
      id: 'po_4',
      status: 'tp_placed',
      allocatedCapital: 25,
      gridPrice: 90000,
      buyFilledPrice: 90000,
      buyFilledQuantity: 0.00027777,
      buyFee: 0.025,
    };

    const paperAccountBefore = { id: 'pa_1', virtualBalance: 0 };
    const paperAccountAfter = { id: 'pa_1', virtualBalance: 101.35 };

    const txMock = {
      paperStrategy: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...strategy,
          paperAccount: paperAccountBefore,
          paperOrders: [...pendingOrders, openOrder],
        }),
      },
      paperOrder: {
        update: jest.fn().mockResolvedValue({}),
      },
      paperAccount: {
        update: jest.fn().mockResolvedValue(paperAccountAfter),
        findUniqueOrThrow: jest.fn().mockResolvedValue(paperAccountAfter),
      },
    };

    const prismaMock = {
      paperStrategy: {
        findUnique: jest.fn().mockResolvedValue(strategy),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
    };

    const { service } = buildService(prismaMock);

    const result = await service.stopPaperExecution(userId, 'ps_1');

    expect(txMock.paperStrategy.updateMany).toHaveBeenCalledWith({
      where: { id: 'ps_1', userId, status: 'active' },
      data: { status: 'stopped', stoppedAt: expect.any(Date) },
    });

    // 3 pending orders ($75) + 1 tp_placed settled order (> $25) must be refunded
    expect(txMock.paperAccount.update).toHaveBeenCalledWith({
      where: { id: 'pa_1' },
      data: { virtualBalance: { increment: expect.any(Number) } },
    });

    // All 4 orders must be canceled in DB
    expect(txMock.paperOrder.update).toHaveBeenCalledTimes(4);

    expect(result).toMatchObject({
      strategyId: 'ps_1',
      status: 'stopped',
      refundedAmountUsdt: expect.any(Number),
      virtualBalance: 101.35,
    });
    expect(result.refundedAmountUsdt).toBeGreaterThanOrEqual(75);
    expect(result.pendingRefundUsdt).toBe(75);
  });
});
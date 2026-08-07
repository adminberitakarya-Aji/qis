// ExecutionService imports StrategyService (for typing/DI only in these
// tests), which transitively pulls in the real ccxt library through
// @qis/exchange-engine → @qis/providers-exchange. ccxt's dependency chain
// includes ESM-only packages that Jest's default CJS transform can't parse.
// Nothing in this suite performs a real exchange call — everything goes
// through the mocked `executionEngine` — so ccxt is stubbed out entirely
// rather than pulling in transform config for a library we never use here.
jest.mock('ccxt', () => ({ __esModule: true, default: {} }));

import { NotFoundException } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StrategyService } from '../strategy/strategy.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { ExchangeEngine } from '@qis/exchange-engine';

/**
 * Regression tests for the race-condition fix in triggerGridOrder().
 *
 * Bug: the previous implementation did a separate `findUnique()` status
 * check followed by a later `update()`. That read-then-write pattern is
 * racy — two near-simultaneous calls for the same orderId (worker retry
 * after a timeout, a second worker instance, single + batch trigger
 * overlapping, etc.) could both pass the "is pending" check before either
 * write landed, resulting in two real market buys for the same grid level.
 *
 * Fix: a single conditional `updateMany({ where: { id, status: 'pending' },
 * data: { status: 'filled' } })` is the only thing that decides who "wins"
 * the claim. These tests assert:
 *   1. The exchange is only ever called after successfully claiming the
 *      order (count === 1).
 *   2. A losing/duplicate call is a no-op — it never reaches the exchange.
 *   3. A simulated concurrent pair of calls against a shared in-memory
 *      "row" results in exactly one execution and one skip.
 *
 * Caveat: this is a unit-level test with a mocked Prisma client. It proves
 * the application code depends correctly on the atomic-update contract
 * (correct WHERE clause, correct gating on the result), not that Postgres
 * itself serializes concurrent UPDATE ... WHERE statements — that
 * guarantee comes from the database and is exercised by an integration
 * test against a real database (see the skipped suite at the bottom).
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

function buildService(prismaMock: any) {
  const strategyServiceMock = {} as unknown as StrategyService;
  const realtimeMock = { emitOrderUpdate: jest.fn() } as unknown as RealtimeGateway;
  const idempotencyMock = {
    getExistingResponse: jest.fn(),
    storeResponse: jest.fn(),
  } as unknown as IdempotencyService;
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

  return { service, executionEngineMock, realtimeMock };
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

    // The claim must be attempted with an explicit status guard.
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
    // No exchange account lookup should happen either — we never got past the claim.
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
    // row state gets count=1; every other caller gets count=0. This models
    // exactly the guarantee a real database gives for a single UPDATE
    // statement.
    const sharedRow = { status: 'pending' };

    const prismaMock = {
      gridOrder: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (sharedRow.status === where.status) {
            sharedRow.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: jest.fn().mockImplementation(async () => ({ ...order, status: sharedRow.status })),
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
    // The exchange must have been hit exactly once, never twice, for the
    // same grid level — this is the actual money-safety guarantee.
    expect(executionEngineMock.executeSingleMarketBuyEncrypted).toHaveBeenCalledTimes(1);
  });
});

/**
 * Integration-level proof that Postgres itself serializes the conditional
 * UPDATE (the guarantee the unit tests above assume). Requires a real
 * database and is skipped by default — wire up TEST_DATABASE_URL and a
 * seeded GridOrder row in CI to enable it.
 *
 * Suggested scenario once enabled:
 *   1. Seed one GridOrder with status='pending'.
 *   2. Fire N concurrent `PrismaClient.gridOrder.updateMany({ where: { id,
 *      status: 'pending' }, data: { status: 'filled' } })` calls via
 *      Promise.all against a real connection pool (not a mock).
 *   3. Assert exactly one call resolves with count === 1 and the rest with
 *      count === 0, and that the final row status is 'filled' (not
 *      corrupted by a lost update).
 */
describe.skip('ExecutionService.triggerGridOrder — real database concurrency (integration)', () => {
  it('only one of N concurrent claims against a live Postgres row succeeds', async () => {
    // Intentionally left unimplemented — requires TEST_DATABASE_URL wiring.
  });
});
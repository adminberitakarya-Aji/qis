import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StrategyService } from '../strategy/strategy.service';
import { StartExecutionDto } from './dto/start-execution.dto';
import { EXCHANGE_ENGINE } from '../engines/engines.module';
import { ExchangeEngine, type DecryptContext } from '@qis/exchange-engine';
import { ExecutionEngine, type ExecutionOrderState } from '@qis/execution-engine';
import { GridEngine } from '@qis/grid-engine';
import type { Blueprint } from '@qis/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OpsAlertingService } from '../ops-alerting/ops-alerting.service';
import { createServiceLogger } from '@qis/logger';

@Injectable()
export class ExecutionService {
  private readonly logger = createServiceLogger('qis-api:execution');
  private executionEngine: ExecutionEngine;
  private gridEngine = new GridEngine();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ENGINE) exchangeEngine: ExchangeEngine,
    private readonly strategyService: StrategyService,
    private readonly realtime: RealtimeGateway,
    private readonly idempotency: IdempotencyService,
    private readonly opsAlerting: OpsAlertingService,
  ) {
    // Reuse the shared Exchange Engine singleton so that all decryption stays
    // inside the same Master Key boundary. Execution Engine itself never
    // touches plaintext; it forwards the ciphertext to Exchange Engine.
    this.executionEngine = new ExecutionEngine(exchangeEngine);
  }

  async startExecution(userId: string, dto: StartExecutionDto, idempotencyKey?: string) {
    // 0. Idempotency check — return cached response if key already processed
    if (idempotencyKey) {
      const cached = await this.idempotency.getExistingResponse(
        userId,
        idempotencyKey,
        'execution.start',
      );
      if (cached) return cached;
    }

    // 1. Validate Blueprint exists, is not expired, and belongs to the user
    const blueprint: Blueprint = await this.strategyService.getBlueprint(userId, dto.blueprintId);

    const now = new Date();
    if (blueprint.expiresAt && new Date(blueprint.expiresAt) < now) {
      throw new BadRequestException(
        'Strategy Blueprint has expired. Please generate a new strategy.',
      );
    }

    // 2. Check for existing active strategy on same blueprint
    const existingStrategy = await this.prisma.gridStrategy.findUnique({
      where: { blueprintId: dto.blueprintId },
    });

    if (existingStrategy && existingStrategy.status === 'active') {
      throw new BadRequestException(
        'An active strategy is already running for this Blueprint.',
      );
    }

    // 3. Fetch exchange account (no decryption here — credentials stay encrypted)
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: dto.exchangeAccountId },
    });

    if (!account) throw new NotFoundException('Exchange account not found');
    if (account.userId !== userId) throw new ForbiddenException('You do not own this exchange account');

    // 4. Get current market price to anchor grid levels (Market Engine, no creds needed)
    let currentPrice = 100;
    try {
      // Market data uses public endpoints (no credentials), so a local
      // Engine instance is fine — no need to share the Exchange Engine here.
      const { ExchangeEngine: ExchangeEngineClass } = await import('@qis/exchange-engine');
      const publicTicker = new ExchangeEngineClass();
      const ticker = await publicTicker.fetchTicker(
        blueprint.exchange as 'binance' | 'bybit',
        blueprint.pair,
      );
      currentPrice = ticker.last || currentPrice;
    } catch {
      // fallback price — execution will use blueprint grid prices as-is
    }

    // 5. Create GridStrategy record in DB
    const gridStrategy = await this.prisma.gridStrategy.create({
      data: {
        userId,
        blueprintId: blueprint.id,
        exchangeAccountId: account.id,
        exchange: blueprint.exchange,
        pair: blueprint.pair,
        capital: blueprint.tradingCapital,
        status: 'active',
      },
    });

    // 6. Build order states from blueprint
    const gridResult = this.gridEngine.buildGrid({
      currentPrice,
      totalCapital: blueprint.tradingCapital,
      sections: blueprint.sections.map((s) => ({
        allocationPercent: s.allocationPercent,
        gridCount: s.gridCount,
        gridDistancePercent: s.gridDistancePercent,
        sectionGapPercent: s.sectionGapPercent,
        minNetProfitPercent: s.minNetProfitPercent,
      })),
    });

    // 7. Persist GridOrder records to DB with 'pending' status.
    //    In the trigger-based model (Mode B), grid levels are VIRTUAL trigger
    //    points — NO limit orders are placed in the order book at start.
    //    The Worker monitors real-time price and triggers a MARKET BUY when
    //    price touches/crosses a grid level.
    const gridOrderData = gridResult.sections.flatMap((section) =>
      section.orders.map((order) => ({
        gridStrategyId: gridStrategy.id,
        sectionIndex: order.sectionIndex,
        orderIndex: order.orderIndex,
        globalOrderIndex: order.globalOrderIndex,
        clientOrderId: `${gridStrategy.id}_g${order.globalOrderIndex}`,
        gridPrice: order.gridPrice,
        tpPrice: order.estimatedTpPrice,
        allocatedCapital: order.allocatedCapitalUsdt,
        estimatedQuantity: order.estimatedQuantity,
        status: 'pending',
      })),
    );

    await this.prisma.gridOrder.createMany({ data: gridOrderData });

    this.logger.info('Strategy started in trigger-based mode', {
      strategyId: gridStrategy.id,
      gridLevels: gridOrderData.length,
    });

    const result = {
      strategyId: gridStrategy.id,
      blueprintId: blueprint.id,
      pair: blueprint.pair,
      exchange: blueprint.exchange,
      capital: blueprint.tradingCapital,
      status: 'active',
      ordersSummary: {
        total: gridOrderData.length,
        pending: gridOrderData.length,
      },
    };

    // Store idempotency response
    if (idempotencyKey) {
      await this.idempotency.storeResponse(userId, idempotencyKey, 'execution.start', result);
    }

    return result;
  }

  async stopExecution(userId: string, strategyId: string, idempotencyKey?: string) {
    // 0. Idempotency check — return cached response if key already processed
    if (idempotencyKey) {
      const cached = await this.idempotency.getExistingResponse(
        userId,
        idempotencyKey,
        'execution.stop',
      );
      if (cached) return cached;
    }

    // Atomically claim the strategy for stopping: a single conditional
    // UPDATE moves it from 'active' to 'stopping', scoped to the owning
    // user in the same WHERE clause. The previous implementation did a
    // separate findUnique() + status/ownership check followed by a later
    // update() to 'stopped' — a check-then-act race, same class as the
    // one fixed in triggerGridOrder(). Lower blast radius here (worst case
    // was cancelAllOpenOrdersEncrypted() running twice, which the exchange
    // mostly no-ops on already-canceled orders), but a double-tap on
    // "Stop" in the UI or a retried API call could otherwise both pass the
    // "is active" check and both attempt to cancel + finalize concurrently.
    //
    // Using 'stopping' as a real intermediate status (not just a comment)
    // also closes a second, subtler gap: triggerGridOrdersBatch() and the
    // worker's active-strategy query both filter on status === 'active',
    // so as soon as this claim lands, no new grid order can be triggered
    // for this strategy while cancellation is still in flight — previously
    // the strategy stayed 'active' in the DB for the entire duration of
    // the cancel-orders call, leaving a window where the worker could
    // still trigger a fresh buy mid-shutdown.
    const claim = await this.prisma.gridStrategy.updateMany({
      where: { id: strategyId, userId, status: 'active' },
      data: { status: 'stopping' },
    });

    if (claim.count === 0) {
      // Distinguish not-found / not-owned / already-inactive only for a
      // clear error message — this extra read sits off the atomic hot
      // path above.
      const existing = await this.prisma.gridStrategy.findUnique({ where: { id: strategyId } });
      if (!existing) throw new NotFoundException('Grid strategy not found');
      if (existing.userId !== userId) throw new ForbiddenException('You do not own this strategy');
      throw new BadRequestException('Strategy is not active');
    }

    // Strategy is now safely claimed as 'stopping' by this call, and only
    // this call. Re-fetch with orders for the cancel step below.
    const strategy = await this.prisma.gridStrategy.findUnique({
      where: { id: strategyId },
      include: { orders: true },
    });

    if (!strategy) {
      // Defensive only — we just claimed this row, it cannot legitimately
      // be gone.
      throw new NotFoundException('Grid strategy not found after claim');
    }

    // Fetch exchange account via the strategy's explicit binding
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: strategy.exchangeAccountId },
    });

    if (account) {
      const credentials = {
        encryptedApiKey: account.apiKeyEncrypted,
        encryptedApiSecret: account.apiSecretEncrypted,
        keyVersion: account.apiKeyKeyVersion,
        context: {
          exchangeAccountId: account.id,
          userId: account.userId,
          purpose: 'stopExecution',
        } satisfies DecryptContext,
      };

      // Build order states from DB for cancellation
      const orderStates: ExecutionOrderState[] = strategy.orders.map((o) => ({
        dbId: o.id,
        clientOrderId: o.clientOrderId,
        exchangeOrderId: o.exchangeOrderId,
        tpExchangeOrderId: o.tpExchangeOrderId,
        sectionIndex: o.sectionIndex,
        orderIndex: o.orderIndex,
        globalOrderIndex: o.globalOrderIndex,
        gridPrice: o.gridPrice,
        tpPrice: o.tpPrice,
        allocatedCapital: o.allocatedCapital,
        estimatedQuantity: o.estimatedQuantity,
        status: o.status as any,
        buyFilledPrice: o.buyFilledPrice,
        buyFilledQuantity: o.buyFilledQuantity,
        buyFee: o.buyFee,
        tpFilledPrice: o.tpFilledPrice,
        tpFee: o.tpFee,
        realizedPnl: o.realizedPnl,
      }));

      try {
        // Cancel all open orders via the encrypted path
        const cancelResult = await this.executionEngine.cancelAllOpenOrdersEncrypted(
          strategy.exchange as 'binance' | 'bybit',
          credentials,
          strategy.pair,
          orderStates,
        );

        // Update canceled orders in DB
        for (const o of orderStates) {
          if (o.status === 'canceled') {
            await this.prisma.gridOrder.update({
              where: { clientOrderId: o.clientOrderId },
              data: { status: 'canceled' },
            });
          }
        }

        this.logger.info('Stop strategy', {
          strategyId,
          canceled: cancelResult.canceled,
          errors: cancelResult.errors,
        });
      } catch (err: any) {
        // Unhandled error in stopExecution — this is a critical operational event
        await this.opsAlerting.stopExecutionError({
          strategyId,
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
    }

    // Update strategy status
    const updated = await this.prisma.gridStrategy.update({
      where: { id: strategyId },
      data: { status: 'stopped', stoppedAt: new Date() },
    });

    const result = { strategyId: updated.id, status: updated.status, stoppedAt: updated.stoppedAt };

    // Store idempotency response
    if (idempotencyKey) {
      await this.idempotency.storeResponse(userId, idempotencyKey, 'execution.stop', result);
    }

    return result;
  }

  async getActiveStrategies(userId: string) {
    const strategies = await this.prisma.gridStrategy.findMany({
      where: { userId, status: 'active' },
      include: { orders: true },
      orderBy: { startedAt: 'desc' },
    });

    return strategies.map((s) => {
      const summary = this.executionEngine.summarizeOrders(
        s.orders.map((o) => ({
          dbId: o.id,
          clientOrderId: o.clientOrderId,
          exchangeOrderId: o.exchangeOrderId,
          tpExchangeOrderId: o.tpExchangeOrderId,
          sectionIndex: o.sectionIndex,
          orderIndex: o.orderIndex,
          globalOrderIndex: o.globalOrderIndex,
          gridPrice: o.gridPrice,
          tpPrice: o.tpPrice,
          allocatedCapital: o.allocatedCapital,
          estimatedQuantity: o.estimatedQuantity,
          status: o.status as any,
          buyFilledPrice: o.buyFilledPrice,
          buyFilledQuantity: o.buyFilledQuantity,
          buyFee: o.buyFee,
          tpFilledPrice: o.tpFilledPrice,
          tpFee: o.tpFee,
          realizedPnl: o.realizedPnl,
        })),
      );

      return {
        strategyId: s.id,
        blueprintId: s.blueprintId,
        exchange: s.exchange,
        pair: s.pair,
        capital: s.capital,
        status: s.status,
        startedAt: s.startedAt,
        ordersSummary: summary,
      };
    });
  }

  async getStrategyOrders(userId: string, strategyId: string) {
    const strategy = await this.prisma.gridStrategy.findUnique({
      where: { id: strategyId },
      include: { orders: { orderBy: { globalOrderIndex: 'asc' } } },
    });

    if (!strategy) throw new NotFoundException('Grid strategy not found');
    if (strategy.userId !== userId) throw new ForbiddenException('You do not own this strategy');

    return strategy.orders;
  }

  // ============================================================
  // Internal Worker Methods (called by Binance WebSocket Worker)
  // ============================================================

  /**
   * Returns all ACTIVE strategies with their pending grid orders.
   * Called by the Binance WebSocket Worker on startup and every 60s.
   * Returns data in the format the Worker expects for price monitoring.
   */
  async getAllActiveStrategiesForWorker() {
    const strategies = await this.prisma.gridStrategy.findMany({
      where: { status: 'active' },
      include: {
        orders: {
          where: { status: 'pending' },
          orderBy: { globalOrderIndex: 'asc' },
        },
        blueprint: true,
      },
    });

    return strategies.map((s) => ({
      strategyId: s.id,
      symbol: s.pair,
      exchange: s.exchange,
      // Capital Protection on Gaps: max % of capital that can be executed
      // in a single price movement (Level Crossing Rule)
      maxCapitalPerMovementPercent: s.blueprint?.maxCapitalPerMovementPercent ?? 40,
      pendingOrders: s.orders.map((o) => ({
        orderId: o.id,
        symbol: s.pair,
        gridPrice: o.gridPrice,
        tpPrice: o.tpPrice,
        sectionIndex: o.sectionIndex,
        orderIndex: o.orderIndex,
        allocatedCapital: o.allocatedCapital,
      })),
    }));
  }

  /**
   * Triggers multiple Market Buys when a price gap crosses several grid levels.
   *
   * Capital Protection on Gaps (BUSINESS_RULES.md):
   * - Max % of capital that can be executed in a single price movement
   * - If a gap would trigger more than the max %, only the first max % is executed
   * - Remaining crossed levels wait for the next price movement
   */
  async triggerGridOrdersBatch(
    strategyId: string,
    orderIds: string[],
    triggeredPrice: number
  ) {
    if (!orderIds || orderIds.length === 0) {
      return { executed: [], skipped: [] };
    }

    const strategy = await this.prisma.gridStrategy.findUnique({
      where: { id: strategyId },
      include: { blueprint: true },
    });

    if (!strategy || strategy.status !== 'active') {
      return { executed: [], skipped: orderIds };
    }

    // Fetch all pending orders for this strategy
    const orders = await this.prisma.gridOrder.findMany({
      where: {
        id: { in: orderIds },
        gridStrategyId: strategyId,
        status: 'pending',
      },
      orderBy: { globalOrderIndex: 'asc' },
    });

    if (orders.length === 0) {
      return { executed: [], skipped: orderIds };
    }

    // Capital Protection on Gaps: enforce max capital per movement
    const maxCapitalPercent = strategy.blueprint?.maxCapitalPerMovementPercent ?? 40;
    const maxCapitalUsdt = (strategy.capital * maxCapitalPercent) / 100;

    // Select orders up to the max capital limit
    let accumulatedCapital = 0;
    const ordersToExecute: typeof orders = [];
    const ordersSkipped: string[] = [];

    for (const order of orders) {
      if (accumulatedCapital + order.allocatedCapital <= maxCapitalUsdt) {
        ordersToExecute.push(order);
        accumulatedCapital += order.allocatedCapital;
      } else {
        ordersSkipped.push(order.id);
      }
    }

    this.logger.info('Batch trigger result', {
      strategyId,
      executed: ordersToExecute.length,
      accumulatedCapitalUsdt: Number(accumulatedCapital.toFixed(2)),
      skipped: ordersSkipped.length,
      maxCapitalPercent,
    });

    // Execute each selected order
    const executed: any[] = [];
    for (const order of ordersToExecute) {
      try {
        const result = await this.triggerGridOrder(order.id, triggeredPrice);
        executed.push(result);
      } catch (err: any) {
        this.logger.error('Batch trigger failed for order', { orderId: order.id }, err);
        ordersSkipped.push(order.id);
      }
    }

    return { executed, skipped: ordersSkipped };
  }

  /**
   * Triggers a Market Buy when the Binance WebSocket Worker detects
   * that current price has crossed a grid level downwards.
   *
   * Level Crossing Rule (from BUSINESS_RULES.md):
   * - Buy is Market Order at current market price (not limit)
   * - TP is placed immediately after fill confirmation
   * - Actual fill price is recorded for TP calculation
   */
  async triggerGridOrder(orderId: string, triggeredPrice: number) {
    // Atomically claim this order: a single conditional UPDATE moves it from
    // 'pending' to 'filled' and is the ONLY thing that guards against
    // double-trigger. The previous implementation did a separate
    // findUnique() status check followed by a later update() — that
    // read-then-write pattern is racy: two near-simultaneous calls for the
    // same orderId (worker retry after a timeout, single + batch trigger
    // overlapping, a second worker instance, etc.) could both pass the
    // "is pending" check before either write landed, causing two real
    // market buys for the same grid level. A single UPDATE ... WHERE
    // status = 'pending' is atomic at the database level, so only one
    // caller can ever win the claim.
    const claim = await this.prisma.gridOrder.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'filled', placedAt: new Date() },
    });

    if (claim.count === 0) {
      // Either the order doesn't exist, or another concurrent call already
      // claimed it. This extra read is only for a clear error/skip message
      // and sits off the atomic hot path above.
      const existing = await this.prisma.gridOrder.findUnique({ where: { id: orderId } });
      if (!existing) throw new NotFoundException(`Grid order ${orderId} not found`);
      this.logger.warn('Order is not pending, skipping', { orderId, status: existing.status });
      return { skipped: true, reason: 'Order already processed' };
    }

    // Order is now safely claimed as 'filled' by this call, and only this
    // call. Re-fetch with the strategy relation for execution details.
    const order = await this.prisma.gridOrder.findUnique({
      where: { id: orderId },
      include: { gridStrategy: true },
    });

    if (!order) {
      // Defensive only — we just claimed this row, it cannot legitimately
      // be gone.
      throw new NotFoundException(`Grid order ${orderId} not found after claim`);
    }

    const strategy = order.gridStrategy;

    // Fetch exchange account via the strategy's explicit binding
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: strategy.exchangeAccountId },
    });

    if (!account) {
      this.logger.error('No exchange account bound to strategy', { strategyId: strategy.id });
      // The order was already claimed as 'filled' above but no buy was
      // actually executed — mark it 'error' so it doesn't look like a
      // real fill in the UI/analytics.
      await this.prisma.gridOrder.update({
        where: { id: orderId },
        data: { status: 'error' },
      });
      throw new NotFoundException('No exchange account bound to strategy');
    }

    const credentials = {
      encryptedApiKey: account.apiKeyEncrypted,
      encryptedApiSecret: account.apiSecretEncrypted,
      keyVersion: account.apiKeyKeyVersion,
      context: {
        exchangeAccountId: account.id,
        userId: account.userId,
        purpose: 'triggerGridOrder',
      } satisfies DecryptContext,
    };

    // Build order state for ExecutionEngine
    const orderState: ExecutionOrderState = {
      dbId: order.id,
      clientOrderId: order.clientOrderId,
      exchangeOrderId: order.exchangeOrderId,
      tpExchangeOrderId: order.tpExchangeOrderId,
      sectionIndex: order.sectionIndex,
      orderIndex: order.orderIndex,
      globalOrderIndex: order.globalOrderIndex,
      gridPrice: order.gridPrice,
      tpPrice: order.tpPrice,
      allocatedCapital: order.allocatedCapital,
      estimatedQuantity: order.estimatedQuantity,
      status: 'pending',
      buyFilledPrice: null,
      buyFilledQuantity: null,
      buyFee: null,
      tpFilledPrice: null,
      tpFee: null,
      realizedPnl: null,
    };

    try {
      // Execute Market Buy via the encrypted path; decryption + audit log
      // happen inside Exchange Engine. The order was already atomically
      // claimed as 'filled' above, so no other concurrent caller can re-enter
      // this block for the same orderId.
      const fillResult = await this.executionEngine.executeSingleMarketBuyEncrypted(
        strategy.exchange as 'binance' | 'bybit',
        credentials,
        strategy.pair,
        orderState,
        triggeredPrice,
      );

      // Check if market buy failed after all retries (exchangeOrderId and filledPrice will be null)
      if (!fillResult.exchangeOrderId || fillResult.filledPrice === null) {
        await this.opsAlerting.exchangeRetryExhausted({
          operation: 'market_buy',
          orderId,
          strategyId: strategy.id,
          exchange: strategy.exchange,
          symbol: strategy.pair,
          attempts: 3, // MAX_RETRY from ExecutionEngine
          lastError: 'All retry attempts exhausted',
        });

        // Mark order as error
        await this.prisma.gridOrder.update({
          where: { id: orderId },
          data: { status: 'error' },
        }).catch(() => {});

        throw new Error('Market buy failed after all retry attempts');
      }

      // Update order with actual fill data
      await this.prisma.gridOrder.update({
        where: { id: orderId },
        data: {
          status: 'filled',
          exchangeOrderId: fillResult.exchangeOrderId ?? undefined,
          buyFilledPrice: fillResult.filledPrice ?? triggeredPrice,
          buyFilledQuantity: fillResult.filledQuantity ?? order.estimatedQuantity,
          buyFee: fillResult.fee ?? 0,
          filledAt: new Date(),
        },
      });

      // If TP SELL LIMIT was placed, update the order with its exchange ID
      if (fillResult.tpExchangeOrderId) {
        await this.prisma.gridOrder.update({
          where: { id: orderId },
          data: {
            status: 'tp_placed',
            tpExchangeOrderId: fillResult.tpExchangeOrderId,
          },
        });
      } else {
        // TP placement failed after all retries - alert
        await this.opsAlerting.exchangeRetryExhausted({
          operation: 'tp_placement',
          orderId,
          strategyId: strategy.id,
          exchange: strategy.exchange,
          symbol: strategy.pair,
          attempts: 3, // MAX_RETRY from ExecutionEngine
          lastError: 'All retry attempts exhausted for TP placement',
        });
      }

      this.logger.info('Order filled', {
        orderId,
        pair: strategy.pair,
        filledPrice: fillResult.filledPrice ?? triggeredPrice,
      });

      // Emit real-time update to the strategy owner (Real-Time Data Rules)
      this.realtime.emitOrderUpdate(strategy.userId, {
        orderId,
        strategyId: strategy.id,
        pair: strategy.pair,
        status: fillResult.tpExchangeOrderId ? 'tp_placed' : 'filled',
        filledPrice: fillResult.filledPrice ?? triggeredPrice,
        exchangeOrderId: fillResult.exchangeOrderId,
        tpExchangeOrderId: fillResult.tpExchangeOrderId,
      });

      return {
        orderId,
        status: fillResult.tpExchangeOrderId ? 'tp_placed' : 'filled',
        filledPrice: fillResult.filledPrice ?? triggeredPrice,
        exchangeOrderId: fillResult.exchangeOrderId,
        tpExchangeOrderId: fillResult.tpExchangeOrderId,
      };
    } catch (err: any) {
      // Unhandled error in triggerGridOrder — this is a critical operational event
      await this.opsAlerting.triggerGridOrderError({
        orderId,
        strategyId: strategy.id,
        error: err.message,
        stack: err.stack,
      });

      // Mark order as error so it doesn't look like a real fill
      await this.prisma.gridOrder.update({
        where: { id: orderId },
        data: { status: 'error' },
      }).catch(() => {}); // Best effort

      throw err; // Re-throw to let the caller handle it
    }
  }
}

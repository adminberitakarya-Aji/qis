import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StrategyService } from '../strategy/strategy.service';
import { StartExecutionDto } from './dto/start-execution.dto';
import { StartPaperExecutionDto } from './dto/start-paper-execution.dto';
import { EXCHANGE_ENGINE } from '../engines/engines.module';
import { ExchangeEngine, type DecryptContext } from '@qis/exchange-engine';
import { ExecutionEngine, type ExecutionOrderState } from '@qis/execution-engine';
import { PaperExchangeEngine } from '@qis/paper-exchange-engine';
import { GridEngine } from '@qis/grid-engine';
import type { Blueprint } from '@qis/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OpsAlertingService } from '../ops-alerting/ops-alerting.service';
import { RiskService } from '../risk/risk.service';
import { NotificationService } from '../notification/notification.service';
import { ConfigService } from '@nestjs/config';
import type { NotificationConfig } from '@qis/notification-engine';
import { createServiceLogger } from '@qis/logger';

@Injectable()
export class ExecutionService {
  private readonly logger = createServiceLogger('qis-api:execution');
  private executionEngine: ExecutionEngine;
  private gridEngine = new GridEngine();
  private paperExchangeEngine = new PaperExchangeEngine();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ENGINE) exchangeEngine: ExchangeEngine,
    private readonly strategyService: StrategyService,
    private readonly realtime: RealtimeGateway,
    private readonly idempotency: IdempotencyService,
    private readonly opsAlerting: OpsAlertingService,
    private readonly riskService: RiskService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {
    // Reuse the shared Exchange Engine singleton so that all decryption stays
    // inside the same Master Key boundary. Execution Engine itself never
    // touches plaintext; it forwards the ciphertext to Exchange Engine.
    this.executionEngine = new ExecutionEngine(exchangeEngine);
  }

  /**
   * Returns the Telegram notification config from environment variables,
   * or null if not configured. Used for user-facing trading notifications.
   */
  private getTelegramConfig(): NotificationConfig | null {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    if (botToken && chatId) {
      return { telegram: { botToken, chatId } };
    }
    return null;
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

    // 3.5. Pre-trade risk check (ROADMAP.md Phase 2).
    //      Blocks the strategy launch if any risk limit is exceeded.
    //      The RiskService sends an ops alert via Phase 0's Telegram channel
    //      when a check is blocked.
    const riskOutcome = await this.riskService.checkPreTrade(
      userId,
      account.id,
      blueprint.pair,
      blueprint.tradingCapital,
    );

    if (riskOutcome.blocked) {
      const reasons = riskOutcome.reasons.map((r) => r.code).join(', ');
      throw new BadRequestException(
        `Strategy blocked by risk check: ${reasons}`,
      );
    }

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

    // Send Telegram notification when real strategy starts
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'strategy_started',
        { pair: blueprint.pair, capital: blueprint.tradingCapital, mode: 'real' },
        telegramConfig,
      );
    }

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

    // Send Telegram notification when real strategy stops
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'strategy_stopped',
        { strategyId: updated.id, pair: updated.pair, mode: 'real' },
        telegramConfig,
      );
    }

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

      // Send Telegram notification when real BUY order filled
      const telegramConfig = this.getTelegramConfig();
      if (telegramConfig) {
        await this.notificationService.sendEvent(
          'order_filled',
          {
            orderId,
            pair: strategy.pair,
            filledPrice: fillResult.filledPrice ?? triggeredPrice,
            filledQuantity: fillResult.filledQuantity ?? order.estimatedQuantity,
            mode: 'real',
          },
          telegramConfig,
        );
      }

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

  // ============================================================
  // Paper Trading (Virtual Balance, No Real Money)
  // ============================================================

  /**
   * Starts a paper trading strategy using a virtual balance ($100 default).
   * No API keys, no real money, no exchange interaction.
   * Uses live market prices via the Worker for realistic fills.
   */
  async startPaperExecution(userId: string, dto: StartPaperExecutionDto) {
    // 1. Validate Blueprint exists, is not expired, and belongs to the user
    const blueprint: Blueprint = await this.strategyService.getBlueprint(userId, dto.blueprintId);

    const now = new Date();
    if (blueprint.expiresAt && new Date(blueprint.expiresAt) < now) {
      throw new BadRequestException(
        'Strategy Blueprint has expired. Please generate a new strategy.',
      );
    }

    // 1.5. Reject early if this Blueprint already has a PaperStrategy
    //      (any status — mirrors the real GridStrategy lifecycle, where a
    //      Blueprint may only ever back one strategy). This is a friendly
    //      pre-check for the common case; it is NOT the actual race guard
    //      — two concurrent requests can both pass this check. The real
    //      guard is the `blueprintId @unique` DB constraint, enforced
    //      atomically at INSERT time inside the transaction below (step 4c).
    const existingPaperStrategy = await this.prisma.paperStrategy.findUnique({
      where: { blueprintId: dto.blueprintId },
    });
    if (existingPaperStrategy) {
      throw new BadRequestException(
        `A paper strategy already exists for this Blueprint (status: ${existingPaperStrategy.status}). Generate a new Blueprint to start another paper strategy.`,
      );
    }

    // 2. Get current market price to anchor grid levels. This is a network
    //    call and MUST happen before the DB transaction below — never
    //    inside it, since holding a transaction open across an external
    //    HTTP call risks long-lived DB locks and transaction timeouts.
    let currentPrice = 100;
    try {
      const { ExchangeEngine: ExchangeEngineClass } = await import('@qis/exchange-engine');
      const publicTicker = new ExchangeEngineClass();
      const ticker = await publicTicker.fetchTicker(
        blueprint.exchange as 'binance' | 'bybit',
        blueprint.pair,
      );
      currentPrice = ticker.last || currentPrice;
    } catch {
      // fallback price
    }

    // 3. Build grid from blueprint. Pure computation (no DB/network), safe
    //    to run outside the transaction.
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

    // 4. Get-or-create the paper account, verify + deduct virtual balance,
    //    create the PaperStrategy, and persist PaperOrder rows — ALL inside
    //    one transaction with a conditional decrement (`gte` guard in the
    //    WHERE clause). This replaces the old "read balance → check →
    //    later write balance - capital" pattern, which was a classic
    //    check-then-write race: two concurrent starts could both read the
    //    same balance, both pass the check, and both deduct from the same
    //    stale value (double-spending the same virtual capital, or driving
    //    the balance negative). The `updateMany` below either atomically
    //    claims the capital (count === 1) or claims nothing (count === 0)
    //    — there's no window where two callers can both succeed against
    //    the same funds.
    const result = await this.prisma.$transaction(async (tx) => {
      // 4a. Get or create paper account (default $100 virtual balance).
      //     upsert() on the compound unique key avoids the separate
      //     findFirst()/create() race, where two concurrent first-time
      //     starts could both fail to find an account and both attempt
      //     to create one.
      const paperAccount = await tx.paperAccount.upsert({
        where: {
          userId_exchange_label: {
            userId,
            exchange: blueprint.exchange,
            label: 'Paper Trading',
          },
        },
        update: {},
        create: {
          userId,
          exchange: blueprint.exchange,
          label: 'Paper Trading',
          virtualBalance: 100,
        },
      });

      // 4b. Atomic balance check + deduct in a single conditional write.
      const claim = await tx.paperAccount.updateMany({
        where: { id: paperAccount.id, virtualBalance: { gte: blueprint.tradingCapital } },
        data: { virtualBalance: { decrement: blueprint.tradingCapital } },
      });

      if (claim.count === 0) {
        throw new BadRequestException(
          `Virtual balance insufficient for this strategy. Available: $${paperAccount.virtualBalance}, Required: $${blueprint.tradingCapital}`,
        );
      }

      // 4c. Create PaperStrategy record. blueprintId is @unique at the DB
      //     level (see schema.prisma), so this INSERT is the atomic guard
      //     against duplicate/concurrent paper-strategy starts on the same
      //     Blueprint — even if two requests both pass the step-1.5
      //     pre-check, only one INSERT can succeed here; the loser hits a
      //     unique-constraint violation (Prisma P2002), which we translate
      //     into a normal 400 instead of a raw 500.
      let paperStrategy;
      try {
        paperStrategy = await tx.paperStrategy.create({
          data: {
            userId,
            paperAccountId: paperAccount.id,
            blueprintId: blueprint.id,
            exchange: blueprint.exchange,
            pair: blueprint.pair,
            capital: blueprint.tradingCapital,
            status: 'active',
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BadRequestException(
            'A paper strategy already exists for this Blueprint.',
          );
        }
        throw err;
      }

      // 4d. Persist PaperOrder records with 'pending' status
      const paperOrderData = gridResult.sections.flatMap((section) =>
        section.orders.map((order) => ({
          paperStrategyId: paperStrategy.id,
          sectionIndex: order.sectionIndex,
          orderIndex: order.orderIndex,
          globalOrderIndex: order.globalOrderIndex,
          clientOrderId: `${paperStrategy.id}_g${order.globalOrderIndex}`,
          gridPrice: order.gridPrice,
          tpPrice: order.estimatedTpPrice,
          allocatedCapital: order.allocatedCapitalUsdt,
          estimatedQuantity: order.estimatedQuantity,
          status: 'pending',
        })),
      );

      await tx.paperOrder.createMany({ data: paperOrderData });

      // 4e. Re-read the account for the post-deduction balance to return
      //     to the caller (avoids relying on a client-side recomputation).
      const paperAccountAfter = await tx.paperAccount.findUniqueOrThrow({
        where: { id: paperAccount.id },
      });

      return { paperStrategy, paperAccountAfter, paperOrderCount: paperOrderData.length };
    });

    const { paperStrategy, paperAccountAfter, paperOrderCount } = result;

    // 5. Send Telegram notification when paper strategy starts. Outside the
    //    transaction on purpose — notification delivery must never roll
    //    back a trade that already committed successfully.
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'strategy_started',
        { pair: blueprint.pair, capital: blueprint.tradingCapital, mode: 'paper' },
        telegramConfig,
      );
    }

    this.logger.info('Paper trading strategy started', {
      strategyId: paperStrategy.id,
      pair: blueprint.pair,
      capital: blueprint.tradingCapital,
      gridLevels: paperOrderCount,
    });

    return {
      strategyId: paperStrategy.id,
      blueprintId: blueprint.id,
      pair: blueprint.pair,
      exchange: blueprint.exchange,
      capital: blueprint.tradingCapital,
      status: 'active',
      virtualBalanceRemaining: paperAccountAfter.virtualBalance,
      ordersSummary: {
        total: paperOrderCount,
        pending: paperOrderCount,
      },
    };
  }

  /**
   * Stops a paper trading strategy.
   * - Atomically claims the strategy (active -> stopped)
   * - Calculates refund for pending orders (never executed -> 100% allocated capital refunded)
   * - Settles any open tp_placed orders at current market price (or buyFilledPrice fallback)
   * - Increments refunded capital + open position proceeds back to paperAccount.virtualBalance
   * - Updates pending & tp_placed orders to status 'canceled'
   * - All DB operations run inside a single atomic transaction.
   */
  async stopPaperExecution(userId: string, strategyId: string) {
    // Pre-check strategy existence & ownership
    const strategyCheck = await this.prisma.paperStrategy.findUnique({
      where: { id: strategyId },
      select: { exchange: true, pair: true, userId: true, status: true },
    });

    if (!strategyCheck) throw new NotFoundException('Paper strategy not found');
    if (strategyCheck.userId !== userId) throw new ForbiddenException('You do not own this strategy');
    if (strategyCheck.status !== 'active') throw new BadRequestException('Paper strategy is not active');

    // Fetch market price for open position settlement (outside transaction to prevent blocking locks)
    let currentMarketPrice: number | undefined;
    try {
      const { ExchangeEngine: ExchangeEngineClass } = await import('@qis/exchange-engine');
      const publicTicker = new ExchangeEngineClass();
      const ticker = await publicTicker.fetchTicker(
        strategyCheck.exchange as 'binance' | 'bybit',
        strategyCheck.pair,
      );
      if (ticker.last && ticker.last > 0) {
        currentMarketPrice = ticker.last;
      }
    } catch {
      // Market price fetch failed; settlement will fallback to order.buyFilledPrice
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Atomically claim strategy status: active -> stopped
      const claim = await tx.paperStrategy.updateMany({
        where: { id: strategyId, userId, status: 'active' },
        data: { status: 'stopped', stoppedAt: new Date() },
      });

      if (claim.count === 0) {
        throw new BadRequestException('Paper strategy is not active or already stopped');
      }

      // 2. Fetch strategy with paperAccount and un-finalized orders
      const strategy = await tx.paperStrategy.findUniqueOrThrow({
        where: { id: strategyId },
        include: {
          paperAccount: true,
          paperOrders: {
            where: { status: { in: ['pending', 'tp_placed'] } },
          },
        },
      });

      let totalRefundUsdt = 0;
      let pendingRefundUsdt = 0;
      let tpSettleProceedsUsdt = 0;
      let totalRealizedPnlFromSettle = 0;

      // 3. Process un-finalized orders for refund & position settlement
      for (const order of strategy.paperOrders) {
        if (order.status === 'pending') {
          // Order was never executed — full refund of reserved allocated capital
          pendingRefundUsdt += order.allocatedCapital;
          totalRefundUsdt += order.allocatedCapital;

          await tx.paperOrder.update({
            where: { id: order.id },
            data: { status: 'canceled' },
          });
        } else if (order.status === 'tp_placed') {
          // Position is open (BUY filled, waiting for TP). Settle position at market price.
          const settlePrice = currentMarketPrice && currentMarketPrice > 0
            ? currentMarketPrice
            : (order.buyFilledPrice || order.gridPrice);

          const fill = this.paperExchangeEngine.simulateMarketSell(
            order.buyFilledQuantity || (order.allocatedCapital / settlePrice),
            order.buyFilledPrice || order.gridPrice,
            order.buyFee || 0,
            settlePrice,
          );

          const proceeds = (fill.filledQuantity * fill.filledPrice) - fill.fee;
          tpSettleProceedsUsdt += proceeds;
          totalRefundUsdt += proceeds;
          totalRealizedPnlFromSettle += (fill.realizedPnl || 0);

          await tx.paperOrder.update({
            where: { id: order.id },
            data: {
              status: 'canceled',
              tpFilledPrice: fill.filledPrice,
              tpFee: fill.fee,
              realizedPnl: fill.realizedPnl,
            },
          });
        }
      }

      // 4. Increment refunded capital + open position proceeds back to virtualBalance
      if (totalRefundUsdt > 0) {
        await tx.paperAccount.update({
          where: { id: strategy.paperAccountId },
          data: { virtualBalance: { increment: Number(totalRefundUsdt.toFixed(6)) } },
        });
      }

      const updatedAccount = await tx.paperAccount.findUniqueOrThrow({
        where: { id: strategy.paperAccountId },
      });

      return {
        strategyId,
        pair: strategy.pair,
        status: 'stopped',
        stoppedAt: new Date(),
        refundedAmountUsdt: Number(totalRefundUsdt.toFixed(2)),
        pendingRefundUsdt: Number(pendingRefundUsdt.toFixed(2)),
        tpSettleProceedsUsdt: Number(tpSettleProceedsUsdt.toFixed(2)),
        settleRealizedPnl: Number(totalRealizedPnlFromSettle.toFixed(6)),
        virtualBalance: Number(updatedAccount.virtualBalance.toFixed(2)),
      };
    });

    // 5. Send Telegram notification
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'strategy_stopped',
        { strategyId, pair: result.pair, mode: 'paper' },
        telegramConfig,
      );
    }

    this.logger.info('Paper trading strategy stopped with refund', {
      strategyId,
      refundedAmountUsdt: result.refundedAmountUsdt,
      newVirtualBalance: result.virtualBalance,
    });

    return result;
  }

  /**
   * Returns the paper trading status for a user: virtual balance, active strategies, completed rounds, PnL.
   */
  async getPaperStatus(userId: string) {
    const paperAccount = await this.prisma.paperAccount.findFirst({
      where: { userId },
      include: {
        paperStrategies: {
          include: { paperOrders: true },
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!paperAccount) {
      return {
        virtualBalance: 0,
        activeStrategiesCount: 0,
        completedRounds: 0,
        totalRealizedPnl: 0,
        strategies: [],
      };
    }

    let completedRounds = 0;
    let totalRealizedPnl = 0;
    const strategies = paperAccount.paperStrategies.map((s) => {
      const rounds = s.paperOrders.filter((o) => o.status === 'tp_filled').length;
      const realizedPnl = s.paperOrders.reduce(
        (sum, o) => sum + (o.realizedPnl ?? 0),
        0,
      );
      completedRounds += rounds;
      totalRealizedPnl += realizedPnl;

      return {
        strategyId: s.id,
        pair: s.pair,
        capital: s.capital,
        status: s.status,
        startedAt: s.startedAt,
        stoppedAt: s.stoppedAt,
        completedRounds: rounds,
        realizedPnl: Number(realizedPnl.toFixed(6)),
        totalOrders: s.paperOrders.length,
      };
    });

    return {
      virtualBalance: Number(paperAccount.virtualBalance.toFixed(2)),
      exchange: paperAccount.exchange,
      activeStrategiesCount: paperAccount.paperStrategies.filter((s) => s.status === 'active').length,
      completedRounds,
      totalRealizedPnl: Number(totalRealizedPnl.toFixed(6)),
      strategies,
    };
  }

  // ============================================================
  // Internal Worker Methods — Paper Trading (called by Worker)
  // ============================================================

  /**
   * Returns all ACTIVE paper strategies with their pending grid orders
   * and tp_placed orders. Called by the Worker on startup and every 60s.
   */
  async getAllActivePaperStrategiesForWorker() {
    const strategies = await this.prisma.paperStrategy.findMany({
      where: { status: 'active' },
      include: {
        paperOrders: {
          where: { status: { in: ['pending', 'tp_placed'] } },
          orderBy: { globalOrderIndex: 'asc' },
        },
      },
    });

    return strategies.map((s) => ({
      strategyId: s.id,
      symbol: s.pair,
      exchange: s.exchange,
      pendingOrders: s.paperOrders
        .filter((o) => o.status === 'pending')
        .map((o) => ({
          orderId: o.id,
          symbol: s.pair,
          gridPrice: o.gridPrice,
          tpPrice: o.tpPrice,
          sectionIndex: o.sectionIndex,
          orderIndex: o.orderIndex,
          allocatedCapital: o.allocatedCapital,
        })),
      tpOrders: s.paperOrders
        .filter((o) => o.status === 'tp_placed')
        .map((o) => ({
          orderId: o.id,
          symbol: s.pair,
          tpPrice: o.tpPrice,
          sectionIndex: o.sectionIndex,
          orderIndex: o.orderIndex,
        })),
    }));
  }

  /**
   * Triggers a Market Buy for a paper order when the Worker detects
   * that current price has crossed a grid level downwards.
   * Simulates fill against virtual balance — no exchange interaction.
   */
  async triggerPaperGridOrder(orderId: string, triggeredPrice: number) {
    // Atomically claim this paper order against double-trigger
    const claim = await this.prisma.paperOrder.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'filled', filledAt: new Date() },
    });

    if (claim.count === 0) {
      const existing = await this.prisma.paperOrder.findUnique({ where: { id: orderId } });
      if (!existing) throw new NotFoundException(`Paper order ${orderId} not found`);
      this.logger.warn('Paper order is not pending, skipping', { orderId, status: existing.status });
      return { skipped: true, reason: 'Order already processed' };
    }

    // Fetch order with strategy relation
    const order = await this.prisma.paperOrder.findUnique({
      where: { id: orderId },
      include: { paperStrategy: true },
    });

    if (!order) {
      throw new NotFoundException(`Paper order ${orderId} not found after claim`);
    }

    // Simulate market buy
    const fill = this.paperExchangeEngine.simulateMarketBuy(
      order.allocatedCapital,
      triggeredPrice,
    );

    // Update order with fill data — TP is "placed" virtually
    await this.prisma.paperOrder.update({
      where: { id: orderId },
      data: {
        status: 'tp_placed',
        buyFilledPrice: fill.filledPrice,
        buyFilledQuantity: fill.filledQuantity,
        buyFee: fill.fee,
      },
    });

    this.logger.info('Paper order filled', {
      orderId,
      pair: order.paperStrategy.pair,
      filledPrice: fill.filledPrice,
    });

    this.realtime.emitOrderUpdate(order.paperStrategy.userId, {
      orderId,
      strategyId: order.paperStrategy.id,
      pair: order.paperStrategy.pair,
      status: 'tp_placed',
      filledPrice: fill.filledPrice,
    });

    // Send Telegram notification when paper BUY filled
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'order_filled',
        {
          orderId,
          pair: order.paperStrategy.pair,
          filledPrice: fill.filledPrice,
          filledQuantity: fill.filledQuantity,
          mode: 'paper',
        },
        telegramConfig,
      );
    }

    return {
      orderId,
      status: 'tp_placed',
      filledPrice: fill.filledPrice,
      filledQuantity: fill.filledQuantity,
      fee: fill.fee,
    };
  }

  /**
   * Triggers a TP SELL fill for a paper order when the Worker detects
   * that current price has crossed the TP price (upwards).
   * Simulates fill against virtual balance — no exchange interaction.
   */
  async triggerPaperTpFill(orderId: string, _currentPrice: number) {
    // Atomically claim the TP fill against double-trigger
    const claim = await this.prisma.paperOrder.updateMany({
      where: { id: orderId, status: 'tp_placed' },
      data: { status: 'tp_filled', tpFilledAt: new Date() },
    });

    if (claim.count === 0) {
      const existing = await this.prisma.paperOrder.findUnique({ where: { id: orderId } });
      if (!existing) throw new NotFoundException(`Paper order ${orderId} not found`);
      this.logger.warn('Paper order is not tp_placed, skipping', { orderId, status: existing.status });
      return { skipped: true, reason: 'Order already processed' };
    }

    // Fetch order with strategy + account relations
    const order = await this.prisma.paperOrder.findUnique({
      where: { id: orderId },
      include: { paperStrategy: { include: { paperAccount: true } } },
    });

    if (!order) {
      throw new NotFoundException(`Paper order ${orderId} not found after claim`);
    }

    // Simulate TP sell
    const fill = this.paperExchangeEngine.simulateTpSell(
      order.buyFilledQuantity!,
      order.buyFilledPrice!,
      order.buyFee!,
      order.tpPrice,
    );

    // Update order with TP fill data
    await this.prisma.paperOrder.update({
      where: { id: orderId },
      data: {
        status: 'tp_filled',
        tpFilledPrice: fill.filledPrice,
        tpFee: fill.fee,
        realizedPnl: fill.realizedPnl,
      },
    });

    // Add proceeds minus fee back to virtual balance
    const proceeds = order.buyFilledQuantity! * fill.filledPrice - fill.fee;
    await this.prisma.paperAccount.update({
      where: { id: order.paperStrategy.paperAccountId },
      data: { virtualBalance: { increment: proceeds } },
    });

    this.logger.info('Paper TP filled', {
      orderId,
      pair: order.paperStrategy.pair,
      realizedPnl: fill.realizedPnl,
    });

    this.realtime.emitOrderUpdate(order.paperStrategy.userId, {
      orderId,
      strategyId: order.paperStrategy.id,
      pair: order.paperStrategy.pair,
      status: 'tp_filled',
      realizedPnl: fill.realizedPnl,
    });

    // Send Telegram notification when paper TP filled
    const telegramConfig = this.getTelegramConfig();
    if (telegramConfig) {
      await this.notificationService.sendEvent(
        'tp_filled',
        {
          orderId,
          pair: order.paperStrategy.pair,
          realizedPnl: fill.realizedPnl ?? 0,
          mode: 'paper',
        },
        telegramConfig,
      );
    }

    return {
      orderId,
      status: 'tp_filled',
      realizedPnl: fill.realizedPnl,
      tpFilledPrice: fill.filledPrice,
      tpFee: fill.fee,
    };
  }
}

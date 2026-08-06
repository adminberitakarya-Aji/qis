import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private executionEngine: ExecutionEngine;
  private gridEngine = new GridEngine();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ENGINE) exchangeEngine: ExchangeEngine,
    private readonly strategyService: StrategyService,
  ) {
    // Reuse the shared Exchange Engine singleton so that all decryption stays
    // inside the same Master Key boundary. Execution Engine itself never
    // touches plaintext; it forwards the ciphertext to Exchange Engine.
    this.executionEngine = new ExecutionEngine(exchangeEngine);
  }

  async startExecution(userId: string, dto: StartExecutionDto) {
    // 1. Validate Blueprint exists and is not expired
    const blueprint: Blueprint = await this.strategyService.getBlueprint(dto.blueprintId);

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

    const credentials = {
      encryptedApiKey: account.apiKeyEncrypted,
      encryptedApiSecret: account.apiSecretEncrypted,
      keyVersion: account.apiKeyKeyVersion,
      context: {
        exchangeAccountId: account.id,
        userId: account.userId,
        purpose: 'startExecution',
      } satisfies DecryptContext,
    };

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

    // 7. Persist GridOrder records to DB
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

    // 8. Build order states for execution engine and place Buy Limit orders
    const orderStates: ExecutionOrderState[] = gridOrderData.map((o) => ({
      dbId: o.clientOrderId,
      clientOrderId: o.clientOrderId,
      exchangeOrderId: null,
      tpExchangeOrderId: null,
      sectionIndex: o.sectionIndex,
      orderIndex: o.orderIndex,
      globalOrderIndex: o.globalOrderIndex,
      gridPrice: o.gridPrice,
      tpPrice: o.tpPrice,
      allocatedCapital: o.allocatedCapital,
      estimatedQuantity: o.estimatedQuantity,
      status: 'pending' as const,
      buyFilledPrice: null,
      buyFilledQuantity: null,
      buyFee: null,
      tpFilledPrice: null,
      tpFee: null,
      realizedPnl: null,
    }));

    // Per Secret Ownership Rule #5: Execution Engine forwards the ciphertext
    // to Exchange Engine. Decryption + audit log happen inside Exchange Engine.
    const placeResult = await this.executionEngine.placeGridOrdersEncrypted(
      blueprint.exchange as 'binance' | 'bybit',
      credentials,
      blueprint.pair,
      orderStates,
    );

    // 9. Update DB order statuses
    for (const order of placeResult.orders) {
      await this.prisma.gridOrder.update({
        where: { clientOrderId: order.clientOrderId },
        data: {
          status: order.status,
          exchangeOrderId: order.exchangeOrderId ?? undefined,
          placedAt: order.status === 'placed' ? new Date() : undefined,
        },
      });
    }

    const summary = this.executionEngine.summarizeOrders(placeResult.orders);

    return {
      strategyId: gridStrategy.id,
      blueprintId: blueprint.id,
      pair: blueprint.pair,
      exchange: blueprint.exchange,
      capital: blueprint.tradingCapital,
      status: 'active',
      ordersSummary: summary,
    };
  }

  async stopExecution(userId: string, strategyId: string) {
    const strategy = await this.prisma.gridStrategy.findUnique({
      where: { id: strategyId },
      include: { orders: true },
    });

    if (!strategy) throw new NotFoundException('Grid strategy not found');
    if (strategy.userId !== userId) throw new ForbiddenException('You do not own this strategy');
    if (strategy.status !== 'active') {
      throw new BadRequestException('Strategy is not active');
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

      this.logger.log(
        `[Execution] Stop strategy ${strategyId}: canceled=${cancelResult.canceled}, errors=${cancelResult.errors}`,
      );
    }

    // Update strategy status
    const updated = await this.prisma.gridStrategy.update({
      where: { id: strategyId },
      data: { status: 'stopped', stoppedAt: new Date() },
    });

    return { strategyId: updated.id, status: updated.status, stoppedAt: updated.stoppedAt };
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
      },
    });

    return strategies.map((s) => ({
      strategyId: s.id,
      symbol: s.pair,
      exchange: s.exchange,
      pendingOrders: s.orders.map((o) => ({
        orderId: o.id,
        symbol: s.pair,
        gridPrice: o.gridPrice,
        tpPrice: o.tpPrice,
        sectionIndex: o.sectionIndex,
        orderIndex: o.orderIndex,
      })),
    }));
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
    const order = await this.prisma.gridOrder.findUnique({
      where: { id: orderId },
      include: { gridStrategy: true },
    });

    if (!order) throw new NotFoundException(`Grid order ${orderId} not found`);
    if (order.status !== 'pending') {
      this.logger.warn(`[Worker] Order ${orderId} is not pending (status: ${order.status}). Skipping.`);
      return { skipped: true, reason: 'Order already processed' };
    }

    const strategy = order.gridStrategy;

    // Fetch exchange account via the strategy's explicit binding
    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: strategy.exchangeAccountId },
    });

    if (!account) {
      this.logger.error(`[Worker] No exchange account bound to strategy ${strategy.id}`);
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

    // Mark as 'placed' to prevent double-trigger
    await this.prisma.gridOrder.update({
      where: { id: orderId },
      data: { status: 'placed', placedAt: new Date() },
    });

    // Execute Market Buy via the encrypted path; decryption + audit log
    // happen inside Exchange Engine.
    const fillResult = await this.executionEngine.executeSingleMarketBuyEncrypted(
      strategy.exchange as 'binance' | 'bybit',
      credentials,
      strategy.pair,
      orderState,
      triggeredPrice,
    );

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

    this.logger.log(
      `[Worker] Order ${orderId} (${strategy.pair}) filled at $${fillResult.filledPrice ?? triggeredPrice}`,
    );

    return {
      orderId,
      status: 'filled',
      filledPrice: fillResult.filledPrice ?? triggeredPrice,
      exchangeOrderId: fillResult.exchangeOrderId,
    };
  }
}

import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExecutionService } from './execution.service';
import { StartExecutionDto } from './dto/start-execution.dto';
import { StartPaperExecutionDto } from './dto/start-paper-execution.dto';

@Controller('execution')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) { }

  @Post('start')
  async startExecution(
    @CurrentUser() user: { id: string },
    @Body() dto: StartExecutionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.executionService.startExecution(user.id, dto, idempotencyKey);
    return {
      success: true,
      message: 'Grid strategy execution started successfully',
      data,
    };
  }

  @Post('stop/:id')
  async stopExecution(
    @CurrentUser() user: { id: string },
    @Param('id') strategyId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.executionService.stopExecution(user.id, strategyId, idempotencyKey);
    return {
      success: true,
      message: 'Grid strategy execution stopped successfully',
      data,
    };
  }

  @Get('active')
  async getActiveStrategies(@CurrentUser() user: { id: string }) {
    const data = await this.executionService.getActiveStrategies(user.id);
    return {
      success: true,
      message: 'Active grid strategies retrieved',
      data,
    };
  }

  @Get('orders/:id')
  async getStrategyOrders(
    @CurrentUser() user: { id: string },
    @Param('id') strategyId: string,
  ) {
    const data = await this.executionService.getStrategyOrders(user.id, strategyId);
    return {
      success: true,
      message: 'Strategy orders retrieved',
      data,
    };
  }

  // ============================================================
  // Paper Trading (Virtual Balance, No Real Money)
  // ============================================================

  @Post('paper/start')
  async startPaperExecution(
    @CurrentUser() user: { id: string },
    @Body() dto: StartPaperExecutionDto,
  ) {
    const data = await this.executionService.startPaperExecution(user.id, dto);
    return {
      success: true,
      message: 'Paper trading started successfully',
      data,
    };
  }

  @Post('paper/stop/:id')
  async stopPaperExecution(
    @CurrentUser() user: { id: string },
    @Param('id') strategyId: string,
  ) {
    const data = await this.executionService.stopPaperExecution(user.id, strategyId);
    return {
      success: true,
      message: 'Paper trading stopped successfully',
      data,
    };
  }

  @Get('paper/status')
  async getPaperStatus(@CurrentUser() user: { id: string }) {
    const data = await this.executionService.getPaperStatus(user.id);
    return {
      success: true,
      message: 'Paper trading status retrieved',
      data,
    };
  }

  /**
   * GET /execution/paper/balance/:exchange
   * Returns the CURRENT available virtual balance for a specific exchange's
   * paper account — used by the AI Strategy Builder to lock the "Trading
   * Capital" input while in Paper mode. Each exchange has its own $100
   * starting balance (see PaperAccount's userId_exchange_label unique key);
   * this is intentionally scoped per-exchange rather than summed, since a
   * new paper strategy on this exchange can only draw from this pool.
   * Returns 100 (the default starting balance) if the user hasn't started
   * a paper strategy on this exchange yet — no PaperAccount row exists.
   */
  @Get('paper/balance/:exchange')
  async getPaperBalance(
    @CurrentUser() user: { id: string },
    @Param('exchange') exchange: 'binance' | 'bybit',
  ) {
    const data = await this.executionService.getAvailablePaperBalance(user.id, exchange);
    return {
      success: true,
      message: 'Available paper balance retrieved',
      data,
    };
  }
}

// ============================================================
// Internal Worker Controller (separate path, no JWT)
// Used exclusively by the Binance WebSocket Worker process.
// Protected by a simple WORKER_SECRET header.
// ============================================================

// Internal worker controller is NOT throttled — it is already protected by
// the x-worker-secret header and must respond to market triggers instantly.
// Rate limiting on this path could block market orders during high volatility.
@Controller('execution')
@SkipThrottle()
export class WorkerController {
  private readonly workerSecret =
    process.env.WORKER_SECRET || 'qis-internal-worker-secret-dev';

  constructor(private readonly executionService: ExecutionService) { }

  private verifyWorkerSecret(secret: string | undefined) {
    if (secret !== this.workerSecret) {
      throw new UnauthorizedException('Invalid worker secret');
    }
  }

  @Get('active-strategies')
  async getActiveStrategiesForWorker(
    @Headers('x-worker-secret') secret: string,
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.getAllActiveStrategiesForWorker();
    return { success: true, data };
  }

  @Post('trigger-order')
  async triggerGridOrder(
    @Headers('x-worker-secret') secret: string,
    @Body() body: { orderId: string; triggeredPrice: number },
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.triggerGridOrder(
      body.orderId,
      body.triggeredPrice,
    );
    return { success: true, data };
  }

  @Post('trigger-orders-batch')
  async triggerGridOrdersBatch(
    @Headers('x-worker-secret') secret: string,
    @Body() body: { strategyId: string; orderIds: string[]; triggeredPrice: number },
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.triggerGridOrdersBatch(
      body.strategyId,
      body.orderIds,
      body.triggeredPrice,
    );
    return { success: true, data };
  }

  // ============================================================
  // Paper Trading Worker Endpoints (WORKER_SECRET protected)
  // ============================================================

  @Get('paper/active-strategies')
  async getActivePaperStrategiesForWorker(
    @Headers('x-worker-secret') secret: string,
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.getAllActivePaperStrategiesForWorker();
    return { success: true, data };
  }

  @Post('paper/trigger-order')
  async triggerPaperGridOrder(
    @Headers('x-worker-secret') secret: string,
    @Body() body: { orderId: string; triggeredPrice: number },
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.triggerPaperGridOrder(
      body.orderId,
      body.triggeredPrice,
    );
    return { success: true, data };
  }

  @Post('trigger-tp')
  async triggerTpFill(
    @Headers('x-worker-secret') secret: string,
    @Body() body: { orderId: string; currentPrice: number },
  ) {
    this.verifyWorkerSecret(secret);
    const data = await this.executionService.triggerPaperTpFill(
      body.orderId,
      body.currentPrice,
    );
    return { success: true, data };
  }
}

import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExecutionService } from './execution.service';
import { StartExecutionDto } from './dto/start-execution.dto';

@Controller('execution')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

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

  constructor(private readonly executionService: ExecutionService) {}

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
}

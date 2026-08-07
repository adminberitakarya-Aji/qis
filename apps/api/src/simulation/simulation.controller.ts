import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StrategyService } from '../strategy/strategy.service';

@Controller('simulation')
@UseGuards(JwtAuthGuard)
export class SimulationController {
  constructor(private readonly strategyService: StrategyService) {}

  @Post('run')
  async runSimulation(
    @CurrentUser() user: { id: string },
    @Body('blueprintId') blueprintId: string,
  ) {
    const data = await this.strategyService.simulateStrategy(user.id, blueprintId);
    return {
      success: true,
      message: 'Strategy simulation completed successfully',
      data,
    };
  }
}

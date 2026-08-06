import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StrategyService } from '../strategy/strategy.service';

@Controller('simulation')
@UseGuards(JwtAuthGuard)
export class SimulationController {
  constructor(private readonly strategyService: StrategyService) {}

  @Post('run')
  async runSimulation(@Body('blueprintId') blueprintId: string) {
    const data = await this.strategyService.simulateStrategy(blueprintId);
    return {
      success: true,
      message: 'Strategy simulation completed successfully',
      data,
    };
  }
}

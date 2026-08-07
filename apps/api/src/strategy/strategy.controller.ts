import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BuildStrategyDto } from './dto/build-strategy.dto';
import { StrategyService } from './strategy.service';

@Controller('strategy')
@UseGuards(JwtAuthGuard)
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  @Post('build')
  async buildStrategy(
    @CurrentUser() user: { id: string },
    @Body() dto: BuildStrategyDto,
  ) {
    const data = await this.strategyService.buildStrategy(user.id, dto);
    return {
      success: true,
      message: 'Strategy Blueprint generated successfully',
      data,
    };
  }

  @Get('blueprint/:id')
  async getBlueprint(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.strategyService.getBlueprint(user.id, id);
    return {
      success: true,
      message: 'Strategy Blueprint fetched successfully',
      data,
    };
  }

  @Post('simulate')
  async simulateStrategy(
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

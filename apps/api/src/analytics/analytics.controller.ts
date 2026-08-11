import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) { }

  @Get('summary')
  async getUserAnalytics(
    @CurrentUser() user: { id: string },
    @Query('mode') mode?: 'live' | 'paper',
  ) {
    const data = await this.analyticsService.getUserAnalytics(user.id, mode === 'paper' ? 'paper' : 'live');
    return {
      success: true,
      message: 'User analytics summary retrieved',
      data,
    };
  }

  @Get('strategy/:id')
  async getStrategyAnalytics(
    @CurrentUser() user: { id: string },
    @Param('id') strategyId: string,
  ) {
    const data = await this.analyticsService.getStrategyAnalytics(user.id, strategyId);
    return {
      success: true,
      message: 'Strategy analytics retrieved',
      data,
    };
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getUserAnalytics(@CurrentUser() user: { id: string }) {
    const data = await this.analyticsService.getUserAnalytics(user.id);
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

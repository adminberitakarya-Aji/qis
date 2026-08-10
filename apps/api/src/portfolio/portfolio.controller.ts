import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) { }

  @Get('summary')
  async getPortfolioSummary(@CurrentUser() user: { id: string }) {
    const data = await this.portfolioService.getUserPortfolioSummary(user.id);
    return {
      success: true,
      message: 'Portfolio summary retrieved',
      data,
    };
  }

  @Get('overview/:exchangeAccountId')
  async getPortfolioOverview(
    @CurrentUser() user: { id: string },
    @Param('exchangeAccountId') exchangeAccountId: string,
  ) {
    const data = await this.portfolioService.getPortfolioOverview(user.id, exchangeAccountId);
    return {
      success: true,
      message: 'Portfolio overview retrieved',
      data,
    };
  }

  @Get('committed-capital/:exchangeAccountId')
  async getCommittedCapital(
    @CurrentUser() user: { id: string },
    @Param('exchangeAccountId') exchangeAccountId: string,
  ) {
    const data = await this.portfolioService.getCommittedCapital(user.id, exchangeAccountId);
    return {
      success: true,
      message: 'Committed capital retrieved',
      data,
    };
  }
}

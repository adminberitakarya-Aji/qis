import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

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
}

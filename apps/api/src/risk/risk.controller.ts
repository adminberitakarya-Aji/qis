import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RiskService } from './risk.service';
import { CheckPreTradeDto } from './dto/check-pre-trade.dto';

@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  /**
   * Runs pre-trade risk checks for a proposed strategy launch.
   * Returns whether the strategy is approved or blocked, with reasons.
   */
  @Post('check-pre-trade')
  async checkPreTrade(
    @CurrentUser() user: { id: string },
    @Body() dto: CheckPreTradeDto,
  ) {
    const data = await this.riskService.checkPreTrade(
      user.id,
      dto.exchangeAccountId,
      dto.pair,
      dto.capital,
    );
    return {
      success: true,
      message: data.approved
        ? 'Pre-trade risk check passed'
        : 'Pre-trade risk check blocked',
      data,
    };
  }
}
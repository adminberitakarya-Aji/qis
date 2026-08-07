import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BacktestService } from './backtest.service';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Controller('backtest')
@UseGuards(JwtAuthGuard)
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Post('run')
  async runBacktest(@Body() dto: RunBacktestDto) {
    const data = await this.backtestService.runBacktest(dto);
    return {
      success: true,
      message: 'Backtest completed successfully',
      data,
    };
  }
}
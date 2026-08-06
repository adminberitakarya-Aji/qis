import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { IsIn, IsNumber, IsString, Min } from 'class-validator';

class AnalyzeMarketDto {
  @IsString()
  @IsIn(['binance', 'bybit'])
  exchange!: 'binance' | 'bybit';

  @IsString()
  symbol!: string;

  @IsNumber()
  @IsIn([1, 2, 3])
  sectionCount!: 1 | 2 | 3;

  @IsNumber()
  @Min(10)
  capital!: number;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('pairs/recommendation')
  async getPairRecommendations(
    @Query('exchange') exchange: 'binance' | 'bybit' = 'binance'
  ) {
    const data = await this.aiService.getTopPairsRecommendation(exchange);
    return {
      success: true,
      message: 'Top 5 AI pair recommendations fetched successfully',
      data,
    };
  }

  @Post('analyze')
  async analyzeMarket(@Body() dto: AnalyzeMarketDto) {
    const data = await this.aiService.recommendStrategyParams(
      dto.exchange,
      dto.symbol,
      dto.sectionCount,
      dto.capital
    );
    return {
      success: true,
      message: 'AI market analysis and grid recommendation completed',
      data,
    };
  }
}

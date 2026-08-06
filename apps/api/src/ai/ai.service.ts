import { Injectable } from '@nestjs/common';
import { AiEngine, PairRecommendation, AiStrategyRecommendation } from '@qis/ai-engine';

@Injectable()
export class AiService {
  private aiEngine = new AiEngine();

  async getTopPairsRecommendation(exchange: 'binance' | 'bybit'): Promise<PairRecommendation[]> {
    return this.aiEngine.getTopPairsRecommendation(exchange);
  }

  async recommendStrategyParams(
    exchange: 'binance' | 'bybit',
    symbol: string,
    sectionCount: 1 | 2 | 3,
    capital: number
  ): Promise<AiStrategyRecommendation> {
    return this.aiEngine.recommendStrategyParams(exchange, symbol, sectionCount, capital);
  }
}

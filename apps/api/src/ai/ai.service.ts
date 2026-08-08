import { Injectable } from '@nestjs/common';
import { AiEngine, type PairRecommendation, type AiStrategyRecommendation } from '@qis/ai-engine';

@Injectable()
export class AiService {
  private aiEngine = new AiEngine();

  async getTopPairsRecommendation(exchange: 'binance' | 'bybit'): Promise<PairRecommendation[]> {
    return await this.aiEngine.getTopPairsRecommendation(exchange);
  }

  async recommendStrategyParams(
    exchange: 'binance' | 'bybit',
    symbol: string,
    sectionCount: 1 | 2 | 3,
    capital: number
  ): Promise<AiStrategyRecommendation> {
    return await this.aiEngine.recommendStrategyParams(exchange, symbol, sectionCount, capital);
  }
}

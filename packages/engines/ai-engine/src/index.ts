// Qis AI Engine (TypeScript Client)
// Connects to Python FastAPI AI Service (apps/ai-service) via REST HTTP contract.
// Responsible for:
// - Market Technical Analysis (RSI, BB Width, ATR, Volatility)
// - Top 5 Pair Recommendations with Confidence Score & Explainable AI Reasoning
// - Section & Grid Parameter Recommendations
// AI never executes trades or modifies user capital/allocation.

import { MarketEngine } from '@qis/market-engine';

export interface PairRecommendation {
  rank: number;
  pair: string;
  confidenceScore: number; // 0 - 100
  reasoning: string;
  volatility24hPercent: number;
  volume24h: number;
}

export interface AiSectionRecommendation {
  sectionIndex: number; // 0, 1, 2
  gridCount: number;
  gridDistancePercent: number;
  sectionGapPercent: number;
  minNetProfitPercent: number;
  reasoning: string;
}

export interface AiStrategyRecommendation {
  pair: string;
  confidenceScore: number;
  overallReasoning: string;
  recommendedSections: AiSectionRecommendation[];
  capitalProtectionFloorPrice: number;
  maxCapitalPerMovementPercent: number;
  maxDrawdownAlertPercent: number;
}

export class AiEngine {
  private aiServiceUrl: string;

  constructor(private marketEngine: MarketEngine = new MarketEngine()) {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Generates Top 5 Pair Recommendations with Explainable AI reasoning via Python AI Service.
   */
  async getTopPairsRecommendation(
    exchange: 'binance' | 'bybit'
  ): Promise<PairRecommendation[]> {
    try {
      const response = await fetch(`${this.aiServiceUrl}/analyze/top-pairs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange,
          candidateCount: 15,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data as PairRecommendation[];
      }
    } catch (error: any) {
      console.warn(`[AiEngine] Python AI Service unavailable (${error.message}). Falling back to local heuristic analyzer.`);
    }

    // Fallback heuristic generator if Python service is offline
    return this.fallbackTopPairs(exchange);
  }

  /**
   * Generates AI Grid Parameter Recommendations for a pair via Python AI Service.
   */
  async recommendStrategyParams(
    exchange: 'binance' | 'bybit',
    symbol: string,
    sectionCount: 1 | 2 | 3,
    capital: number
  ): Promise<AiStrategyRecommendation> {
    try {
      const response = await fetch(`${this.aiServiceUrl}/analyze/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange,
          symbol,
          sectionCount,
          capital,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data as AiStrategyRecommendation;
      }
    } catch (error: any) {
      console.warn(`[AiEngine] Python AI Service unavailable (${error.message}). Falling back to local strategy builder.`);
    }

    // Fallback heuristic generator if Python service is offline
    return this.fallbackStrategyParams(exchange, symbol, sectionCount, capital);
  }

  private async fallbackTopPairs(exchange: 'binance' | 'bybit'): Promise<PairRecommendation[]> {
    const popularPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
    const recommendations: PairRecommendation[] = [];

    for (let idx = 0; idx < popularPairs.length; idx++) {
      const pair = popularPairs[idx];
      let volatility = 3.5;
      let volume = 50000000;

      try {
        const stats = await this.marketEngine.getMarketStats(exchange, pair);
        volatility = stats.volatilityPercent || volatility;
        volume = stats.volume24h || volume;
      } catch {
        // use default stats
      }

      recommendations.push({
        rank: idx + 1,
        pair,
        confidenceScore: 88 - idx * 2,
        reasoning: `${pair}: Highly liquid major pair with ${volatility}% 24h volatility. Optimal structure for multi-section grid recycling.`,
        volatility24hPercent: volatility,
        volume24h: volume,
      });
    }

    return recommendations;
  }

  private async fallbackStrategyParams(
    exchange: 'binance' | 'bybit',
    symbol: string,
    sectionCount: 1 | 2 | 3,
    _capital: number
  ): Promise<AiStrategyRecommendation> {
    let currentPrice = 100;
    let volatility = 4.0;

    try {
      const stats = await this.marketEngine.getMarketStats(exchange, symbol);
      currentPrice = stats.price || currentPrice;
      volatility = stats.volatilityPercent || volatility;
    } catch {
      // Use fallback defaults
    }

    const recommendedSections: AiSectionRecommendation[] = [];
    const baseGridDistance = Math.max(0.4, Math.round((volatility / 6) * 100) / 100);

    for (let i = 0; i < sectionCount; i++) {
      const minNetProfitPercent = Number((0.5 + i * 0.35).toFixed(2));
      const gridCount = i === 0 ? 10 : i === 1 ? 7 : 5;
      const gridDistancePercent = Number((baseGridDistance * (1 + i * 0.25)).toFixed(2));
      const sectionGapPercent = Number((2.0 + i * 1.0).toFixed(2));

      recommendedSections.push({
        sectionIndex: i,
        gridCount,
        gridDistancePercent,
        sectionGapPercent,
        minNetProfitPercent,
        reasoning: `Section ${i + 1}: Configured with ${gridCount} grids at ${gridDistancePercent}% spacing. Net profit target set to ${minNetProfitPercent}%.`,
      });
    }

    return {
      pair: symbol,
      confidenceScore: 85,
      overallReasoning: `AI Strategy generated for ${symbol} across ${sectionCount} sections based on 24h volatility profile (${volatility}%).`,
      recommendedSections,
      capitalProtectionFloorPrice: Number((currentPrice * 0.75).toFixed(4)),
      maxCapitalPerMovementPercent: 40,
      maxDrawdownAlertPercent: 15,
    };
  }
}

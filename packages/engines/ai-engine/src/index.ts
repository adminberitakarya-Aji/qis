// Qis AI Engine (TypeScript Client)
// Connects to Python FastAPI AI Service (apps/ai-service) via REST HTTP contract.
// Responsible for:
// - Market Technical Analysis (RSI, BB Width, ATR, Volatility)
// - Top 5 Pair Recommendations with Confidence Score & Explainable AI Reasoning
// - Section & Grid Parameter Recommendations
// - LLM-based reasoning enrichment via @qis/providers-ai (OpenAI/Anthropic/Gemini)
// AI never executes trades or modifies user capital/allocation.

import { MarketEngine } from '@qis/market-engine';
import { createAiProvider, type AiProvider } from '@qis/providers-ai';

const BINANCE_BASE = 'https://data-api.binance.vision'; // market-data-only mirror; api.binance.com's :443 can be blocked from some hosting networks — this endpoint isn't
const DEFAULT_MIN_NOTIONAL = 10.0; // conservative fallback if Binance is unreachable
const MIN_NOTIONAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const minNotionalCache = new Map<string, { value: number; fetchedAt: number }>();

function toBinanceSymbol(pair: string): string {
  return pair.replace('/', '').toUpperCase();
}

/**
 * Mirrors apps/ai-service/main.py's get_min_notional(). Used only by the TS
 * fallback path (when the Python AI service is unreachable) so grid density
 * still respects the exchange's minimum order size even in a degraded mode.
 */
async function getMinNotional(pair: string): Promise<number> {
  const symbol = toBinanceSymbol(pair);
  const cached = minNotionalCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < MIN_NOTIONAL_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const resp = await fetch(`${BINANCE_BASE}/api/v3/exchangeInfo?symbol=${symbol}`);
    if (!resp.ok) return DEFAULT_MIN_NOTIONAL;

    const data = (await resp.json()) as { symbols?: Array<{ filters?: any[] }> };
    const symbolInfo = data?.symbols?.[0];
    const filters: any[] = symbolInfo?.filters || [];
    const filter =
      filters.find((f) => f.filterType === 'NOTIONAL') ||
      filters.find((f) => f.filterType === 'MIN_NOTIONAL');

    const minNotional = filter ? Number(filter.minNotional) : DEFAULT_MIN_NOTIONAL;
    minNotionalCache.set(symbol, { value: minNotional, fetchedAt: Date.now() });
    return minNotional;
  } catch {
    return DEFAULT_MIN_NOTIONAL;
  }
}

// Default capital allocation per section — MUST stay in sync with
// `allocations` defaults in packages/engines/strategy-engine/src/index.ts
// (that's what actually splits `capital` across sections at execution time)
// and with DEFAULT_ALLOCATIONS in apps/ai-service/reasoning.py.
const DEFAULT_ALLOCATIONS: Record<number, number[]> = {
  1: [100],
  2: [50, 50],
  3: [35, 35, 30],
};

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
  /** Minimum order notional (USDT) used when sizing grid density for this pair. */
  minNotionalUsdt?: number;
  /** True if grid density was reduced below the "ideal" volatility-based count to fit the given capital. */
  capitalConstrained?: boolean;
  /** 1-indexed section numbers that couldn't be funded to even the minimum viable grid count. */
  underfundedSections?: number[];
}

export class AiEngine {
  private aiServiceUrl: string;
  private llmProvider: AiProvider | null;

  constructor(private marketEngine: MarketEngine = new MarketEngine()) {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    // Detect LLM provider from env (OPENAI_API_KEY > ANTHROPIC_API_KEY > GEMINI_API_KEY)
    this.llmProvider = createAiProvider();
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
    capital: number
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

    const minNotional = await getMinNotional(symbol);
    const allocations = DEFAULT_ALLOCATIONS[sectionCount] ?? Array(sectionCount).fill(100 / sectionCount);
    const SAFETY_MARGIN = 1.5;
    const MIN_VIABLE_GRIDS_PER_SECTION = 2;

    let capitalConstrained = false;
    const underfundedSections: number[] = [];

    const recommendedSections: AiSectionRecommendation[] = [];
    const baseGridDistance = Math.max(0.4, Math.round((volatility / 6) * 100) / 100);

    for (let i = 0; i < sectionCount; i++) {
      const minNetProfitPercent = Number((0.5 + i * 0.35).toFixed(2));
      const idealGridCount = i === 0 ? 10 : i === 1 ? 7 : 5;
      const gridDistancePercent = Number((baseGridDistance * (1 + i * 0.25)).toFixed(2));
      const sectionGapPercent = Number((2.0 + i * 1.0).toFixed(2));

      const sectionCapital = capital * (allocations[i] / 100);
      const maxViableGrids = Math.floor(sectionCapital / (minNotional * SAFETY_MARGIN));

      let gridCount: number;
      if (maxViableGrids >= idealGridCount) {
        gridCount = idealGridCount;
      } else if (maxViableGrids >= MIN_VIABLE_GRIDS_PER_SECTION) {
        gridCount = maxViableGrids;
        capitalConstrained = true;
      } else {
        gridCount = MIN_VIABLE_GRIDS_PER_SECTION;
        capitalConstrained = true;
        underfundedSections.push(i + 1);
      }

      const capitalPerOrder = gridCount ? Number((sectionCapital / gridCount).toFixed(2)) : 0;

      const reasoning =
        gridCount < idealGridCount
          ? `Section ${i + 1}: grid count reduced from ${idealGridCount} to ${gridCount} to keep each order (~$${capitalPerOrder}) safely above the exchange minimum ($${minNotional} x ${SAFETY_MARGIN} safety margin).`
          : `Section ${i + 1}: Configured with ${gridCount} grids at ${gridDistancePercent}% spacing. Net profit target set to ${minNetProfitPercent}%.`;

      recommendedSections.push({
        sectionIndex: i,
        gridCount,
        gridDistancePercent,
        sectionGapPercent,
        minNetProfitPercent,
        reasoning,
      });
    }

    const overallReasoning = underfundedSections.length
      ? `AI Strategy generated for ${symbol}: with $${capital} capital, section(s) ${underfundedSections.join(', ')} could not be funded to a safe grid density given this pair's minimum order size ($${minNotional}). Consider increasing capital or reducing section count.`
      : capitalConstrained
        ? `AI Strategy for ${symbol} scaled down to fit your $${capital} capital — every grid order clears the exchange's minimum order size with a ${SAFETY_MARGIN}x safety margin.`
        : `AI Strategy generated for ${symbol} across ${sectionCount} sections based on 24h volatility profile (${volatility}%).`;

    const recommendation: AiStrategyRecommendation = {
      pair: symbol,
      confidenceScore: 85,
      overallReasoning,
      recommendedSections,
      capitalProtectionFloorPrice: Number((currentPrice * 0.75).toFixed(4)),
      maxCapitalPerMovementPercent: 40,
      maxDrawdownAlertPercent: 15,
      minNotionalUsdt: minNotional,
      capitalConstrained,
      underfundedSections,
    };

    // Enrich reasoning with LLM if a provider is configured
    return this.enrichWithLlm(recommendation, { exchange, symbol, sectionCount, volatility });
  }

  /**
   * Enriches a strategy recommendation with LLM-generated reasoning.
   * Falls back to the original recommendation if no LLM provider is configured
   * or if the LLM call fails.
   */
  private async enrichWithLlm(
    recommendation: AiStrategyRecommendation,
    context: {
      exchange: string;
      symbol: string;
      sectionCount: number;
      volatility: number;
    }
  ): Promise<AiStrategyRecommendation> {
    if (!this.llmProvider) {
      return recommendation;
    }

    try {
      const systemPrompt = `You are Qis, an AI-Assisted Grid Trading Strategy Planner.
Your role is to ANALYZE and RECOMMEND, never to execute trades.
Always provide explainable reasoning for your recommendations.
Never modify user capital, allocation, or risk preferences.`;

      const userPrompt = `Generate an explainable grid trading strategy for:
- Exchange: ${context.exchange}
- Pair: ${context.symbol}
- Section Count: ${context.sectionCount}
- 24h Volatility: ${context.volatility}%

Current recommendation:
${JSON.stringify(recommendation, null, 2)}

Provide a concise, professional reasoning summary (max 200 words) explaining:
1. Why this pair is suitable for grid trading
2. Why the section structure is appropriate
3. Risk considerations for the trader`;

      const response = await this.llmProvider.generate({
        systemPrompt,
        userPrompt,
        temperature: 0.5,
        maxTokens: 500,
      });

      return {
        ...recommendation,
        overallReasoning: response.text.trim(),
      };
    } catch (error: any) {
      console.warn(`[AiEngine] LLM enrichment failed (${error.message}). Using heuristic reasoning.`);
      return recommendation;
    }
  }
}
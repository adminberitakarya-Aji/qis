/**
 * Qis Frontend API Client
 * Centralized fetch utility for communicating with NestJS backend (localhost:3001).
 * All API calls return typed responses with error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export interface ApiResponse<T> {
  data: T;
  message?: string;
  statusCode?: number;
}

export interface PairRecommendation {
  rank: number;
  pair: string;
  confidenceScore: number;
  reasoning: string;
  volatility24hPercent: number;
  volume24h: number;
}

export interface MarketTicker {
  symbol: string;
  price: number;
  change24hPercent: number;
  volume24h: number;
}

export interface PortfolioSummary {
  totalCapitalUsdt: number;
  activeStrategies: number;
  realizedPnl24hUsdt: number;
  totalRoundsCompleted: number;
  winRate: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!res.ok) {
      console.warn(`[API] ${path} returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    // Handle both { data: T } and direct T responses
    return (json.data ?? json) as T;
  } catch (err: any) {
    // Network error — backend not running, fail gracefully
    console.warn(`[API] ${path} unreachable:`, err.message);
    return null;
  }
}

// ============================================================
// AI Endpoints
// ============================================================

/**
 * GET /ai/pairs/recommendation
 * Returns Top 5 AI pair recommendations with Confidence Score & reasoning.
 * Powered by Python FastAPI AI Service (indicators: RSI, BB Width, ATR, Volume Score).
 */
export async function getTopPairRecommendations(
  exchange: 'binance' | 'bybit' = 'binance'
): Promise<PairRecommendation[] | null> {
  return apiFetch<PairRecommendation[]>(`/ai/pairs/recommendation?exchange=${exchange}`);
}

// ============================================================
// Market Endpoints
// ============================================================

/**
 * GET /market/ticker/:exchange/:symbol
 * Returns live ticker price & 24h change for a symbol.
 */
export async function getTickerPrice(
  exchange: 'binance' | 'bybit',
  symbol: string
): Promise<MarketTicker | null> {
  const encodedSymbol = encodeURIComponent(symbol);
  return apiFetch<MarketTicker>(`/market/ticker/${exchange}/${encodedSymbol}`);
}

// ============================================================
// Portfolio Endpoints
// ============================================================

/**
 * GET /portfolio/summary
 * Returns total portfolio capital, active strategies, and 24h PnL.
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary | null> {
  return apiFetch<PortfolioSummary>('/portfolio/summary');
}

// ============================================================
// Strategy Endpoints
// ============================================================

export interface BuildStrategyRequest {
  exchange: 'binance' | 'bybit';
  pair: string;
  capital: number;
  sectionCount: 1 | 2 | 3;
  capitalAllocationPercent: number[];
  riskPreference?: 'conservative' | 'balanced' | 'aggressive';
}

export async function buildStrategy(req: BuildStrategyRequest): Promise<any | null> {
  return apiFetch<any>('/strategy/build', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function runSimulation(blueprintId: string): Promise<any | null> {
  return apiFetch<any>('/simulation/run', {
    method: 'POST',
    body: JSON.stringify({ blueprintId }),
  });
}

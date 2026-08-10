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

// ============================================================
// Shared / AI Types
// ============================================================

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
  /** Array of unique pair symbols across active strategies, e.g. ['BTC/USDT', 'ETH/USDT'] */
  activeStrategyPairs: string[];
  realizedPnl24hUsdt: number;
  totalRoundsCompleted: number;
  winRate: number;
}

// ============================================================
// Execution / Trading Grid Types
// ============================================================

export interface GridOrder {
  id: string;
  clientOrderId: string;
  gridStrategyId: string;
  sectionIndex: number;
  globalIndex: number;
  gridPrice: number;
  tpPrice: number;
  allocatedCapital: number;
  estimatedQuantity: number;
  status:
    | 'pending'
    | 'buy_placed'
    | 'buy_filled'
    | 'tp_placed'
    | 'tp_filled'
    | 'cancelled'
    | 'error';
  buyFilledPrice: number | null;
  buyFilledQuantity: number | null;
  tpFilledPrice: number | null;
  realizedPnl: number | null;
  buyFee: number | null;
  tpFee: number | null;
  slippagePercent: number | null;
  filledAt: string | null;
  tpFilledAt: string | null;
  updatedAt: string;
}

export interface ActiveStrategy {
  id: string;
  pair: string;
  exchange: string;
  capital: number;
  status: 'active' | 'stopped' | 'paused';
  sectionCount: number;
  totalGridLevels: number;
  createdAt: string;
  updatedAt: string;
  blueprintId: string;
}

// ============================================================
// Analytics Types
// ============================================================

/** One month row from analytics engine's monthlyBreakdown */
export interface MonthlyReturn {
  month: string;           // e.g. "2026-08"
  rounds: number;          // completed rounds that month
  realizedPnlUsdt: number; // gross PnL
  feesUsdt: number;        // fees paid
  netPnlUsdt: number;      // net PnL (realizedPnl - fees)
}

/** Full analytics summary returned by GET /analytics/summary */
export interface AnalyticsSummary {
  totalRealizedPnlUsdt: number;
  totalFeesUsdt: number;
  netPnlUsdt: number;
  winRate: number;
  totalRounds: number;
  activeStrategiesCount: number;
  bestPairByPnl: string | null;
  monthlyBreakdown: MonthlyReturn[];
}

// ============================================================
// Strategy Build Types
// ============================================================

export interface BuildStrategyRequest {
  exchange: 'binance' | 'bybit';
  pair: string;
  capital: number;
  sectionCount: 1 | 2 | 3;
  capitalAllocationPercent: number[];
  riskPreference?: 'conservative' | 'balanced' | 'aggressive';
}

// ============================================================
// Core fetch utility
// ============================================================

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const { authHeaders } = await import('./auth');
    const headers = authHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      ...options,
    });

    if (!res.ok) {
      console.warn(`[API] ${path} returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as { data?: T };
    // Handle both { data: T } and direct T responses
    return (json.data ?? (json as unknown as T));
  } catch (err: unknown) {
    // Network error — backend not running, fail gracefully
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[API] ${path} unreachable:`, msg);
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
// Execution / Trading Grid Endpoints
// ============================================================

/**
 * GET /execution/active
 * Returns all active grid strategies for the current user.
 */
export async function getActiveStrategies(): Promise<ActiveStrategy[] | null> {
  return apiFetch<ActiveStrategy[]>('/execution/active');
}

/**
 * GET /execution/orders/:strategyId
 * Returns all grid orders for a given strategy, sorted by globalIndex.
 */
export async function getStrategyOrders(strategyId: string): Promise<GridOrder[] | null> {
  return apiFetch<GridOrder[]>(`/execution/orders/${strategyId}`);
}

/**
 * POST /execution/stop/:strategyId
 * Stops a running grid strategy (cancels all open orders on exchange).
 */
export async function stopExecution(strategyId: string): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>(`/execution/stop/${strategyId}`, {
    method: 'POST',
  });
}

// ============================================================
// Analytics Endpoints
// ============================================================

/**
 * GET /analytics/summary
 * Returns full analytics summary for the current user:
 * total PnL, fees, win rate, drawdown, and monthly breakdown.
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary | null> {
  return apiFetch<AnalyticsSummary>('/analytics/summary');
}

// ============================================================
// Strategy Endpoints
// ============================================================

export async function buildStrategy(req: BuildStrategyRequest): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>('/strategy/build', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function runSimulation(blueprintId: string): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>('/simulation/run', {
    method: 'POST',
    body: JSON.stringify({ blueprintId }),
  });
}

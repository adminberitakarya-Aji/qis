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
  /** Only present when mode='paper' — sum of virtualBalance across paper accounts. */
  virtualWalletBalance?: number;
}

/** Global trading mode — switches every dashboard/analytics/portfolio query
 *  between real exchange strategies and virtual-balance paper strategies.
 *  Paper trading never touches exchange API keys (see paper_trading.md). */
export type TradingMode = 'live' | 'paper';

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
 * GET /portfolio/summary?mode=live|paper
 * Returns total portfolio capital, active strategies, and 24h PnL.
 * mode='paper' returns virtual-balance data from PaperStrategy/PaperOrder,
 * completely separate from real GridStrategy/GridOrder tables.
 */
export async function getPortfolioSummary(mode: TradingMode = 'live'): Promise<PortfolioSummary | null> {
  return apiFetch<PortfolioSummary>(`/portfolio/summary?mode=${mode}`);
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

/**
 * POST /execution/start
 * Starts REAL execution of an approved Strategy Blueprint — places live
 * orders on the exchange. Requires a connected Exchange Account with API keys.
 */
export async function startExecution(
  blueprintId: string,
  exchangeAccountId: string,
): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>('/execution/start', {
    method: 'POST',
    body: JSON.stringify({ blueprintId, exchangeAccountId }),
  });
}

// ============================================================
// Paper Trading Endpoints (Virtual Balance, No Real Money)
// ============================================================

/**
 * POST /execution/paper/start
 * Starts a PAPER strategy from an approved Blueprint — simulated fills
 * against a $100 virtual balance, using live market prices. No API key needed.
 */
export async function startPaperExecution(
  blueprintId: string,
  exchange: 'binance' | 'bybit',
): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>('/execution/paper/start', {
    method: 'POST',
    body: JSON.stringify({ blueprintId, exchange }),
  });
}

/**
 * POST /execution/paper/stop/:strategyId
 * Stops a running paper strategy and settles any open virtual position.
 */
export async function stopPaperExecution(strategyId: string): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>(`/execution/paper/stop/${strategyId}`, {
    method: 'POST',
  });
}

export interface PaperBalance {
  exchange: 'binance' | 'bybit';
  virtualBalance: number;
  accountExists: boolean;
}

/**
 * GET /execution/paper/balance/:exchange
 * Available virtual balance for paper strategies on this exchange
 * (each exchange has its own $100 starting pool). Used to lock the
 * "Trading Capital" input in the AI Strategy Builder while in Paper mode.
 */
export async function getPaperBalance(exchange: 'binance' | 'bybit'): Promise<PaperBalance | null> {
  return apiFetch<PaperBalance>(`/execution/paper/balance/${exchange}`);
}

export interface PaperStatus {
  virtualBalance: number;
  activeStrategiesCount: number;
  completedRounds: number;
  totalRealizedPnl: number;
  strategies: Array<Record<string, unknown>>;
}

/**
 * GET /execution/paper/status
 * Returns virtual balance + all paper strategies (active & historical) for
 * the current user, including per-strategy paper orders.
 */
export async function getPaperStatus(): Promise<PaperStatus | null> {
  return apiFetch<PaperStatus>('/execution/paper/status');
}

// ============================================================
// Analytics Endpoints
// ============================================================

/**
 * GET /analytics/summary?mode=live|paper
 * Returns full analytics summary for the current user:
 * total PnL, fees, win rate, drawdown, and monthly breakdown.
 */
export async function getAnalyticsSummary(mode: TradingMode = 'live'): Promise<AnalyticsSummary | null> {
  return apiFetch<AnalyticsSummary>(`/analytics/summary?mode=${mode}`);
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

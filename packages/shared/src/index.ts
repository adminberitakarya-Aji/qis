// Qis Shared Types
// Shared domain types used across all Engines.
// These types are the contract between Engines.

// ============================================================
// Common
// ============================================================

export type ExchangeName = 'binance' | 'bybit';

export type OrderSide = 'buy' | 'sell';

export type OrderStatus = 'waiting' | 'buy_executed' | 'sell_executed' | 'completed';

export type FloorAction = 'pause' | 'notify' | 'hard_stop';

// ============================================================
// Strategy Blueprint
// ============================================================

export interface Blueprint {
  id: string;
  userId?: string;
  pair: string;
  exchange: ExchangeName;
  tradingCapital: number;
  sectionCount: number;
  sections: GridSection[];
  capitalProtectionFloor: number;
  floorAction: FloorAction;
  maxDrawdownAlertPercent: number;
  maxCapitalPerMovementPercent: number;
  confidenceScore: number;
  aiReasoning: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface GridSection {
  index: number;
  allocationPercent: number;
  gridCount: number;
  gridDistancePercent: number;
  sectionGapPercent: number;
  minNetProfitPercent: number;
}

// ============================================================
// Grid Order
// ============================================================

export interface GridOrder {
  id: string;
  blueprintId: string;
  sectionIndex: number;
  gridPrice: number;
  executedPrice?: number;
  tpPrice?: number;
  status: OrderStatus;
  createdAt: Date;
  executedAt?: Date;
  completedAt?: Date;
  slippage?: number;
}

// ============================================================
// Market Data
// ============================================================

export interface MarketData {
  pair: string;
  price: number;
  timestamp: Date;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

// ============================================================
// AI Recommendation
// ============================================================

export interface PairRecommendation {
  pair: string;
  confidenceScore: number;
  marketSummary: string;
  reasoning: string;
}

// ============================================================
// Simulation
// ============================================================

export interface SimulationResult {
  estimatedCapitalUsage: number;
  estimatedOrderCount: number;
  estimatedFees: number;
  estimatedNetProfit: number;
  estimatedMaxDrawdown: number;
  averageEntryPrice: number;
}

// ============================================================
// API Response Envelope
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ApiError[];
}

export interface ApiError {
  field?: string;
  message: string;
}

// ============================================================
// Idempotency
// ============================================================

export interface IdempotencyKey {
  key: string;
}
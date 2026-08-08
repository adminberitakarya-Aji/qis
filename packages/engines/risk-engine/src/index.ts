// Qis Risk Engine
// Responsible for:
// - Pre-trade risk checks (synchronous, before a strategy launches)
// - Capital allocation check against Portfolio Engine's uncommitted balance
// - Max concurrent strategies per user
// - Max capital per pair
// - Max capital per user
//
// Per ROADMAP.md Phase 2:
// - Pre-trade checks only (sync half)
// - Reuse Phase 0's alerting channel for risk events
// - Deferred: correlation risk modeling, VaR/expected shortfall, risk-score UI

// ============================================================
// Types
// ============================================================

export type RiskViolationCode =
  | 'CAPITAL_LIMIT_EXCEEDED'
  | 'MAX_CONCURRENT_STRATEGIES_EXCEEDED'
  | 'MAX_CAPITAL_PER_PAIR_EXCEEDED'
  | 'MAX_CAPITAL_PER_USER_EXCEEDED';

export interface RiskViolation {
  code: RiskViolationCode;
  message: string;
  details: Record<string, string | number>;
}

export interface RiskCheckOutcome {
  approved: boolean;
  blocked: boolean;
  reasons: RiskViolation[];
}

export interface RiskConfig {
  /** Max number of concurrently active strategies per user. */
  maxConcurrentStrategiesPerUser: number;
  /** Max total capital (USDT) committed to a single trading pair per user. */
  maxCapitalPerPair: number;
  /** Max total capital (USDT) committed across all strategies per user. */
  maxCapitalPerUser: number;
}

export interface RiskCheckInput {
  userId: string;
  exchangeAccountId: string;
  pair: string;
  /** Capital requested for the new strategy (USDT). */
  capital: number;
  /** Total capital already committed to active strategies on this exchange account (USDT). */
  committedCapital: number;
  /** Number of currently active strategies on this exchange account. */
  activeStrategyCount: number;
  /** Total capital already committed to the same pair on this exchange account (USDT). */
  committedCapitalOnPair: number;
  /** Total free (uncommitted) balance on the exchange account (USDT). Optional — if omitted, the capital check is skipped. */
  freeBalanceUsdt?: number;
}

// ============================================================
// Risk Engine
// ============================================================

export class RiskEngine {
  constructor(private readonly config: RiskConfig) {}

  /**
   * Runs all pre-trade risk checks synchronously.
   *
   * Per ROADMAP.md Phase 2:
   * - Capital allocation check against Portfolio Engine's uncommitted balance
   * - Max concurrent strategies per user
   * - Max capital per pair
   * - Max capital per user
   *
   * Returns an outcome with all violations found. The caller decides
   * whether to block the strategy launch or surface the reasons.
   */
  checkPreTrade(input: RiskCheckInput): RiskCheckOutcome {
    const violations: RiskViolation[] = [];

    // 1. Capital allocation check against uncommitted balance.
    //    Concurrency Rule #6 (BUSINESS_RULES_ADDENDUM.md):
    //    "A new Blueprint may not be approved if its required capital
    //     exceeds the trader's uncommitted balance."
    if (input.freeBalanceUsdt !== undefined) {
      if (input.capital > input.freeBalanceUsdt) {
        violations.push({
          code: 'CAPITAL_LIMIT_EXCEEDED',
          message: `Strategy capital ${input.capital} USDT exceeds uncommitted balance ${input.freeBalanceUsdt} USDT`,
          details: {
            capital: input.capital,
            freeBalanceUsdt: input.freeBalanceUsdt,
          },
        });
      }
    }

    // 2. Max concurrent strategies per user.
    if (input.activeStrategyCount >= this.config.maxConcurrentStrategiesPerUser) {
      violations.push({
        code: 'MAX_CONCURRENT_STRATEGIES_EXCEEDED',
        message: `Active strategy count ${input.activeStrategyCount} has reached the limit of ${this.config.maxConcurrentStrategiesPerUser}`,
        details: {
          activeStrategyCount: input.activeStrategyCount,
          limit: this.config.maxConcurrentStrategiesPerUser,
        },
      });
    }

    // 3. Max capital per pair.
    const totalCapitalOnPair = input.committedCapitalOnPair + input.capital;
    if (totalCapitalOnPair > this.config.maxCapitalPerPair) {
      violations.push({
        code: 'MAX_CAPITAL_PER_PAIR_EXCEEDED',
        message: `Total capital on ${input.pair} would be ${totalCapitalOnPair} USDT, exceeding the limit of ${this.config.maxCapitalPerPair} USDT`,
        details: {
          pair: input.pair,
          totalCapitalOnPair,
          limit: this.config.maxCapitalPerPair,
        },
      });
    }

    // 4. Max capital per user.
    const totalCommittedAfter = input.committedCapital + input.capital;
    if (totalCommittedAfter > this.config.maxCapitalPerUser) {
      violations.push({
        code: 'MAX_CAPITAL_PER_USER_EXCEEDED',
        message: `Total committed capital would be ${totalCommittedAfter} USDT, exceeding the limit of ${this.config.maxCapitalPerUser} USDT`,
        details: {
          totalCommittedAfter,
          limit: this.config.maxCapitalPerUser,
        },
      });
    }

    return {
      approved: violations.length === 0,
      blocked: violations.length > 0,
      reasons: violations,
    };
  }

  /**
   * Returns the default risk configuration.
   * These are conservative defaults; the API layer can override
   * via environment variables.
   */
  static defaultConfig(): RiskConfig {
    return {
      maxConcurrentStrategiesPerUser: 5,
      maxCapitalPerPair: 50000,
      maxCapitalPerUser: 100000,
    };
  }
}

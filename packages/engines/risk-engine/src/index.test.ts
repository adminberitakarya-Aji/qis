import { describe, it, expect } from 'vitest';
import { RiskEngine, type RiskConfig } from './index';

const config: RiskConfig = {
  maxConcurrentStrategiesPerUser: 5,
  maxCapitalPerPair: 50000,
  maxCapitalPerUser: 100000,
};

function buildInput(overrides: Partial<Parameters<RiskEngine['checkPreTrade']>[0]> = {}) {
  return {
    userId: 'user-1',
    exchangeAccountId: 'account-1',
    pair: 'BTC/USDT',
    capital: 1000,
    committedCapital: 0,
    activeStrategyCount: 0,
    committedCapitalOnPair: 0,
    freeBalanceUsdt: 10000,
    ...overrides,
  };
}

describe('RiskEngine.checkPreTrade', () => {
  it('approves when all checks pass', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(buildInput());

    expect(outcome.approved).toBe(true);
    expect(outcome.blocked).toBe(false);
    expect(outcome.reasons).toHaveLength(0);
  });

  it('blocks when capital exceeds uncommitted balance', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ capital: 15000, freeBalanceUsdt: 10000 }),
    );

    expect(outcome.approved).toBe(false);
    expect(outcome.blocked).toBe(true);
    expect(outcome.reasons).toHaveLength(1);
    expect(outcome.reasons[0].code).toBe('CAPITAL_LIMIT_EXCEEDED');
  });

  it('skips capital allocation check when free balance is omitted', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ capital: 999999, freeBalanceUsdt: undefined }),
    );

    expect(outcome.reasons.some((r) => r.code === 'CAPITAL_LIMIT_EXCEEDED')).toBe(false);
  });

  it('blocks when active strategy count reaches the limit', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ activeStrategyCount: 5 }),
    );

    expect(outcome.approved).toBe(false);
    expect(outcome.reasons.some((r) => r.code === 'MAX_CONCURRENT_STRATEGIES_EXCEEDED')).toBe(true);
  });

  it('allows when active strategy count is below the limit', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ activeStrategyCount: 4 }),
    );

    expect(outcome.approved).toBe(true);
  });

  it('blocks when total capital on a pair exceeds the limit', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ committedCapitalOnPair: 49000, capital: 2000 }),
    );

    expect(outcome.approved).toBe(false);
    expect(outcome.reasons.some((r) => r.code === 'MAX_CAPITAL_PER_PAIR_EXCEEDED')).toBe(true);
  });

  it('allows when total capital on a pair is within the limit', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ committedCapitalOnPair: 49000, capital: 999 }),
    );

    expect(outcome.approved).toBe(true);
  });

  it('blocks when total committed capital per user exceeds the limit', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({ committedCapital: 99000, capital: 2000 }),
    );

    expect(outcome.approved).toBe(false);
    expect(outcome.reasons.some((r) => r.code === 'MAX_CAPITAL_PER_USER_EXCEEDED')).toBe(true);
  });

  it('collects multiple violations at once', () => {
    const engine = new RiskEngine(config);
    const outcome = engine.checkPreTrade(
      buildInput({
        capital: 15000,
        freeBalanceUsdt: 10000,
        activeStrategyCount: 5,
        committedCapitalOnPair: 49000,
        committedCapital: 99000,
      }),
    );

    expect(outcome.approved).toBe(false);
    expect(outcome.reasons).toHaveLength(4);
  });

  it('exact boundary equality does not block', () => {
    const engine = new RiskEngine(config);
    // Activity count exactly at limit is blocked (>=)
    const atLimit = engine.checkPreTrade(buildInput({ activeStrategyCount: 5 }));
    expect(atLimit.blocked).toBe(true);

    // Capital exactly at pair limit is allowed (strict >)
    const pairAtLimit = engine.checkPreTrade(
      buildInput({ committedCapitalOnPair: 49000, capital: 1000 }),
    );
    expect(pairAtLimit.approved).toBe(true);

    // Capital exactly at user limit is allowed (strict >)
    const userAtLimit = engine.checkPreTrade(
      buildInput({ committedCapital: 99000, capital: 1000 }),
    );
    expect(userAtLimit.approved).toBe(true);
  });
});

describe('RiskEngine.defaultConfig', () => {
  it('returns conservative defaults', () => {
    const cfg = RiskEngine.defaultConfig();
    expect(cfg.maxConcurrentStrategiesPerUser).toBe(5);
    expect(cfg.maxCapitalPerPair).toBe(50000);
    expect(cfg.maxCapitalPerUser).toBe(100000);
  });
});
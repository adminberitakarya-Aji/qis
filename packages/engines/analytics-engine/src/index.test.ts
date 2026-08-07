import { describe, it, expect } from 'vitest';
import { AnalyticsEngine, type CompletedOrderRecord } from './index';

describe('AnalyticsEngine', () => {
  const engine = new AnalyticsEngine();

  function createOrder(overrides: Partial<CompletedOrderRecord> = {}): CompletedOrderRecord {
    const base: CompletedOrderRecord = {
      clientOrderId: 'order_1',
      strategyId: 'strategy_1',
      pair: 'BTC/USDT',
      sectionIndex: 0,
      allocatedCapital: 1000,
      buyFilledPrice: 100,
      buyFilledQuantity: 10,
      buyFee: 0.1,
      tpFilledPrice: 101,
      tpFee: 0.1,
      realizedPnl: 9.8,
      buyFilledAt: new Date('2026-08-01T10:00:00Z'),
      tpFilledAt: new Date('2026-08-01T12:00:00Z'),
    };
    return { ...base, ...overrides };
  }

  describe('calculateStrategyAnalytics', () => {
    it('returns empty analytics for no completed orders', () => {
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, []);
      expect(result.totalRounds).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.netPnlUsdt).toBe(0);
      expect(result.dailyBreakdown).toHaveLength(0);
    });

    it('calculates win rate correctly', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10 }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5 }),
        createOrder({ clientOrderId: 'o3', realizedPnl: 3 }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      expect(result.totalRounds).toBe(3);
      expect(result.winningRounds).toBe(2);
      expect(result.losingRounds).toBe(1);
      expect(result.winRate).toBeCloseTo(66.7, 1);
    });

    it('calculates total PnL and fees correctly', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10, buyFee: 0.1, tpFee: 0.1 }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5, buyFee: 0.1, tpFee: 0.1 }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      expect(result.totalRealizedPnlUsdt).toBeCloseTo(5, 4);
      expect(result.totalFeesUsdt).toBeCloseTo(0.4, 4);
      expect(result.netPnlUsdt).toBeCloseTo(4.6, 4);
    });

    it('calculates profit factor correctly', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 20 }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5 }),
        createOrder({ clientOrderId: 'o3', realizedPnl: 10 }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      // grossProfit = 30, grossLoss = 5, profitFactor = 6
      expect(result.profitFactor).toBeCloseTo(6, 2);
    });

    it('calculates average holding duration', () => {
      const orders = [
        createOrder({
          clientOrderId: 'o1',
          buyFilledAt: new Date('2026-08-01T10:00:00Z'),
          tpFilledAt: new Date('2026-08-01T12:00:00Z'), // 2 hours
        }),
        createOrder({
          clientOrderId: 'o2',
          buyFilledAt: new Date('2026-08-01T10:00:00Z'),
          tpFilledAt: new Date('2026-08-01T14:00:00Z'), // 4 hours
        }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      expect(result.avgHoldingDurationHours).toBeCloseTo(3, 2);
    });

    it('groups daily breakdown correctly', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10, tpFilledAt: new Date('2026-08-01T12:00:00Z') }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5, tpFilledAt: new Date('2026-08-01T15:00:00Z') }),
        createOrder({ clientOrderId: 'o3', realizedPnl: 3, tpFilledAt: new Date('2026-08-02T12:00:00Z') }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      expect(result.dailyBreakdown).toHaveLength(2);
      expect(result.dailyBreakdown[0].date).toBe('2026-08-01');
      expect(result.dailyBreakdown[0].rounds).toBe(2);
      expect(result.dailyBreakdown[1].date).toBe('2026-08-02');
      expect(result.dailyBreakdown[1].rounds).toBe(1);
    });

    it('calculates best and worst round PnL', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10 }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5 }),
        createOrder({ clientOrderId: 'o3', realizedPnl: 3 }),
      ];
      const result = engine.calculateStrategyAnalytics('s1', 'BTC/USDT', 10000, orders);
      expect(result.bestRoundPnlUsdt).toBeCloseTo(10, 4);
      expect(result.worstRoundPnlUsdt).toBeCloseTo(-5, 4);
    });
  });

  describe('buildUserSummary', () => {
    it('returns empty summary for no orders', () => {
      const result = engine.buildUserSummary(0, []);
      expect(result.totalRounds).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.bestPairByPnl).toBeNull();
      expect(result.monthlyBreakdown).toHaveLength(0);
    });

    it('calculates total PnL and win rate', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10 }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5 }),
        createOrder({ clientOrderId: 'o3', realizedPnl: 3 }),
      ];
      const result = engine.buildUserSummary(2, orders);
      expect(result.totalRounds).toBe(3);
      expect(result.totalRealizedPnlUsdt).toBeCloseTo(8, 4);
      expect(result.winRate).toBeCloseTo(66.7, 1);
      expect(result.activeStrategiesCount).toBe(2);
    });

    it('identifies best pair by PnL', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', pair: 'BTC/USDT', realizedPnl: 10 }),
        createOrder({ clientOrderId: 'o2', pair: 'ETH/USDT', realizedPnl: 20 }),
        createOrder({ clientOrderId: 'o3', pair: 'BTC/USDT', realizedPnl: -5 }),
      ];
      const result = engine.buildUserSummary(1, orders);
      expect(result.bestPairByPnl).toBe('ETH/USDT');
    });

    it('groups monthly breakdown correctly', () => {
      const orders = [
        createOrder({ clientOrderId: 'o1', realizedPnl: 10, tpFilledAt: new Date('2026-08-01T12:00:00Z') }),
        createOrder({ clientOrderId: 'o2', realizedPnl: -5, tpFilledAt: new Date('2026-09-01T12:00:00Z') }),
      ];
      const result = engine.buildUserSummary(1, orders);
      expect(result.monthlyBreakdown).toHaveLength(2);
      expect(result.monthlyBreakdown[0].month).toBe('2026-08');
      expect(result.monthlyBreakdown[1].month).toBe('2026-09');
    });
  });
});
import { describe, it, expect } from 'vitest';
import { calculateTpPrice, calculateNetProfitPercent, meetsMinNetProfit } from './tp';

describe('calculateTpPrice', () => {
  it('calculates TP price correctly with all fees', () => {
    const tp = calculateTpPrice({
      buyExecutedPrice: 100,
      minNetProfitPercent: 0.5,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
      estimatedSlippagePercent: 0.05,
    });
    // 100 * (1 + (0.5 + 0.1 + 0.1 + 0.05) / 100) = 100 * 1.0075 = 100.75
    expect(tp).toBeCloseTo(100.75, 6);
  });

  it('returns buy price when all percentages are zero', () => {
    const tp = calculateTpPrice({
      buyExecutedPrice: 50,
      minNetProfitPercent: 0,
      buyFeePercent: 0,
      sellFeePercent: 0,
      estimatedSlippagePercent: 0,
    });
    expect(tp).toBe(50);
  });

  it('handles high profit target', () => {
    const tp = calculateTpPrice({
      buyExecutedPrice: 1000,
      minNetProfitPercent: 5,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
      estimatedSlippagePercent: 0.1,
    });
    // 1000 * (1 + 5.3/100) = 1053
    expect(tp).toBeCloseTo(1053, 6);
  });
});

describe('calculateNetProfitPercent', () => {
  it('calculates net profit correctly', () => {
    const netProfit = calculateNetProfitPercent({
      buyExecutedPrice: 100,
      sellPrice: 101,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
    });
    // buyCost = 100 * 1.001 = 100.1
    // sellProceeds = 101 * 0.999 = 100.899
    // netProfit = (100.899 - 100.1) / 100.1 * 100 ≈ 0.7982%
    expect(netProfit).toBeCloseTo(0.7982, 2);
  });

  it('returns negative profit when selling below cost', () => {
    const netProfit = calculateNetProfitPercent({
      buyExecutedPrice: 100,
      sellPrice: 99,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
    });
    expect(netProfit).toBeLessThan(0);
  });

  it('returns zero when selling at exact cost', () => {
    const netProfit = calculateNetProfitPercent({
      buyExecutedPrice: 100,
      sellPrice: 100,
      buyFeePercent: 0,
      sellFeePercent: 0,
    });
    expect(netProfit).toBeCloseTo(0, 6);
  });
});

describe('meetsMinNetProfit', () => {
  it('returns true when net profit meets minimum', () => {
    const result = meetsMinNetProfit({
      buyExecutedPrice: 100,
      sellPrice: 101,
      minNetProfitPercent: 0.5,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
    });
    expect(result).toBe(true);
  });

  it('returns false when net profit is below minimum', () => {
    const result = meetsMinNetProfit({
      buyExecutedPrice: 100,
      sellPrice: 100.5,
      minNetProfitPercent: 1.0,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
    });
    expect(result).toBe(false);
  });

  it('returns true when net profit meets minimum with fees', () => {
    // buyCost = 100 * 1.001 = 100.1
    // sellProceeds = 100.51 * 0.999 = 100.40949
    // netProfit = (100.40949 - 100.1) / 100.1 * 100 ≈ 0.309% >= 0.3%
    const result = meetsMinNetProfit({
      buyExecutedPrice: 100,
      sellPrice: 100.51,
      minNetProfitPercent: 0.3,
      buyFeePercent: 0.1,
      sellFeePercent: 0.1,
    });
    expect(result).toBe(true);
  });
});
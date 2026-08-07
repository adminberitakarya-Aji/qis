import { describe, it, expect } from 'vitest';
import { GridEngine } from './index';

describe('GridEngine', () => {
  const engine = new GridEngine();

  const baseInput = {
    currentPrice: 100,
    totalCapital: 10000,
    sections: [
      { allocationPercent: 50, gridCount: 3, gridDistancePercent: 1.0, sectionGapPercent: 2.0, minNetProfitPercent: 0.5 },
      { allocationPercent: 50, gridCount: 2, gridDistancePercent: 1.0, sectionGapPercent: 3.0, minNetProfitPercent: 0.8 },
    ],
  };

  describe('buildGrid', () => {
    it('builds correct number of sections and orders', () => {
      const result = engine.buildGrid(baseInput);
      expect(result.sections).toHaveLength(2);
      expect(result.totalOrderCount).toBe(5);
      expect(result.sections[0].orders).toHaveLength(3);
      expect(result.sections[1].orders).toHaveLength(2);
    });

    it('calculates section capital allocation correctly', () => {
      const result = engine.buildGrid(baseInput);
      expect(result.sections[0].allocatedCapitalUsdt).toBe(5000);
      expect(result.sections[1].allocatedCapitalUsdt).toBe(5000);
    });

    it('calculates capital per order correctly', () => {
      const result = engine.buildGrid(baseInput);
      // Section 0: 5000 / 3 = 1666.67
      expect(result.sections[0].orders[0].allocatedCapitalUsdt).toBeCloseTo(1666.67, 2);
      // Section 1: 5000 / 2 = 2500
      expect(result.sections[1].orders[0].allocatedCapitalUsdt).toBe(2500);
    });

    it('applies grid distance within a section', () => {
      const result = engine.buildGrid(baseInput);
      const section0 = result.sections[0];
      // First order: 100 * (1 - 1%) = 99
      expect(section0.orders[0].gridPrice).toBeCloseTo(99, 6);
      // Second order: 99 * (1 - 1%) = 98.01
      expect(section0.orders[1].gridPrice).toBeCloseTo(98.01, 6);
      // Third order: 98.01 * (1 - 1%) = 97.0299
      expect(section0.orders[2].gridPrice).toBeCloseTo(97.0299, 6);
    });

    it('applies section gap between sections', () => {
      const result = engine.buildGrid(baseInput);
      const section0 = result.sections[0];
      const section1 = result.sections[1];
      // Last order of section 0: 97.0299
      // First order of section 1: 97.0299 * (1 - 3%) = 94.119
      expect(section1.orders[0].gridPrice).toBeCloseTo(94.119, 3);
    });

    it('calculates estimated quantity correctly', () => {
      const result = engine.buildGrid(baseInput);
      const order = result.sections[0].orders[0];
      // capitalPerOrder / gridPrice = 1666.67 / 99 ≈ 16.835
      expect(order.estimatedQuantity).toBeCloseTo(16.835, 3);
    });

    it('calculates estimated TP price correctly', () => {
      const result = engine.buildGrid(baseInput);
      const order = result.sections[0].orders[0];
      // TP = 99 * (1 + (0.5 + 0.1 + 0.1 + 0.05)/100) = 99 * 1.0075 = 99.7425
      expect(order.estimatedTpPrice).toBeCloseTo(99.7425, 4);
    });

    it('tracks lowest and highest grid prices', () => {
      const result = engine.buildGrid(baseInput);
      expect(result.lowestGridPrice).toBeCloseTo(result.sections[1].orders[1].gridPrice, 6);
      expect(result.highestGridPrice).toBeCloseTo(result.sections[0].orders[0].gridPrice, 6);
    });

    it('handles single section', () => {
      const result = engine.buildGrid({
        currentPrice: 100,
        totalCapital: 1000,
        sections: [
          { allocationPercent: 100, gridCount: 5, gridDistancePercent: 0.5, sectionGapPercent: 0, minNetProfitPercent: 0.5 },
        ],
      });
      expect(result.sections).toHaveLength(1);
      expect(result.totalOrderCount).toBe(5);
      expect(result.sections[0].allocatedCapitalUsdt).toBe(1000);
    });

    it('handles custom fees', () => {
      const result = engine.buildGrid({
        currentPrice: 100,
        totalCapital: 1000,
        buyFeePercent: 0.2,
        sellFeePercent: 0.2,
        estimatedSlippagePercent: 0.1,
        sections: [
          { allocationPercent: 100, gridCount: 1, gridDistancePercent: 1.0, sectionGapPercent: 0, minNetProfitPercent: 1.0 },
        ],
      });
      const order = result.sections[0].orders[0];
      // TP = 99 * (1 + (1.0 + 0.2 + 0.2 + 0.1)/100) = 99 * 1.015 = 100.485
      expect(order.estimatedTpPrice).toBeCloseTo(100.485, 3);
    });
  });
});
import { describe, it, expect } from 'vitest';
import type { Blueprint } from '@qis/shared';
import { validateBlueprint, VALID_SECTION_COUNTS } from './blueprint';

function createValidBlueprint(): Blueprint {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  return {
    id: 'bp_test_1',
    pair: 'BTC/USDT',
    exchange: 'binance',
    tradingCapital: 10000,
    sectionCount: 3,
    sections: [
      { index: 0, allocationPercent: 35, gridCount: 10, gridDistancePercent: 0.5, sectionGapPercent: 2.0, minNetProfitPercent: 0.5 },
      { index: 1, allocationPercent: 35, gridCount: 7, gridDistancePercent: 0.6, sectionGapPercent: 3.0, minNetProfitPercent: 0.8 },
      { index: 2, allocationPercent: 30, gridCount: 5, gridDistancePercent: 0.7, sectionGapPercent: 4.0, minNetProfitPercent: 1.2 },
    ],
    capitalProtectionFloor: -1,
    floorAction: 'notify',
    maxCapitalPerMovementPercent: 40,
    maxDrawdownAlertPercent: 15,
    confidenceScore: 85,
    aiReasoning: 'BTC shows strong momentum.',
    createdAt: now,
    expiresAt,
  };
}

describe('validateBlueprint', () => {
  it('returns empty errors for valid blueprint', () => {
    const errors = validateBlueprint(createValidBlueprint());
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid section count', () => {
    const bp = createValidBlueprint();
    bp.sectionCount = 5;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section count must be 1, 2, or 3');
  });

  it('rejects mismatched sections length', () => {
    const bp = createValidBlueprint();
    bp.sections = bp.sections.slice(0, 2);
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Sections length must match section count');
  });

  it('rejects allocation not summing to 100%', () => {
    const bp = createValidBlueprint();
    bp.sections[0].allocationPercent = 50;
    const errors = validateBlueprint(bp);
    expect(errors.some((e) => e.includes('Total capital allocation must equal 100%'))).toBe(true);
  });

  it('rejects grid count < 1', () => {
    const bp = createValidBlueprint();
    bp.sections[0].gridCount = 0;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section 1: Grid count must be at least 1');
  });

  it('rejects grid distance <= 0', () => {
    const bp = createValidBlueprint();
    bp.sections[0].gridDistancePercent = 0;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section 1: Grid distance must be greater than 0');
  });

  it('rejects section gap <= 0', () => {
    const bp = createValidBlueprint();
    bp.sections[1].sectionGapPercent = -1;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section 2: Section gap must be greater than 0');
  });

  it('rejects min_net_profit <= 0', () => {
    const bp = createValidBlueprint();
    bp.sections[2].minNetProfitPercent = 0;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section 3: min_net_profit_percent must be greater than 0');
  });

  it('rejects allocation <= 0', () => {
    const bp = createValidBlueprint();
    bp.sections[0].allocationPercent = 0;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Section 1: Allocation must be greater than 0');
  });

  it('rejects floor not below lowest grid', () => {
    const bp = createValidBlueprint();
    bp.capitalProtectionFloor = 50000;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Capital protection floor must be below the lowest grid level');
  });

  it('rejects maxCapitalPerMovementPercent out of range', () => {
    const bp = createValidBlueprint();
    bp.maxCapitalPerMovementPercent = 0;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('maxCapitalPerMovementPercent must be between 0 and 100');
  });

  it('rejects maxDrawdownAlertPercent out of range', () => {
    const bp = createValidBlueprint();
    bp.maxDrawdownAlertPercent = 120;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('maxDrawdownAlertPercent must be between 0 and 100');
  });

  it('rejects confidence score outside 0-100', () => {
    const bp = createValidBlueprint();
    bp.confidenceScore = 150;
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Confidence score must be between 0 and 100');
  });

  it('rejects expiry before creation', () => {
    const bp = createValidBlueprint();
    bp.expiresAt = new Date(bp.createdAt.getTime() - 1000);
    const errors = validateBlueprint(bp);
    expect(errors).toContain('Blueprint expiry must be after creation');
  });

  it('rejects empty AI reasoning', () => {
    const bp = createValidBlueprint();
    bp.aiReasoning = '   ';
    const errors = validateBlueprint(bp);
    expect(errors).toContain('AI reasoning is required');
  });
});

describe('VALID_SECTION_COUNTS', () => {
  it('contains 1, 2, and 3', () => {
    expect(VALID_SECTION_COUNTS).toEqual([1, 2, 3]);
  });
});
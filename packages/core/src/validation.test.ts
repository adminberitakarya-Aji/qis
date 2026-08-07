import { describe, it, expect } from 'vitest';
import { validatePercent, validatePositiveNumber, validateRequiredString, validateAllocationSum } from './validation';

describe('validatePercent', () => {
  it('returns null for valid percentage', () => {
    expect(validatePercent(50, 'Allocation')).toBeNull();
  });

  it('returns error for value below min', () => {
    const err = validatePercent(-1, 'Allocation');
    expect(err).toContain('Allocation must be between 0 and 100');
  });

  it('returns error for value above max', () => {
    const err = validatePercent(101, 'Allocation');
    expect(err).toContain('Allocation must be between 0 and 100');
  });

  it('respects custom min/max', () => {
    expect(validatePercent(5, 'GridDistance', { min: 0.1, max: 10 })).toBeNull();
    const err = validatePercent(15, 'GridDistance', { min: 0.1, max: 10 });
    expect(err).toContain('GridDistance must be between 0.1 and 10');
  });

  it('returns error for non-finite value', () => {
    const err = validatePercent(NaN, 'Allocation');
    expect(err).toContain('Allocation must be a finite number');
  });
});

describe('validatePositiveNumber', () => {
  it('returns null for positive number', () => {
    expect(validatePositiveNumber(100, 'Capital')).toBeNull();
  });

  it('returns error for zero', () => {
    const err = validatePositiveNumber(0, 'Capital');
    expect(err).toContain('Capital must be greater than 0');
  });

  it('returns error for negative', () => {
    const err = validatePositiveNumber(-5, 'Capital');
    expect(err).toContain('Capital must be greater than 0');
  });

  it('returns error for NaN', () => {
    const err = validatePositiveNumber(NaN, 'Capital');
    expect(err).toContain('Capital must be a finite number');
  });
});

describe('validateRequiredString', () => {
  it('returns null for non-empty string', () => {
    expect(validateRequiredString('BTC/USDT', 'Pair')).toBeNull();
  });

  it('returns error for empty string', () => {
    const err = validateRequiredString('', 'Pair');
    expect(err).toContain('Pair is required');
  });

  it('returns error for whitespace-only string', () => {
    const err = validateRequiredString('   ', 'Pair');
    expect(err).toContain('Pair is required');
  });

  it('returns error for undefined', () => {
    const err = validateRequiredString(undefined as any, 'Pair');
    expect(err).toContain('Pair is required');
  });
});

describe('validateAllocationSum', () => {
  it('returns null when sum is 100', () => {
    expect(validateAllocationSum([35, 35, 30])).toBeNull();
  });

  it('returns error when sum is not 100', () => {
    const err = validateAllocationSum([50, 30]);
    expect(err).toContain('Total allocation must equal 100%');
  });

  it('returns null for single 100% allocation', () => {
    expect(validateAllocationSum([100])).toBeNull();
  });

  it('returns error for empty array', () => {
    const err = validateAllocationSum([]);
    expect(err).toContain('Total allocation must equal 100%');
  });
});
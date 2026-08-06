// Qis Shared Validation Helpers

// ============================================================
// Percentage Validation
// ============================================================

export interface PercentRangeOptions {
  min?: number;
  max?: number;
}

/**
 * Validates a percentage value is within the given range.
 * Returns an error message or null if valid.
 */
export function validatePercent(
  value: number,
  fieldName: string,
  options: PercentRangeOptions = {}
): string | null {
  const min = options.min ?? 0;
  const max = options.max ?? 100;

  if (!Number.isFinite(value)) {
    return `${fieldName} must be a finite number`;
  }

  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}, got ${value}`;
  }

  return null;
}

// ============================================================
// Positive Number Validation
// ============================================================

export function validatePositiveNumber(value: number, fieldName: string): string | null {
  if (!Number.isFinite(value)) {
    return `${fieldName} must be a finite number`;
  }

  if (value <= 0) {
    return `${fieldName} must be greater than 0`;
  }

  return null;
}

// ============================================================
// Required String Validation
// ============================================================

export function validateRequiredString(value: string, fieldName: string): string | null {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required`;
  }

  return null;
}

// ============================================================
// Allocation Sum Validation
// ============================================================

/**
 * Validates that the given allocations sum to 100%.
 */
export function validateAllocationSum(allocations: number[]): string | null {
  const total = allocations.reduce((sum, allocation) => sum + allocation, 0);

  if (Math.abs(total - 100) > 0.001) {
    return `Total allocation must equal 100%, got ${total}%`;
  }

  return null;
}
// Qis Blueprint Domain Model
// The Blueprint is the center of the system.
// Every trading execution originates from an approved Blueprint.

import type { Blueprint, GridSection } from '@qis/shared';

// ============================================================
// Blueprint Validation
// ============================================================

export const VALID_SECTION_COUNTS = [1, 2, 3] as const;

export const DEFAULT_VALIDITY_WINDOW_MINUTES = 15;

export function validateBlueprint(blueprint: Blueprint): string[] {
  const errors: string[] = [];

  // Section Count
  if (!VALID_SECTION_COUNTS.includes(blueprint.sectionCount as 1 | 2 | 3)) {
    errors.push('Section count must be 1, 2, or 3');
  }

  if (blueprint.sections.length !== blueprint.sectionCount) {
    errors.push('Sections length must match section count');
  }

  // Capital Allocation must total 100%
  const totalAllocation = blueprint.sections.reduce((sum, s) => sum + s.allocationPercent, 0);
  if (Math.abs(totalAllocation - 100) > 0.001) {
    errors.push(`Total capital allocation must equal 100%, got ${totalAllocation}%`);
  }

  // Validate each section
  blueprint.sections.forEach((section, idx) => {
    validateSection(section, idx, errors);
  });

  // Capital protection floor must be below the lowest grid level
  const lowestSection = blueprint.sections[blueprint.sections.length - 1];
  if (lowestSection) {
    const lowestPrice = estimateLowestGridPrice(blueprint.pair, lowestSection);
    if (blueprint.capitalProtectionFloor >= lowestPrice) {
      errors.push('Capital protection floor must be below the lowest grid level');
    }
  }

  // Capital protection on gaps
  if (blueprint.maxCapitalPerMovementPercent <= 0 || blueprint.maxCapitalPerMovementPercent > 100) {
    errors.push('maxCapitalPerMovementPercent must be between 0 and 100');
  }

  // Max drawdown alert
  if (blueprint.maxDrawdownAlertPercent <= 0 || blueprint.maxDrawdownAlertPercent > 100) {
    errors.push('maxDrawdownAlertPercent must be between 0 and 100');
  }

  // Confidence score
  if (blueprint.confidenceScore < 0 || blueprint.confidenceScore > 100) {
    errors.push('Confidence score must be between 0 and 100');
  }

  // Validity
  if (blueprint.expiresAt <= blueprint.createdAt) {
    errors.push('Blueprint expiry must be after creation');
  }

  if (blueprint.aiReasoning.trim().length === 0) {
    errors.push('AI reasoning is required');
  }

  return errors;
}

function validateSection(section: GridSection, index: number, errors: string[]): void {
  const prefix = `Section ${index + 1}: `;

  // Grid count
  if (section.gridCount < 1) {
    errors.push(`${prefix}Grid count must be at least 1`);
  }

  // Grid distance
  if (section.gridDistancePercent <= 0) {
    errors.push(`${prefix}Grid distance must be greater than 0`);
  }

  // Section gap
  if (section.sectionGapPercent <= 0) {
    errors.push(`${prefix}Section gap must be greater than 0`);
  }

  // min_net_profit_percent
  if (section.minNetProfitPercent <= 0) {
    errors.push(`${prefix}min_net_profit_percent must be greater than 0`);
  }

  // Allocation
  if (section.allocationPercent <= 0) {
    errors.push(`${prefix}Allocation must be greater than 0`);
  }
}

// ============================================================
// Grid Level Estimation
// ============================================================

// Placeholder for grid level estimation.
// The Grid Engine owns the actual grid calculation.
// This is an estimate for validation purposes only.
function estimateLowestGridPrice(_pair: string, _section: GridSection): number {
  return 0;
}

// ============================================================
// Validity Window
// ============================================================

export function isBlueprintValid(blueprint: Blueprint, now: Date = new Date()): boolean {
  return now <= blueprint.expiresAt;
}
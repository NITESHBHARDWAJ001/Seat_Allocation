import type { SoftConstraintScore, ValidationReport } from '@exam-allocator/core';

/**
 * Thin, explicit wrapper around the validator's soft-constraint scores so a
 * high score can never be read as "hard constraints passed" (spec §39) — the
 * two are always reported side by side.
 */
export interface ScoreBreakdown {
  overallScore: number;
  hardConstraintsPassed: boolean;
  breakdown: SoftConstraintScore[];
}

export function scoreAllocation(report: ValidationReport): ScoreBreakdown {
  return {
    overallScore: report.overallScore,
    hardConstraintsPassed: report.allHardConstraintsPassed,
    breakdown: report.softConstraints,
  };
}

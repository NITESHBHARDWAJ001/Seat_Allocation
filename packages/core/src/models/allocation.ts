import type { RuleConfig } from './ruleConfig.js';
import type { Student } from './student.js';
import type { Room } from './room.js';
import type { ValidationReport } from './validation.js';

export interface Assignment {
  studentId: string;
  seatId: string;
  roomId: string;
}

export interface ManualOverride {
  studentId: string;
  seatId: string;
  previousSeatId?: string;
  at: string;
  forced: boolean;
}

export type AllocationStatus = 'success' | 'partial' | 'failed';

export interface FeasibilityIssue {
  code: string;
  message: string;
  suggestions: string[];
}

export interface FeasibilityReport {
  feasible: boolean;
  totalStudents: number;
  totalAvailableSeats: number;
  studentsByBranch: Record<string, number>;
  studentsByYear: Record<string, number>;
  studentsBySection: Record<string, number>;
  seatsByRoom: Record<string, number>;
  blockedSeats: number;
  issues: FeasibilityIssue[];
  ruleContradictions: string[];
}

export interface AllocationResult {
  id: string;
  examId: string;
  generatedAt: string;
  seed: number;
  algorithmVersion: string;
  configSnapshot: RuleConfig;
  studentSnapshot: Student[];
  roomSnapshot: Room[];
  assignments: Assignment[];
  manualOverrides: ManualOverride[];
  unallocatedStudentIds: string[];
  validationReport: ValidationReport;
  score: number;
  status: AllocationStatus;
  feasibility: FeasibilityReport;
  relaxedRules: string[];
  version: number;
  parentAllocationId?: string;
}

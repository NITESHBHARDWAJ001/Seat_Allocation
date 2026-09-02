export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ConflictType =
  | 'duplicate_seat'
  | 'duplicate_student'
  | 'blocked_seat_used'
  | 'capacity_exceeded'
  | 'room_not_selected'
  | 'missing_allocation'
  | 'strict_branch_requirement'
  | 'strict_room_requirement'
  | 'adjacency_branch'
  | 'adjacency_year'
  | 'adjacency_section'
  | 'adjacency_batch'
  | 'invalid_manual_seat';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  seatIds: string[];
  studentIds: string[];
  roomId?: string;
  description: string;
  suggestedResolution?: string;
}

export interface HardConstraintCheck {
  id: string;
  label: string;
  passed: boolean;
  details?: string;
}

export interface SoftConstraintScore {
  id: string;
  label: string;
  score: number; // 0-100
  details?: string;
}

export interface ValidationReport {
  generatedAt: string;
  totalStudents: number;
  allocatedStudents: number;
  hardConstraints: HardConstraintCheck[];
  softConstraints: SoftConstraintScore[];
  conflicts: Conflict[];
  allHardConstraintsPassed: boolean;
  overallScore: number;
}

import type { RuleConfig } from './ruleConfig.js';
import type { SubjectAssignment } from './subject.js';

export interface Exam {
  id: string;
  name: string;
  date: string; // ISO date
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  studentIds: string[];
  roomIds: string[];
  ruleConfig: RuleConfig;
  subjectAssignments: SubjectAssignment[];
  allocationIds: string[];
  activeAllocationId?: string;
  dutyRosterIds: string[];
  activeDutyRosterId?: string;
  createdAt: string;
  updatedAt: string;
}

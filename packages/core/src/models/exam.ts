import type { RuleConfig } from './ruleConfig.js';

export interface Exam {
  id: string;
  name: string;
  date: string; // ISO date
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  studentIds: string[];
  roomIds: string[];
  ruleConfig: RuleConfig;
  allocationIds: string[];
  activeAllocationId?: string;
  createdAt: string;
  updatedAt: string;
}

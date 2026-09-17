import { describe, expect, it } from 'vitest';
import { solveAllocation } from '../solver/solver.js';
import { makeRegularRoom, makeStudents, baseRuleConfig } from './helpers.js';

describe('room priority', () => {
  it('fills the lowest-priority-number (highest priority) room before spilling into the next one', () => {
    const roomHigh = makeRegularRoom('room-high', 2, 5, 1); // priority 1 = highest, 10 seats
    const roomLow = makeRegularRoom('room-low', 2, 5, 5); // priority 5 = lower, 10 seats
    const students = makeStudents(14, 'CSE', 'CSE');
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [] }; // isolate priority from the default same-branch adjacency rule

    const result = solveAllocation(students, [roomHigh, roomLow], ruleConfig, 1);

    const inHigh = result.assignments.filter((a) => a.roomId === 'room-high').length;
    const inLow = result.assignments.filter((a) => a.roomId === 'room-low').length;

    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(inHigh).toBe(10); // fully packed before spillover
    expect(inLow).toBe(4); // only the overflow lands in the lower-priority room
  });

  it('prefers the higher-priority room even when both have ample free capacity', () => {
    const roomHigh = makeRegularRoom('room-high', 4, 10, 1); // 40 seats, priority 1
    const roomLow = makeRegularRoom('room-low', 4, 10, 10); // 40 seats, priority 10
    const students = makeStudents(20, 'ECE', 'ECE');
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [] };

    const result = solveAllocation(students, [roomHigh, roomLow], ruleConfig, 7);

    const inHigh = result.assignments.filter((a) => a.roomId === 'room-high').length;
    const inLow = result.assignments.filter((a) => a.roomId === 'room-low').length;

    expect(inHigh).toBe(20);
    expect(inLow).toBe(0);
  });
});

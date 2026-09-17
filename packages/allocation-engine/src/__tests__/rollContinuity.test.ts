import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('roll number continuity', () => {
  it('keeps a roll-consecutive group entirely together in one room when set to strict, even under a spreading utilization strategy', () => {
    const roomA = makeRegularRoom('A', 4, 5, 1); // 20 seats, priority 1 - exactly enough for the whole group
    const roomB = makeRegularRoom('B', 3, 5, 2); // 15 seats, would normally attract some students under 'spread'
    const students = makeStudents(20, 'CSE', 'CSE');

    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.rollContinuity = { mode: 'strict', priority: 'high' };
    ruleConfig.utilizationStrategy = 'spread';

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    // 'strict' roll continuity is a hard constraint: once capacity allows
    // keeping the whole branch group in one room, it must not be split just
    // to satisfy the (softer) 'spread' utilization preference.
    expect(result.status).toBe('success');
    expect(result.validationReport.allHardConstraintsPassed).toBe(true);
    const continuityScore = result.validationReport.softConstraints.find((s) => s.id === 'roll_continuity')?.score ?? 0;
    expect(continuityScore).toBe(100);
    const roomIds = new Set(result.assignments.map((a) => a.roomId));
    expect(roomIds.size).toBe(1);
  });

  it('reports a genuine hard-constraint failure (not a hidden soft score) when strict continuity cannot be held', () => {
    const roomA = makeRegularRoom('A', 3, 5); // 15 seats - too small for the whole group of 20
    const roomB = makeRegularRoom('B', 3, 5); // 15 seats
    const students = makeStudents(20, 'CSE', 'CSE');

    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.rollContinuity = { mode: 'strict', priority: 'high' };

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    // Everyone still gets seated (never sacrifice seating just to hold the
    // room boundary) but the split is now an honest, visible hard-constraint
    // failure and a reported conflict - not silently absorbed into a score.
    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.status).toBe('partial');
    const strictCheck = result.validationReport.hardConstraints.find((c) => c.id === 'H_roll_continuity_strict');
    expect(strictCheck?.passed).toBe(false);
    expect(result.validationReport.conflicts.some((c) => c.type === 'roll_continuity_split')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

/**
 * Documents what rollContinuity.mode 'strict' means now: unlike 'preferred'
 * (a pure soft scoring nudge), 'strict' is a genuine hard preference - the
 * solver confines a branch group to one room once it starts there (falling
 * back only when that room truly has no legal seat left), and a violation
 * is reported as a real hard-constraint failure + conflict, not hidden
 * inside a soft score. This used to not be true (see git history): 'strict'
 * only raised the solver's scoring weight (500 vs 150) with no different
 * enforcement or reporting than 'preferred'.
 */
describe('rollContinuity.mode "strict" is a genuine hard preference', () => {
  it('is checked as its own hard constraint, independent from "Strict adjacency restrictions satisfied"', () => {
    const room = makeRegularRoom('A', 6, 10); // 60 seats
    const students = makeStudents(24, 'CSE', 'CSE');
    const ruleConfig = { ...baseRuleConfig(), rollContinuity: { mode: 'strict' as const, priority: 'high' as const } };

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    const hardConstraintIds = result.validationReport.hardConstraints.map((c) => c.id);
    expect(hardConstraintIds).toContain('H_roll_continuity_strict');
  });

  it('"preferred" mode is unaffected: still a pure soft nudge, no hard constraint added, splits allowed', () => {
    const roomA = makeRegularRoom('A', 3, 5); // 15 seats
    const roomB = makeRegularRoom('B', 3, 5); // 15 seats
    const students = makeStudents(24, 'CSE', 'CSE');
    const ruleConfig = {
      ...baseRuleConfig(),
      adjacencyRules: [],
      rollContinuity: { mode: 'preferred' as const, priority: 'medium' as const },
    };

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    expect(result.status).toBe('success');
    expect(result.validationReport.hardConstraints.map((c) => c.id)).not.toContain('H_roll_continuity_strict');
  });

  it('"strict" refuses to split the group across rooms even when capacity is tight enough that "preferred" would allow it', () => {
    // Capacity is deliberately short of the whole group (20 seats for 24
    // students) so *something* must spill into room B either way - the
    // question is whether 'strict' still holds the line for as many
    // students as legally possible versus 'preferred' spreading earlier.
    const roomA = makeRegularRoom('A', 4, 5, 1); // 20 seats, priority 1
    const roomB = makeRegularRoom('B', 4, 5, 2); // 20 seats
    const students = makeStudents(24, 'CSE', 'CSE');
    const noAdjacency = { adjacencyRules: [] };

    const strictConfig = { ...baseRuleConfig(), ...noAdjacency, rollContinuity: { mode: 'strict' as const, priority: 'high' as const } };
    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig: strictConfig, seed: 5 });

    const countByRoom = new Map<string, number>();
    for (const a of result.assignments) countByRoom.set(a.roomId, (countByRoom.get(a.roomId) ?? 0) + 1);

    // Room A must be filled to capacity before anyone spills into room B -
    // 'strict' keeps confining the group to its starting room right up to
    // the point where that room truly has no legal seat left.
    expect(countByRoom.get('A')).toBe(20);
    expect(countByRoom.get('B')).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('strict same-branch adjacency', () => {
  it('seats CSE-ECE-CSE in a 3-seat row, recovering via backtracking from a bad first placement', () => {
    const room = makeRegularRoom('R1', 1, 3);
    const students = [...makeStudents(2, 'CSE', 'CSE'), ...makeStudents(1, 'ECE', 'ECE')];
    const ruleConfig = baseRuleConfig(); // default: branch adjacency strict, horizontal+vertical

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('success');
    expect(result.assignments).toHaveLength(3);
    const strict = result.validationReport.hardConstraints.find((c) => c.id === 'H_adjacency_strict');
    expect(strict?.passed).toBe(true);
  });

  it('never violates strict adjacency even when it means some students stay unallocated', () => {
    // 2x2 grid, all 4 seats mutually h/v-adjacent in a cycle; all students share one branch,
    // so at most 2 (the diagonal pair) can legally be seated together.
    const room = makeRegularRoom('R1', 2, 2);
    const students = makeStudents(4, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    // Safety invariant: adjacency is never violated, no matter how placement is churned.
    const strict = result.validationReport.hardConstraints.find((c) => c.id === 'H_adjacency_strict');
    expect(strict?.passed).toBe(true);
    expect(result.assignments.length).toBeLessThanOrEqual(2);
    // H7 (every student seated) legitimately fails here since a 3rd/4th seat is
    // structurally impossible without an adjacency violation — that's why the
    // overall status is 'partial', not a bug in the solver.
    expect(result.status).toBe('partial');
  });

  it('allows same-branch adjacency when the rule is disabled', () => {
    const room = makeRegularRoom('R1', 2, 2);
    const students = makeStudents(4, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('success');
    expect(result.assignments).toHaveLength(4);
  });
});

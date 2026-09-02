import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { checkFeasibility } from '../diagnostics/feasibility.js';
import { detectRuleContradictions } from '@exam-allocator/core';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('feasibility pre-check', () => {
  it('reports an impossible dataset with an explanation instead of running the solver', () => {
    const room = makeRegularRoom('R1', 1, 5); // 5 seats
    const students = makeStudents(10, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();

    const report = checkFeasibility(students, [room], ruleConfig);
    expect(report.feasible).toBe(false);
    expect(report.totalStudents).toBe(10);
    expect(report.totalAvailableSeats).toBe(5);
    expect(report.issues.length).toBeGreaterThan(0);

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });
    expect(result.status).toBe('failed');
    expect(result.assignments).toHaveLength(0);
  });
});

describe('contradictory strict rules', () => {
  it('flags strict branch continuity + strict same-branch adjacency as contradictory', () => {
    const ruleConfig = baseRuleConfig();
    ruleConfig.branchContinuity = { mode: 'strict', priority: 'high' };
    ruleConfig.adjacencyRules = [
      { enabled: true, attribute: 'branch', horizontal: true, vertical: false, diagonal: false, mode: 'strict', priority: 'high' },
    ];

    const problems = detectRuleContradictions(ruleConfig);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('makes the engine fail fast (no solver run) when a contradiction is present, even with ample seats', () => {
    const room = makeRegularRoom('R1', 5, 20); // 100 seats, plenty of capacity
    const students = makeStudents(10, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.branchContinuity = { mode: 'strict', priority: 'high' };
    ruleConfig.adjacencyRules = [
      { enabled: true, attribute: 'branch', horizontal: true, vertical: true, diagonal: false, mode: 'strict', priority: 'high' },
    ];

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });
    expect(result.status).toBe('failed');
    expect(result.feasibility.ruleContradictions.length).toBeGreaterThan(0);
  });
});

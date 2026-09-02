import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

describe('roll number continuity', () => {
  it('keeps a roll-consecutive group mostly together across rooms when set to strict, even under a spreading utilization strategy', () => {
    const roomA = makeRegularRoom('A', 3, 5); // 15 seats
    const roomB = makeRegularRoom('B', 3, 5); // 15 seats
    const students = makeStudents(20, 'CSE', 'CSE');

    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.rollContinuity = { mode: 'strict', priority: 'high' };
    ruleConfig.utilizationStrategy = 'spread';

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    expect(result.status).toBe('success');
    const continuityScore = result.validationReport.softConstraints.find((s) => s.id === 'roll_continuity')?.score ?? 0;
    expect(continuityScore).toBeGreaterThanOrEqual(80);
  });
});

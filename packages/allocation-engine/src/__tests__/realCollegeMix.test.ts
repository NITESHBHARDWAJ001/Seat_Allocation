import { describe, expect, it } from 'vitest';
import { compareRollNumbers } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudent } from './helpers.js';

/** Sizes mirror the college's real 3rd + 7th semester lists (706 students, 6 branches x 2 years). */
const COHORTS: Array<[string, number, number]> = [
  ['AIML', 2, 38], ['CIVIL', 2, 70], ['CSE', 2, 111], ['ECE', 2, 70], ['ELEC', 2, 51], ['ME', 2, 71],
  ['ME', 4, 36], ['ELEC', 4, 34], ['CIVIL', 4, 63], ['CSE', 4, 106], ['ECE', 4, 22], ['AIML', 4, 34],
];

describe('real college mix: many branches, two years, strict continuity, minimum rooms', () => {
  const students = COHORTS.flatMap(([branch, year, n]) =>
    Array.from({ length: n }, (_, i) => makeStudent({ id: `${branch}${year}-${i + 1}`, rollNumber: `${year}${branch}${String(i + 1).padStart(3, '0')}`, branch, year }))
  );
  const rooms = [
    ...Array.from({ length: 11 }, (_, i) => makeRegularRoom(`LH${i + 1}`, 10, 6, i + 1)),
    ...Array.from({ length: 3 }, (_, i) => makeRegularRoom(`LHX${i + 1}`, 5, 8, 12)),
  ];
  const ruleConfig = { ...baseRuleConfig(), allocationMode: 'minimum-rooms' as const, rollContinuity: { mode: 'strict' as const, priority: 'critical' as const } };
  const result = generateAllocation({ examId: 'real', students, rooms, ruleConfig, seed: 7 });

  it('seats everyone and passes every hard constraint', () => {
    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.validationReport.allHardConstraintsPassed).toBe(true);
    expect(result.status).toBe('success');
  });

  it('uses close to the fewest rooms (all 780 seats needed for 706 students under adjacency)', () => {
    expect(result.roomSnapshot.length).toBeLessThanOrEqual(14);
  });

  it('keeps every branch+year in one unbroken roll range per room', () => {
    const roomOf = new Map(result.assignments.map((a) => [a.studentId, a.roomId]));
    for (const [branch, year] of COHORTS.map((c) => [c[0], c[1]] as const)) {
      const list = students.filter((s) => s.branch === branch && s.year === year).sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
      const seen = new Set<string>();
      let prev = '';
      for (const s of list) {
        const r = roomOf.get(s.id)!;
        if (r !== prev) {
          expect(seen.has(r)).toBe(false);
          seen.add(r);
          prev = r;
        }
      }
    }
  });
});

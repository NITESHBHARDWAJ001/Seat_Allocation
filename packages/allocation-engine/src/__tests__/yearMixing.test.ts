import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { baseRuleConfig, makeRegularRoom, makeStudent } from './helpers.js';

function buildStudents() {
  return [
    makeStudent({ id: 'y1-1', rollNumber: 'R1', branch: 'CSE', year: 1 }),
    makeStudent({ id: 'y2-1', rollNumber: 'R2', branch: 'CSE', year: 2 }),
    makeStudent({ id: 'y1-2', rollNumber: 'R3', branch: 'CSE', year: 1 }),
    makeStudent({ id: 'y2-2', rollNumber: 'R4', branch: 'CSE', year: 2 }),
  ];
}

describe('year mixing', () => {
  it('keeps each year roll sequence continuous on separate rows for vertical-only separation', () => {
    const students = [
      ...Array.from({ length: 4 }, (_, index) => makeStudent({ id: `y3-${index + 1}`, rollNumber: `24CSE00${index + 1}`, branch: 'CSE', year: 3 })),
      ...Array.from({ length: 4 }, (_, index) => makeStudent({ id: `y4-${index + 1}`, rollNumber: `23CSE00${index + 1}`, branch: 'CSE', year: 4 })),
    ];
    const result = generateAllocation({
      examId: 'vertical-years',
      students,
      rooms: [makeRegularRoom('A', 2, 4)],
      ruleConfig: {
        ...baseRuleConfig(),
        yearMixing: 'mixed',
        rollContinuity: { mode: 'strict', priority: 'critical' },
        adjacencyRules: [{ enabled: true, attribute: 'year', horizontal: false, vertical: true, diagonal: false, mode: 'strict', priority: 'high' }],
      },
    });

    const seatsById = new Map(result.roomSnapshot[0]!.seats.map((seat) => [seat.id, seat] as const));
    const positionsByStudent = new Map(result.assignments.map((assignment) => [assignment.studentId, seatsById.get(assignment.seatId)!] as const));
    expect(result.assignments).toHaveLength(8);
    expect(['y3-1', 'y3-2', 'y3-3', 'y3-4'].map((id) => positionsByStudent.get(id)!.row)).toEqual([1, 1, 1, 1]);
    expect(['y4-1', 'y4-2', 'y4-3', 'y4-4'].map((id) => positionsByStudent.get(id)!.row)).toEqual([2, 2, 2, 2]);
  });

  it('keeps rolls continuous down columns for horizontal-only separation', () => {
    const students = [
      ...Array.from({ length: 4 }, (_, index) => makeStudent({ id: `y3-${index + 1}`, rollNumber: `24CSE00${index + 1}`, branch: 'CSE', year: 3 })),
      ...Array.from({ length: 4 }, (_, index) => makeStudent({ id: `y4-${index + 1}`, rollNumber: `23CSE00${index + 1}`, branch: 'CSE', year: 4 })),
    ];
    const result = generateAllocation({
      examId: 'horizontal-years',
      students,
      rooms: [makeRegularRoom('A', 4, 2)],
      ruleConfig: {
        ...baseRuleConfig(),
        yearMixing: 'mixed',
        rollContinuity: { mode: 'strict', priority: 'critical' },
        adjacencyRules: [{ enabled: true, attribute: 'year', horizontal: true, vertical: false, diagonal: false, mode: 'strict', priority: 'high' }],
      },
    });

    const seatsById = new Map(result.roomSnapshot[0]!.seats.map((seat) => [seat.id, seat] as const));
    const positionsByStudent = new Map(result.assignments.map((assignment) => [assignment.studentId, seatsById.get(assignment.seatId)!] as const));
    expect(result.assignments).toHaveLength(8);
    expect(['y3-1', 'y3-2', 'y3-3', 'y3-4'].map((id) => positionsByStudent.get(id)!.col)).toEqual([1, 1, 1, 1]);
    expect(['y4-1', 'y4-2', 'y4-3', 'y4-4'].map((id) => positionsByStudent.get(id)!.col)).toEqual([2, 2, 2, 2]);
  });

  it('places one year at a time in year-wise mode', () => {
    const result = generateAllocation({
      examId: 'year-wise',
      students: buildStudents(),
      rooms: [makeRegularRoom('A', 1, 4)],
      ruleConfig: { ...baseRuleConfig(), adjacencyRules: [], rollContinuity: { mode: 'off', priority: 'low' }, yearMixing: 'year-wise' },
    });

    expect(result.assignments.map((assignment) => assignment.studentId)).toEqual(['y1-1', 'y1-2', 'y2-1', 'y2-2']);
  });

  it('round-robins years in mixed mode', () => {
    const result = generateAllocation({
      examId: 'mixed',
      students: buildStudents(),
      rooms: [makeRegularRoom('A', 1, 4)],
      ruleConfig: { ...baseRuleConfig(), adjacencyRules: [], rollContinuity: { mode: 'off', priority: 'low' }, yearMixing: 'mixed' },
    });

    expect(result.assignments.map((assignment) => assignment.studentId)).toEqual(['y1-1', 'y2-1', 'y1-2', 'y2-2']);
  });

  it('checkerboards years apart when both H and V are strict, preserving continuity as much as physically possible', () => {
    const students = [
      ...Array.from({ length: 6 }, (_, index) => makeStudent({ id: `y3-${index + 1}`, rollNumber: `24CSE00${index + 1}`, branch: 'CSE', year: 3 })),
      ...Array.from({ length: 6 }, (_, index) => makeStudent({ id: `y4-${index + 1}`, rollNumber: `23CSE00${index + 1}`, branch: 'CSE', year: 4 })),
    ];
    const result = generateAllocation({
      examId: 'checkerboard-years',
      students,
      rooms: [makeRegularRoom('A', 3, 4)], // 12 seats, exactly enough for both years
      ruleConfig: {
        ...baseRuleConfig(),
        yearMixing: 'mixed',
        rollContinuity: { mode: 'strict', priority: 'critical' },
        adjacencyRules: [{ enabled: true, attribute: 'year', horizontal: true, vertical: true, diagonal: false, mode: 'strict', priority: 'high' }],
      },
    });

    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.validationReport.hardConstraints.find((c) => c.id === 'H_adjacency_strict')?.passed).toBe(true);

    const seatsById = new Map(result.roomSnapshot[0]!.seats.map((seat) => [seat.id, seat] as const));
    const positions = new Map(result.assignments.map((a) => [a.studentId, seatsById.get(a.seatId)!] as const));

    // Checkerboard by (row+col) parity: no two same-year seats are ever
    // directly H or V adjacent, verified directly from physical coordinates.
    for (const a of result.assignments) {
      const studentA = students.find((s) => s.id === a.studentId)!;
      const seatA = positions.get(a.studentId)!;
      for (const b of result.assignments) {
        if (a.studentId === b.studentId) continue;
        const studentB = students.find((s) => s.id === b.studentId)!;
        if (studentA.year !== studentB.year) continue;
        const seatB = positions.get(b.studentId)!;
        const rowDiff = Math.abs(seatA.row - seatB.row);
        const colDiff = Math.abs(seatA.col - seatB.col);
        const directlyAdjacentHV = (rowDiff === 0 && colDiff === 1) || (colDiff === 0 && rowDiff === 1);
        expect(directlyAdjacentHV).toBe(false);
      }
    }

    // Continuity is preserved as much as physically possible: every
    // roll-consecutive same-year pair lands on the *same* checkerboard
    // parity class, i.e. the nearest legal cells (row-major among that class).
    const parity = (row: number, col: number) => (row + col) % 2;
    for (const group of [
      ['y3-1', 'y3-2', 'y3-3', 'y3-4', 'y3-5', 'y3-6'],
      ['y4-1', 'y4-2', 'y4-3', 'y4-4', 'y4-5', 'y4-6'],
    ]) {
      for (let i = 1; i < group.length; i++) {
        const prev = positions.get(group[i - 1]!)!;
        const curr = positions.get(group[i]!)!;
        expect(parity(curr.row, curr.col)).toBe(parity(prev.row, prev.col));
      }
    }
  });

  it('treats same-branch years as separate strict roll-continuity groups', () => {
    const students = [
      ...Array.from({ length: 6 }, (_, index) => makeStudent({ id: `y3-${index + 1}`, rollNumber: `24CSE00${index + 1}`, branch: 'CSE', year: 3 })),
      ...Array.from({ length: 6 }, (_, index) => makeStudent({ id: `y4-${index + 1}`, rollNumber: `23CSE00${index + 1}`, branch: 'CSE', year: 4 })),
    ];
    const result = generateAllocation({
      examId: 'same-branch-years',
      students,
      rooms: [makeRegularRoom('A', 3, 4), makeRegularRoom('B', 3, 4)],
      ruleConfig: {
        ...baseRuleConfig(),
        yearMixing: 'mixed',
        rollContinuity: { mode: 'strict', priority: 'critical' },
        adjacencyRules: [],
      },
    });

    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.validationReport.hardConstraints.find((constraint) => constraint.id === 'H_roll_continuity_strict')?.passed).toBe(true);
  });
});
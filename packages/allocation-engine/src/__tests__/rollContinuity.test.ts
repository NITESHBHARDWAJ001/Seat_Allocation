import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { validateAllocation } from '../validator/validator.js';
import { baseRuleConfig, makeRegularRoom, makeStudent, makeStudents } from './helpers.js';

describe('roll number continuity', () => {
  it('places strict roll numbers in natural order regardless of input order or seed', () => {
    const room = makeRegularRoom('A', 1, 6);
    const students = makeStudents(6, 'CSE', 'CSE').reverse();
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [], rollContinuity: { mode: 'strict' as const, priority: 'critical' as const } };

    const first = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig, seed: 1 });
    const second = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig, seed: 999 });

    expect(first.assignments.map((a) => a.studentId)).toEqual(['CSE-1', 'CSE-2', 'CSE-3', 'CSE-4', 'CSE-5', 'CSE-6']);
    expect(first.assignments).toEqual(second.assignments);
  });

  it('fills each row from its first seat instead of reversing the next row', () => {
    const room = makeRegularRoom('A', 3, 4);
    const students = makeStudents(12, 'CSE', 'CSE');
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [], rollContinuity: { mode: 'strict' as const, priority: 'critical' as const } };

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });
    const seatsById = new Map(room.seats.map((seat) => [seat.id, seat] as const));
    const positions = result.assignments.map((assignment) => {
      const seat = seatsById.get(assignment.seatId)!;
      return [seat.row, seat.col];
    });

    expect(positions).toEqual([
      [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 1], [2, 2], [2, 3], [2, 4],
      [3, 1], [3, 2], [3, 3], [3, 4],
    ]);
  });

  it('keeps roll order within each year while applying mixed year placement', () => {
    const room = makeRegularRoom('A', 1, 4);
    const students = [
      makeStudent({ id: 'y3-1', rollNumber: '24CSE001', branch: 'CSE', year: 3 }),
      makeStudent({ id: 'y4-1', rollNumber: '23CSE001', branch: 'CSE', year: 4 }),
      makeStudent({ id: 'y3-2', rollNumber: '24CSE002', branch: 'CSE', year: 3 }),
      makeStudent({ id: 'y4-2', rollNumber: '23CSE002', branch: 'CSE', year: 4 }),
    ];
    const ruleConfig = { ...baseRuleConfig(), adjacencyRules: [], yearMixing: 'mixed' as const, rollContinuity: { mode: 'strict' as const, priority: 'critical' as const } };

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(new Set(result.assignments.map((assignment) => assignment.studentId))).toEqual(new Set(['y3-1', 'y4-1', 'y3-2', 'y4-2']));
    expect(result.validationReport.hardConstraints.find((constraint) => constraint.id === 'H_roll_continuity_strict')?.passed).toBe(true);
  });

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

  it('accepts one unavoidable room boundary: each room holds one unbroken roll range', () => {
    const roomA = makeRegularRoom('A', 3, 5); // 15 seats - too small for the whole group of 20
    const roomB = makeRegularRoom('B', 3, 5);
    const students = makeStudents(20, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.rollContinuity = { mode: 'strict', priority: 'high' };

    const result = generateAllocation({ examId: 'e1', students, rooms: [roomA, roomB], ruleConfig });

    expect(result.unallocatedStudentIds).toHaveLength(0);
    expect(result.status).toBe('success');
    expect(result.validationReport.hardConstraints.find((c) => c.id === 'H_roll_continuity_strict')?.passed).toBe(true);
    const roomOf = new Map(result.assignments.map((x) => [x.studentId, x.roomId]));
    const seq = students.map((st) => roomOf.get(st.id));
    expect(seq.slice(0, 15).every((r) => r === seq[0])).toBe(true);
    expect(seq.slice(15).every((r) => r === seq[15])).toBe(true);
  });

  it('reports a genuine hard-constraint failure when a room is left and re-entered', () => {
    const roomA = makeRegularRoom('A', 1, 4);
    const roomB = makeRegularRoom('B', 1, 4);
    const students = makeStudents(4, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    ruleConfig.rollContinuity = { mode: 'strict', priority: 'high' };
    // roll order goes A, B, A, B - interleaved across rooms
    const seat = (room: typeof roomA, n: number) => room.seats[n]!.id;
    const assignments = [
      { studentId: 'CSE-1', roomId: 'A', seatId: seat(roomA, 0) },
      { studentId: 'CSE-2', roomId: 'B', seatId: seat(roomB, 0) },
      { studentId: 'CSE-3', roomId: 'A', seatId: seat(roomA, 1) },
      { studentId: 'CSE-4', roomId: 'B', seatId: seat(roomB, 1) },
    ];
    const report = validateAllocation(assignments, students, [roomA, roomB], ruleConfig);
    expect(report.hardConstraints.find((c) => c.id === 'H_roll_continuity_strict')?.passed).toBe(false);
    expect(report.conflicts.some((c) => c.type === 'roll_continuity_split')).toBe(true);
  });
});

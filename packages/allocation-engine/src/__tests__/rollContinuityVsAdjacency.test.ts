import { describe, expect, it } from 'vitest';
import { generateAllocation } from '../engine.js';
import { compareRollNumbers } from '@exam-allocator/core';
import { baseRuleConfig, makeRegularRoom, makeStudents } from './helpers.js';

/**
 * Roll continuity and the DEFAULT strict same-branch adjacency rule pull in
 * opposite directions by design: continuity wants roll-consecutive students
 * of the same branch seated near each other, while the default adjacency
 * rule forbids two same-branch students from sitting directly next to each
 * other (horizontally/vertically) - a real anti-cheating measure. When every
 * student shares one branch, literal seat-by-seat adjacency is therefore
 * impossible; the solver should still place roll-consecutive students at the
 * *nearest legal* seat (typically diagonal, or two seats away) rather than
 * scattering them randomly around the room.
 */
describe('roll continuity under the default same-branch adjacency rule', () => {
  it('seats roll-consecutive same-branch students at the nearest seat the adjacency rule still allows', () => {
    const room = makeRegularRoom('A', 6, 10); // 60 seats, single room so priority can't explain anything
    // With every student sharing one branch and H/V adjacency banned between
    // same-branch neighbors, the checkerboard-style max independent set on a
    // 6x10 grid is 30 seats - keep student count comfortably under that so
    // the run is a clean "success", not a capacity-driven partial.
    const students = makeStudents(24, 'CSE', 'CSE');
    const ruleConfig = baseRuleConfig(); // default: strict branch H/V adjacency + preferred roll continuity

    const result = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });

    expect(result.status).toBe('success');
    expect(result.unallocatedStudentIds).toHaveLength(0);

    const seatsById = new Map(result.roomSnapshot.flatMap((r) => r.seats.map((s) => [s.id, s] as const)));
    const rollSorted = [...students].sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
    const seatOf = new Map(result.assignments.map((a) => [a.studentId, seatsById.get(a.seatId)!] as const));

    const distances: number[] = [];
    for (let i = 1; i < rollSorted.length; i++) {
      const prevSeat = seatOf.get(rollSorted[i - 1]!.id)!;
      const seat = seatOf.get(rollSorted[i]!.id)!;
      const rowDiff = Math.abs(prevSeat.row - seat.row);
      const colDiff = Math.abs(prevSeat.col - seat.col);

      // The hard constraint must actually hold: never directly H/V adjacent.
      const directlyAdjacentHV = (rowDiff === 0 && colDiff === 1) || (colDiff === 0 && rowDiff === 1);
      expect(directlyAdjacentHV).toBe(false);

      distances.push(Math.sqrt(rowDiff * rowDiff + colDiff * colDiff));
    }

    // Nearest legal alternatives to direct H/V adjacency are diagonal
    // (~1.41) or two seats away in a line (2.0). If continuity were not
    // taking effect, consecutive roll numbers would land anywhere in a
    // 6x10 grid, averaging a much larger distance than this.
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    expect(avgDistance).toBeLessThanOrEqual(2.5);
  });
});

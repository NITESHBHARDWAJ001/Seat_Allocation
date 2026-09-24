import {
  compareRollNumbers,
  studentGroupKey,
  type AdjacencyRule,
  type Room,
  type RuleConfig,
  type Seat,
  type Student,
} from '@exam-allocator/core';
import { buildSeatReservations, type SeatReservations } from '../constraints/distribution.js';

export interface LanePlan {
  /** seatId -> studentId for every student this pass placed deterministically. */
  assignments: Map<string, string>;
  /** Students this pass could not place (fed back into the generic solver as a fallback). */
  unplaced: Student[];
}

/**
 * Deterministic placement for rollContinuity.mode === 'strict'.
 *
 * Root-cause replacement for the old approach of bolting roll continuity
 * onto the scoring/backtracking solver as another candidate-ranking
 * preference: continuity is a *placement rule*, not a scoring nudge, so it
 * is computed as an explicit physical layout up front, then applied. This
 * sidesteps the interaction bugs that scoring produced (e.g. seats scored
 * "nearest" without a room tiebreak silently round-robining students across
 * multiple identical rooms instead of filling one room's lane before the
 * next).
 *
 * Continuity groups are always `${branch}:${year}` (a roll sequence is only
 * meaningful within one branch+year cohort). Semantics:
 *
 * - No relevant separation rule: each continuity group fully occupies rooms
 *   in priority order, filling each room in plain row-major reading order
 *   (row ascending, then column ascending) before moving to the next room.
 *
 * - A strict, enabled adjacency rule whose attribute is 'year' or 'branch'
 *   (both always coincide with continuity-group boundaries) with exactly
 *   one of horizontal/vertical set: the room's ROWS (vertical-only) or
 *   COLUMNS (horizontal-only) are partitioned into as many lanes as there
 *   are distinct attribute values, assigned round-robin by index parity
 *   (`rowIndex % N` / `colIndex % N`). Each lane is filled in the group's
 *   natural reading direction: left-to-right within assigned rows for a
 *   row-lane (so same-year rolls stay consecutive *horizontally*), or
 *   top-to-bottom within assigned columns for a column-lane (rolls stay
 *   consecutive *vertically*). This guarantees no two same-attribute-value
 *   students ever land in directly adjacent rows (or columns), so the
 *   *other* direction is never separated as a side effect.
 *
 * - Both horizontal AND vertical set: lanes are the checkerboard parity
 *   `(row + col) % N` - for any N >= 2 every direct H/V neighbor of a cell
 *   has a different parity, so no two same-lane cells are ever H or V
 *   adjacent. Within a lane, cells are filled in row-major order, giving
 *   the best physically-possible continuity (nearest same-parity cell)
 *   given that true adjacency is forbidden in both directions.
 *
 * Any student this pass cannot legally place (room-branch/distribution
 * constraints excluded a cell, or a lane's rooms are at capacity) is
 * returned in `unplaced` for the generic backtracking solver to handle -
 * continuity is never worth leaving someone unseated over.
 */
export function planStrictContinuityLanes(students: Student[], rooms: Room[], ruleConfig: RuleConfig): LanePlan | null {
  if (ruleConfig.rollContinuity.mode !== 'strict') return null;

  const enabledRooms = rooms.filter((r) => r.enabled).slice().sort((a, b) => a.priority - b.priority);
  if (enabledRooms.length === 0) return null;

  const reservations = buildSeatReservations(enabledRooms, ruleConfig);

  const laneRule = ruleConfig.adjacencyRules.find(
    (r): r is AdjacencyRule =>
      r.enabled && r.mode === 'strict' && (r.attribute === 'year' || r.attribute === 'branch') && (r.horizontal || r.vertical)
  );

  // Continuity groups: branch+year, each roll-sorted.
  const continuityGroups = new Map<string, Student[]>();
  for (const s of students) {
    const key = `${s.branch}:${s.year}`;
    const list = continuityGroups.get(key) ?? [];
    list.push(s);
    continuityGroups.set(key, list);
  }
  for (const list of continuityGroups.values()) list.sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));

  // Lane per distinct attribute value. With 2+ values only TWO physical lanes (parity classes) are ever
  // needed: same-parity cells are never H/V adjacent, so any set of values sharing a parity can be filled
  // one after another without breaking the separation rule - and two lanes let every room be filled
  // completely (one lane per parity) instead of only 1/N of each room. Values are packed onto the two
  // lanes largest-first so both lanes hold about the same number of students.
  let laneIndexByValue: Map<string, number> | null = null;
  let laneCount = 1;
  if (laneRule) {
    const weight = new Map<string, number>();
    for (const s of students) {
      const v = studentGroupKey(s, laneRule.attribute);
      weight.set(v, (weight.get(v) ?? 0) + 1);
    }
    const values = [...weight.keys()].sort();
    if (values.length <= 1) {
      laneCount = 1;
      laneIndexByValue = new Map(values.map((v) => [v, 0]));
    } else {
      laneCount = 2;
      const load = [0, 0];
      laneIndexByValue = new Map();
      for (const v of values.slice().sort((a, b) => weight.get(b)! - weight.get(a)! || a.localeCompare(b))) {
        const lane = load[0]! <= load[1]! ? 0 : 1;
        laneIndexByValue.set(v, lane);
        load[lane]! += weight.get(v)!;
      }
    }
  }
  const laneOf = (student: Student): number => (laneIndexByValue ? laneIndexByValue.get(studentGroupKey(student, laneRule!.attribute)) ?? 0 : 0);

  const mode: 'none' | 'rows' | 'cols' | 'checker' = !laneRule
    ? 'none'
    : laneRule.horizontal && laneRule.vertical
      ? 'checker'
      : laneRule.vertical
        ? 'rows'
        : 'cols';

  /** Cells of one room belonging to a given lane, in that lane's fill order. */
  function laneCells(room: Room, lane: number): Seat[] {
    const seats = room.seats.filter((s) => s.available && !s.blocked);
    if (mode === 'none') {
      return seats.slice().sort((a, b) => a.row - b.row || a.col - b.col);
    }
    if (mode === 'rows') {
      return seats
        .filter((s) => ((s.row - 1) % laneCount + laneCount) % laneCount === lane)
        .sort((a, b) => a.row - b.row || a.col - b.col);
    }
    if (mode === 'cols') {
      return seats
        .filter((s) => ((s.col - 1) % laneCount + laneCount) % laneCount === lane)
        .sort((a, b) => a.col - b.col || a.row - b.row);
    }
    // checker: (row+col) parity class - every direct H/V neighbor differs in class for any laneCount >= 2.
    return seats
      .filter((s) => ((s.row + s.col) % laneCount + laneCount) % laneCount === lane)
      .sort((a, b) => a.row - b.row || a.col - b.col);
  }

  function seatLegalFor(seat: Seat, room: Room, student: Student, reservations: SeatReservations): boolean {
    const allow = reservations.roomAllowList.get(room.id);
    if (allow && !allow.has(student.branch)) return false;
    const reservedFor = reservations.reservedBranchBySeat.get(seat.id);
    if (reservedFor && reservedFor !== student.branch) return false;
    return true;
  }

  // Group continuity-groups by lane (multiple branches sharing one year, for
  // example, share a lane; each keeps its own students internally
  // roll-consecutive by processing continuity groups in a stable order).
  const groupKeysByLane = new Map<number, string[]>();
  for (const key of continuityGroups.keys()) {
    const [, yearStr] = key.split(':');
    const representative = continuityGroups.get(key)![0]!;
    const lane = laneOf(representative);
    void yearStr;
    const list = groupKeysByLane.get(lane) ?? [];
    list.push(key);
    groupKeysByLane.set(lane, list);
  }
  for (const list of groupKeysByLane.values()) list.sort();

  const assignments = new Map<string, string>();
  const usedSeats = new Set<string>();
  const unplaced: Student[] = [];

  for (let lane = 0; lane < laneCount; lane++) {
    const groupKeys = groupKeysByLane.get(lane) ?? [];
    // Flat, ordered pool of this lane's free cells across every room in priority order.
    const pool: Array<{ seat: Seat; room: Room }> = [];
    for (const room of enabledRooms) {
      for (const seat of laneCells(room, lane)) pool.push({ seat, room });
    }

    let cursor = 0;
    for (const groupKey of groupKeys) {
      const groupStudents = continuityGroups.get(groupKey)!;
      for (const student of groupStudents) {
        let placed = false;
        while (cursor < pool.length) {
          const { seat, room } = pool[cursor]!;
          cursor++;
          if (usedSeats.has(seat.id)) continue;
          if (!seatLegalFor(seat, room, student, reservations)) continue;
          assignments.set(seat.id, student.id);
          usedSeats.add(seat.id);
          placed = true;
          break;
        }
        if (!placed) unplaced.push(student);
      }
    }
  }

  return { assignments, unplaced };
}

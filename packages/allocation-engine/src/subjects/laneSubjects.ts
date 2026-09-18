import type { AdjacencyRule, Assignment, Room, Student, SubjectAssignment } from '@exam-allocator/core';
import { resolveSubjectForGroup } from './subjectAssignment.js';

/**
 * Post-allocation labelling only: reads a finished allocation and reports
 * which subject belongs to each row / column / seat. It never feeds back
 * into placement, so seating, roll continuity, year mixing and adjacency
 * behave exactly as before.
 */
export type SeparationDirection = 'row' | 'column' | 'seat' | 'none';

/**
 * Same rule the lane planner keys on: the first enabled strict adjacency
 * rule on year/branch with H and/or V set.
 *   V only -> 'row'    (each row is one branch+year lane)
 *   H only -> 'column' (each column is one branch+year lane)
 *   H + V  -> 'seat'   (checkerboard: label every seat individually)
 */
export function detectSeparationDirection(rules: AdjacencyRule[]): SeparationDirection {
  const rule = rules.find(
    (r) => r.enabled && r.mode === 'strict' && (r.attribute === 'year' || r.attribute === 'branch') && (r.horizontal || r.vertical)
  );
  if (!rule) return 'none';
  if (rule.horizontal && rule.vertical) return 'seat';
  return rule.vertical ? 'row' : 'column';
}

export interface LaneGroupLabel {
  groupKey: string; // `${branch}:${year}`
  branch: string;
  year: number;
  /** undefined when no subject is assigned to this branch+year. */
  subjectName?: string;
  subjectCode?: string;
  studentCount: number;
}

export interface LaneSubjectLabel {
  /** 1-based row number (direction 'row') or column number (direction 'column'). */
  index: number;
  /** Every distinct branch+year seated in this lane, in reading order (first occupied seat first). */
  groups: LaneGroupLabel[];
  /** True when the lane holds more than one branch+year - never blindly labelled with the first student's subject. */
  mixed: boolean;
}

export interface RoomLaneSubjects {
  direction: SeparationDirection;
  /** Populated for 'row' and 'column'. Only lanes with at least one occupied seat appear. */
  lanes: LaneSubjectLabel[];
  /** Populated for 'seat': seatId -> that occupant's own branch+year label. */
  seats: Record<string, LaneGroupLabel>;
}

export function computeRoomLaneSubjects(params: {
  room: Room;
  assignments: Assignment[];
  students: Student[];
  subjectAssignments: SubjectAssignment[];
  adjacencyRules: AdjacencyRule[];
}): RoomLaneSubjects {
  const { room, assignments, students, subjectAssignments, adjacencyRules } = params;
  const direction = detectSeparationDirection(adjacencyRules);
  const empty: RoomLaneSubjects = { direction, lanes: [], seats: {} };
  if (direction === 'none') return empty;

  const studentsById = new Map(students.map((s) => [s.id, s]));
  const seatsById = new Map(room.seats.map((s) => [s.id, s]));

  const occupied = assignments
    .filter((a) => a.roomId === room.id)
    .map((a) => ({ seat: seatsById.get(a.seatId), student: studentsById.get(a.studentId) }))
    .filter((o): o is { seat: NonNullable<typeof o.seat>; student: NonNullable<typeof o.student> } => !!o.seat && !!o.student)
    .sort((a, b) => a.seat.row - b.seat.row || a.seat.col - b.seat.col);

  const labelFor = (student: Student, count: number): LaneGroupLabel => {
    const subject = resolveSubjectForGroup(student.branch, student.year, subjectAssignments);
    return {
      groupKey: `${student.branch}:${student.year}`,
      branch: student.branch,
      year: student.year,
      subjectName: subject?.subjectName,
      subjectCode: subject?.subjectCode,
      studentCount: count,
    };
  };

  if (direction === 'seat') {
    const seats: Record<string, LaneGroupLabel> = {};
    for (const { seat, student } of occupied) seats[seat.id] = labelFor(student, 1);
    return { direction, lanes: [], seats };
  }

  const laneIndexOf = (seat: { row: number; col: number }) => (direction === 'row' ? seat.row : seat.col);
  const byLane = new Map<number, typeof occupied>();
  for (const o of occupied) {
    const idx = laneIndexOf(o.seat);
    const list = byLane.get(idx) ?? [];
    list.push(o);
    byLane.set(idx, list);
  }

  const lanes: LaneSubjectLabel[] = [...byLane.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, members]) => {
      // Column lanes read top-to-bottom, row lanes left-to-right; `occupied`
      // is already row-major so re-sort column lanes by row for "first seat".
      const ordered = direction === 'column' ? members.slice().sort((a, b) => a.seat.row - b.seat.row) : members;
      const counts = new Map<string, { student: Student; count: number }>();
      for (const { student } of ordered) {
        const key = `${student.branch}:${student.year}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { student, count: 1 });
      }
      const groups = [...counts.values()].map(({ student, count }) => labelFor(student, count));
      return { index, groups, mixed: groups.length > 1 };
    });

  return { direction, lanes, seats: {} };
}

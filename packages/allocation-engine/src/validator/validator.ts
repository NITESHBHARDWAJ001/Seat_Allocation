import {
  compareRollNumbers,
  studentGroupKey,
  type Assignment,
  type Conflict,
  type HardConstraintCheck,
  type Room,
  type RuleConfig,
  type Seat,
  type SoftConstraintScore,
  type Student,
  type ValidationReport,
} from '@exam-allocator/core';
import { buildSeatGraphs } from '../graph/seatGraph.js';
import { buildSeatReservations } from '../constraints/distribution.js';
import { findAdjacencyViolations } from '../constraints/adjacency.js';
import { groupStudents } from '../heuristics/grouping.js';
import { makeConflict, suggestAdjacencyResolution } from '../diagnostics/conflictAnalyzer.js';

/**
 * Fully independent re-check of an allocation result against every hard and
 * soft rule. Never trusts the solver's own bookkeeping — recomputes
 * everything from `assignments` + the raw student/room data, which is what
 * makes this the single authoritative source of truth used after solve,
 * after manual overrides, and after incremental edits.
 */
export function validateAllocation(
  assignments: Assignment[],
  students: Student[],
  rooms: Room[],
  ruleConfig: RuleConfig
): ValidationReport {
  const hardConstraints: HardConstraintCheck[] = [];
  const conflicts: Conflict[] = [];

  const studentsById = new Map(students.map((s) => [s.id, s]));
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const seatsById = new Map<string, Seat>();
  for (const room of rooms) for (const seat of room.seats) seatsById.set(seat.id, seat);
  const eligibleRoomIds = new Set(rooms.map((r) => r.id));

  // H1/H6 — each student at most once
  const seenStudents = new Map<string, number>();
  for (const a of assignments) seenStudents.set(a.studentId, (seenStudents.get(a.studentId) ?? 0) + 1);
  const dupStudents = [...seenStudents.entries()].filter(([, n]) => n > 1);
  hardConstraints.push({
    id: 'H1_H6_one_seat_per_student',
    label: 'Each student has at most one seat',
    passed: dupStudents.length === 0,
    details: dupStudents.length ? `${dupStudents.length} student(s) assigned more than once.` : undefined,
  });
  for (const [studentId] of dupStudents) {
    const seatIds = assignments.filter((a) => a.studentId === studentId).map((a) => a.seatId);
    conflicts.push(
      makeConflict({
        type: 'duplicate_student',
        severity: 'critical',
        seatIds,
        studentIds: [studentId],
        description: `Student ${studentId} is assigned to ${seatIds.length} seats.`,
        suggestedResolution: 'Remove the extra assignment(s) for this student.',
      })
    );
  }

  // H2 — each seat at most once
  const seenSeats = new Map<string, string[]>();
  for (const a of assignments) {
    const list = seenSeats.get(a.seatId) ?? [];
    list.push(a.studentId);
    seenSeats.set(a.seatId, list);
  }
  const dupSeats = [...seenSeats.entries()].filter(([, s]) => s.length > 1);
  hardConstraints.push({
    id: 'H2_one_student_per_seat',
    label: 'Each seat holds at most one student',
    passed: dupSeats.length === 0,
    details: dupSeats.length ? `${dupSeats.length} seat(s) double-booked.` : undefined,
  });
  for (const [seatId, studentIds] of dupSeats) {
    conflicts.push(
      makeConflict({
        type: 'duplicate_seat',
        severity: 'critical',
        seatIds: [seatId],
        studentIds,
        roomId: seatsById.get(seatId)?.roomId,
        description: `Seat ${seatId} has ${studentIds.length} students assigned to it.`,
        suggestedResolution: 'Move all but one student to a different free seat.',
      })
    );
  }

  // H3/H5 — only available, selected-room seats used
  const illegalSeatAssignments = assignments.filter((a) => {
    const seat = seatsById.get(a.seatId);
    if (!seat) return true;
    if (!eligibleRoomIds.has(a.roomId)) return true;
    if (seat.blocked || !seat.available) return true;
    const room = roomsById.get(a.roomId);
    if (!room || !room.enabled) return true;
    return false;
  });
  hardConstraints.push({
    id: 'H3_H5_legal_seats_only',
    label: 'Only available seats in selected, enabled rooms are used',
    passed: illegalSeatAssignments.length === 0,
    details: illegalSeatAssignments.length ? `${illegalSeatAssignments.length} assignment(s) use a blocked/unavailable/unselected seat.` : undefined,
  });
  for (const a of illegalSeatAssignments) {
    conflicts.push(
      makeConflict({
        type: 'blocked_seat_used',
        severity: 'critical',
        seatIds: [a.seatId],
        studentIds: [a.studentId],
        roomId: a.roomId,
        description: `Seat ${a.seatId} is blocked, unavailable, or not part of the exam's selected/enabled rooms.`,
        suggestedResolution: 'Reassign this student to a free, unblocked seat in a selected room.',
      })
    );
  }

  // H4 — room capacity
  const countByRoom = new Map<string, number>();
  for (const a of assignments) countByRoom.set(a.roomId, (countByRoom.get(a.roomId) ?? 0) + 1);
  const overCapacity: string[] = [];
  for (const [roomId, count] of countByRoom) {
    const room = roomsById.get(roomId);
    if (!room) continue;
    const capacity = room.seats.filter((s) => !s.blocked && s.available).length;
    if (count > capacity) overCapacity.push(roomId);
  }
  hardConstraints.push({
    id: 'H4_room_capacity',
    label: 'No room exceeds its available capacity',
    passed: overCapacity.length === 0,
    details: overCapacity.length ? `${overCapacity.length} room(s) over capacity.` : undefined,
  });

  // H7 — every requested student has a seat (informational count; success/partial status decided by caller)
  const requestedIds = new Set(students.map((s) => s.id));
  const allocatedIds = new Set(assignments.map((a) => a.studentId));
  const missing = [...requestedIds].filter((id) => !allocatedIds.has(id));
  hardConstraints.push({
    id: 'H7_no_missing_allocation',
    label: 'Every selected student has a seat',
    passed: missing.length === 0,
    details: missing.length ? `${missing.length} student(s) unallocated.` : undefined,
  });

  // H8 — strict distribution counts
  const reservations = buildSeatReservations(rooms, ruleConfig);
  const strictEntries = ruleConfig.distribution.filter((d) => d.mode === 'strict' && d.count !== undefined);
  let h8Passed = true;
  for (const entry of strictEntries) {
    const room = roomsById.get(entry.roomId);
    if (!room) continue;
    const actual = assignments.filter((a) => a.roomId === entry.roomId && studentsById.get(a.studentId)?.branch === entry.branch).length;
    const totalOfBranch = students.filter((s) => s.branch === entry.branch).length;
    const target = Math.min(entry.count ?? 0, totalOfBranch);
    if (actual < target) {
      h8Passed = false;
      conflicts.push(
        makeConflict({
          type: 'strict_branch_requirement',
          severity: 'high',
          seatIds: [],
          studentIds: [],
          roomId: entry.roomId,
          description: `Room "${room.name}" required ${target} ${entry.branch} students but only ${actual} were seated there.`,
          suggestedResolution: 'Increase available seats in this room, or relax the requirement to PREFERRED.',
        })
      );
    }
  }
  hardConstraints.push({
    id: 'H8_strict_branch_distribution',
    label: 'Strict room/branch distribution requirements satisfied',
    passed: h8Passed,
  });

  // H9 — strict room-branch allow-list
  let h9Passed = true;
  for (const a of assignments) {
    const allow = reservations.roomAllowList.get(a.roomId);
    if (!allow) continue;
    const student = studentsById.get(a.studentId);
    if (student && !allow.has(student.branch)) {
      h9Passed = false;
      conflicts.push(
        makeConflict({
          type: 'strict_room_requirement',
          severity: 'high',
          seatIds: [a.seatId],
          studentIds: [a.studentId],
          roomId: a.roomId,
          description: `Student ${student.rollNumber} (${student.branch}) is seated in a room restricted to [${[...allow].join(', ')}].`,
          suggestedResolution: 'Move this student to a room that allows their branch.',
        })
      );
    }
  }
  hardConstraints.push({
    id: 'H9_strict_room_branch_requirement',
    label: 'Strict room branch requirements satisfied',
    passed: h9Passed,
  });

  // Adjacency — strict rules are hard constraints, preferred rules are scored softly
  const graphs = buildSeatGraphs(rooms);
  const seatOccupant = new Map<string, Student>();
  for (const a of assignments) {
    const student = studentsById.get(a.studentId);
    if (student) seatOccupant.set(a.seatId, student);
  }
  const realOccupantOf = (seatId: string) => seatOccupant.get(seatId);

  let strictAdjacencyPassed = true;
  const softAdjacencyCounts = new Map<string, { violations: number; pairs: number }>();

  for (const a of assignments) {
    const seat = seatsById.get(a.seatId);
    const student = studentsById.get(a.studentId);
    if (!seat || !student) continue;
    const graph = graphs.get(a.roomId);
    if (!graph) continue;
    const violations = findAdjacencyViolations(seat, student, graph, realOccupantOf, ruleConfig.adjacencyRules);
    for (const v of violations) {
      const key = `${v.rule.attribute}:${v.direction}`;
      const stat = softAdjacencyCounts.get(key) ?? { violations: 0, pairs: 0 };
      stat.violations += 1;
      softAdjacencyCounts.set(key, stat);
      if (v.rule.mode === 'strict') {
        strictAdjacencyPassed = false;
        conflicts.push(
          makeConflict({
            type: `adjacency_${v.rule.attribute}` as Conflict['type'],
            severity: 'high',
            seatIds: [seat.id, v.neighborSeatId],
            studentIds: [student.id, v.neighborStudentId],
            roomId: a.roomId,
            description: `Students in seats ${seat.id} and ${v.neighborSeatId} share the same ${v.rule.attribute} (${studentGroupKey(student, v.rule.attribute)}) and are ${v.direction}ly adjacent.`,
            suggestedResolution: suggestAdjacencyResolution(),
          })
        );
      }
    }
  }
  hardConstraints.push({
    id: 'H_adjacency_strict',
    label: 'Strict adjacency restrictions satisfied',
    passed: strictAdjacencyPassed,
  });

  // Roll continuity is scoped to a branch+year cohort. Different years in the
  // same branch are intentionally separate continuity sequences.
  // 'preferred' stays purely a soft nudge (scored below, never gates here).
  if (ruleConfig.rollContinuity.mode === 'strict') {
    const seatByStudent = new Map(assignments.map((a) => [a.studentId, a] as const));
    let rollContinuityStrictPassed = true;
    const continuityGroups = new Map<string, Student[]>();
    for (const student of students) {
      const key = `${student.branch}:${student.year}`;
      const group = continuityGroups.get(key) ?? [];
      group.push(student);
      continuityGroups.set(key, group);
    }
    for (const group of continuityGroups.values()) {
      const sorted = group.slice().sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
      // A cohort bigger than one room (or sharing rooms with other cohorts) must span several rooms, so a
      // boundary between two rooms is unavoidable. What strict continuity forbids is a room being LEFT and
      // then RE-ENTERED: each room must hold one unbroken roll range of the cohort.
      const leftRooms = new Set<string>();
      let prev: { student: Student; roomId: string; seatId: string } | null = null;
      for (const student of sorted) {
        const a = seatByStudent.get(student.id);
        if (!a) continue; // an unallocated student is already reported elsewhere
        if (prev && prev.roomId !== a.roomId) {
          leftRooms.add(prev.roomId);
          if (leftRooms.has(a.roomId)) {
            rollContinuityStrictPassed = false;
            conflicts.push(
              makeConflict({
                type: 'roll_continuity_split',
                severity: 'medium',
                seatIds: [prev.seatId, a.seatId],
                studentIds: [prev.student.id, student.id],
                description: `Roll order of ${student.branch} Year ${student.year} leaves and later returns to the same room (${prev.student.rollNumber} -> ${student.rollNumber}), breaking strict roll continuity.`,
                suggestedResolution: "Keep each room's share of this cohort as one unbroken roll range.",
              })
            );
          }
        }
        prev = { student, roomId: a.roomId, seatId: a.seatId };
      }
    }
    hardConstraints.push({
      id: 'H_roll_continuity_strict',
      label: 'Strict roll continuity satisfied (each room holds one unbroken roll range per branch/year)',
      passed: rollContinuityStrictPassed,
    });
  }

  const allHardConstraintsPassed = hardConstraints.every((c) => c.passed);

  // --- Soft scoring ---
  const softConstraints: SoftConstraintScore[] = [];

  for (const rule of ruleConfig.adjacencyRules) {
    if (!rule.enabled || rule.mode !== 'preferred') continue;
    let violations = 0;
    let checkedPairs = 0;
    for (const a of assignments) {
      const seat = seatsById.get(a.seatId);
      const student = studentsById.get(a.studentId);
      if (!seat || !student) continue;
      const graph = graphs.get(a.roomId);
      if (!graph) continue;
      const v = findAdjacencyViolations(seat, student, graph, realOccupantOf, [rule]);
      checkedPairs += 1;
      violations += v.length;
    }
    const score = checkedPairs === 0 ? 100 : Math.max(0, 100 - (violations / checkedPairs) * 100);
    softConstraints.push({
      id: `adjacency_preferred_${rule.attribute}`,
      label: `${rule.attribute} adjacency preference`,
      score: Math.round(score),
    });
  }

  // Roll continuity score: fraction of roll-consecutive same-branch pairs seated in the same room.
  if (ruleConfig.rollContinuity.mode !== 'off') {
    const continuityGroups = new Map<string, Student[]>();
    for (const student of students) {
      const key = `${student.branch}:${student.year}`;
      const group = continuityGroups.get(key) ?? [];
      group.push(student);
      continuityGroups.set(key, group);
    }
    let total = 0;
    let together = 0;
    const seatByStudent = new Map(assignments.map((a) => [a.studentId, a.roomId] as const));
    for (const group of continuityGroups.values()) {
      const sorted = group.slice().sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
      for (let i = 0; i < sorted.length - 1; i++) {
        const s1 = sorted[i]!;
        const s2 = sorted[i + 1]!;
        const r1 = seatByStudent.get(s1.id);
        const r2 = seatByStudent.get(s2.id);
        if (r1 === undefined || r2 === undefined) continue;
        total += 1;
        if (r1 === r2) together += 1;
      }
    }
    const score = total === 0 ? 100 : Math.round((together / total) * 100);
    softConstraints.push({ id: 'roll_continuity', label: 'Roll number continuity', score });
  }

  // Branch balancing score: how evenly each branch is spread across used rooms relative to room capacity share.
  {
    const usedRooms = rooms.filter((r) => (countByRoom.get(r.id) ?? 0) > 0);
    if (usedRooms.length > 1) {
      const branches = [...new Set(students.map((s) => s.branch))];
      let deviations = 0;
      let samples = 0;
      const totalCapacity = usedRooms.reduce((sum, r) => sum + r.seats.filter((s) => !s.blocked && s.available).length, 0);
      for (const branch of branches) {
        const branchTotal = assignments.filter((a) => studentsById.get(a.studentId)?.branch === branch).length;
        if (branchTotal === 0) continue;
        for (const room of usedRooms) {
          const roomCapacity = room.seats.filter((s) => !s.blocked && s.available).length;
          const expectedShare = totalCapacity === 0 ? 0 : (roomCapacity / totalCapacity) * branchTotal;
          const actual = assignments.filter((a) => a.roomId === room.id && studentsById.get(a.studentId)?.branch === branch).length;
          deviations += Math.abs(actual - expectedShare);
          samples += Math.max(1, expectedShare);
        }
      }
      const score = samples === 0 ? 100 : Math.max(0, 100 - (deviations / samples) * 100);
      softConstraints.push({ id: 'branch_balancing', label: 'Branch distribution balance', score: Math.round(score) });
    }
  }

  // Room utilization score relative to configured strategy.
  {
    const usedRooms = rooms.filter((r) => r.enabled);
    if (usedRooms.length > 0) {
      const fills = usedRooms.map((r) => {
        const capacity = r.seats.filter((s) => !s.blocked && s.available).length;
        const filled = countByRoom.get(r.id) ?? 0;
        return capacity === 0 ? 0 : filled / capacity;
      });
      const active = fills.filter((f) => f > 0);
      let score = 100;
      if (ruleConfig.utilizationStrategy === 'compact' && active.length > 0) {
        const avg = active.reduce((a, b) => a + b, 0) / active.length;
        score = Math.round(avg * 100);
      } else if (ruleConfig.utilizationStrategy === 'spread' && fills.length > 0) {
        const mean = fills.reduce((a, b) => a + b, 0) / fills.length;
        const variance = fills.reduce((a, b) => a + (b - mean) ** 2, 0) / fills.length;
        score = Math.round(Math.max(0, 100 - Math.sqrt(variance) * 150));
      }
      softConstraints.push({ id: 'room_utilization', label: 'Room utilization vs. strategy', score });
    }
  }

  const overallScore =
    softConstraints.length === 0
      ? 100
      : Math.round(softConstraints.reduce((sum, s) => sum + s.score, 0) / softConstraints.length);

  return {
    generatedAt: new Date().toISOString(),
    totalStudents: students.length,
    allocatedStudents: allocatedIds.size,
    hardConstraints,
    softConstraints,
    conflicts,
    allHardConstraintsPassed,
    overallScore,
  };
}

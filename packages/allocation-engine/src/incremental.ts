import type { AllocationResult, Assignment, Conflict, Room, RuleConfig, Seat, Student } from '@exam-allocator/core';
import { buildSeatGraphs, type SeatGraph } from './graph/seatGraph.js';
import { buildSeatReservations, type SeatReservations } from './constraints/distribution.js';
import { findAdjacencyViolations, hasHardAdjacencyViolation, softAdjacencyPenalty } from './constraints/adjacency.js';
import { validateAllocation } from './validator/validator.js';

/**
 * Incremental operations (spec §27/§28): student add/remove and room
 * enable/disable operate on an *existing* AllocationResult, preserving
 * unaffected assignments instead of forcing a full regenerate. A full
 * regenerate (engine.generateAllocation) always remains available/explicit.
 */

function buildOccupancy(assignments: Assignment[], studentsById: Map<string, Student>) {
  const seatOccupant = new Map<string, Student>();
  for (const a of assignments) {
    const student = studentsById.get(a.studentId);
    if (student) seatOccupant.set(a.seatId, student);
  }
  return seatOccupant;
}

function findSeatForStudent(
  student: Student,
  occupantOf: (seatId: string) => Student | undefined,
  rooms: Room[],
  ruleConfig: RuleConfig,
  reservations: SeatReservations,
  graphs: Map<string, SeatGraph>
): Seat | null {
  let best: { seat: Seat; score: number } | null = null;
  for (const room of rooms) {
    if (!room.enabled) continue;
    const allow = reservations.roomAllowList.get(room.id);
    if (allow && !allow.has(student.branch)) continue;
    const graph = graphs.get(room.id);
    if (!graph) continue;
    for (const seat of room.seats) {
      if (seat.blocked || !seat.available || occupantOf(seat.id)) continue;
      const reservedFor = reservations.reservedBranchBySeat.get(seat.id);
      if (reservedFor && reservedFor !== student.branch) continue;
      const violations = findAdjacencyViolations(seat, student, graph, occupantOf, ruleConfig.adjacencyRules);
      if (hasHardAdjacencyViolation(violations)) continue;
      const penalty = softAdjacencyPenalty(violations);
      const score = (1000 - room.priority) - penalty * 1000;
      if (!best || score > best.score) best = { seat, score };
    }
  }
  return best?.seat ?? null;
}

export interface AddStudentResult {
  updated: AllocationResult;
  seated: boolean;
}

export function addStudentToAllocation(result: AllocationResult, student: Student): AddStudentResult {
  const rooms = result.roomSnapshot;
  const students = [...result.studentSnapshot, student];
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const occupancy = buildOccupancy(result.assignments, studentsById);
  const occupantOf = (seatId: string) => occupancy.get(seatId);
  const reservations = buildSeatReservations(rooms, result.configSnapshot);
  const graphs = buildSeatGraphs(rooms);

  const seat = findSeatForStudent(student, occupantOf, rooms, result.configSnapshot, reservations, graphs);
  const assignments = result.assignments.slice();
  const unallocatedStudentIds = result.unallocatedStudentIds.slice();

  if (seat) {
    assignments.push({ studentId: student.id, seatId: seat.id, roomId: seat.roomId });
  } else {
    unallocatedStudentIds.push(student.id);
  }

  const validationReport = validateAllocation(assignments, students, rooms, result.configSnapshot);
  const updated: AllocationResult = {
    ...result,
    studentSnapshot: students,
    assignments,
    unallocatedStudentIds,
    validationReport,
    score: validationReport.overallScore,
    status: unallocatedStudentIds.length > 0 || !validationReport.allHardConstraintsPassed ? 'partial' : 'success',
  };

  return { updated, seated: !!seat };
}

export function removeStudentFromAllocation(result: AllocationResult, studentId: string): AllocationResult {
  const studentSnapshot = result.studentSnapshot.filter((s) => s.id !== studentId);
  const assignments = result.assignments.filter((a) => a.studentId !== studentId);
  const unallocatedStudentIds = result.unallocatedStudentIds.filter((id) => id !== studentId);
  const validationReport = validateAllocation(assignments, studentSnapshot, result.roomSnapshot, result.configSnapshot);
  return {
    ...result,
    studentSnapshot,
    assignments,
    unallocatedStudentIds,
    validationReport,
    score: validationReport.overallScore,
    status: unallocatedStudentIds.length > 0 || !validationReport.allHardConstraintsPassed ? 'partial' : 'success',
  };
}

export interface DisableRoomResult {
  updated: AllocationResult;
  affectedStudentIds: string[];
  reseatedStudentIds: string[];
  stillUnseatedStudentIds: string[];
}

export function disableRoomInAllocation(result: AllocationResult, roomId: string): DisableRoomResult {
  const roomSnapshot = result.roomSnapshot.map((r) => (r.id === roomId ? { ...r, enabled: false } : r));
  const affected = result.assignments.filter((a) => a.roomId === roomId);
  const affectedStudentIds = affected.map((a) => a.studentId);
  let assignments = result.assignments.filter((a) => a.roomId !== roomId);

  const studentsById = new Map(result.studentSnapshot.map((s) => [s.id, s]));
  const reservations = buildSeatReservations(roomSnapshot, result.configSnapshot);
  const graphs = buildSeatGraphs(roomSnapshot);
  const reseated: string[] = [];
  const stillUnseated: string[] = [];

  const affectedStudentsSorted = affected
    .map((a) => studentsById.get(a.studentId))
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  for (const student of affectedStudentsSorted) {
    const occupancy = buildOccupancy(assignments, studentsById);
    const occupantOf = (seatId: string) => occupancy.get(seatId);
    const seat = findSeatForStudent(student, occupantOf, roomSnapshot, result.configSnapshot, reservations, graphs);
    if (seat) {
      assignments.push({ studentId: student.id, seatId: seat.id, roomId: seat.roomId });
      reseated.push(student.id);
    } else {
      stillUnseated.push(student.id);
    }
  }

  const unallocatedStudentIds = [...new Set([...result.unallocatedStudentIds, ...stillUnseated])];
  const validationReport = validateAllocation(assignments, result.studentSnapshot, roomSnapshot, result.configSnapshot);

  const updated: AllocationResult = {
    ...result,
    roomSnapshot,
    assignments,
    unallocatedStudentIds,
    validationReport,
    score: validationReport.overallScore,
    status: unallocatedStudentIds.length > 0 || !validationReport.allHardConstraintsPassed ? 'partial' : 'success',
  };

  return { updated, affectedStudentIds, reseatedStudentIds: reseated, stillUnseatedStudentIds: stillUnseated };
}

export interface ManualOverridePreview {
  seatExists: boolean;
  seatFree: boolean;
  seatLegal: boolean;
  hardViolations: Conflict[];
}

export function previewManualOverride(result: AllocationResult, studentId: string, newSeatId: string): ManualOverridePreview {
  const student = result.studentSnapshot.find((s) => s.id === studentId);
  const room = result.roomSnapshot.find((r) => r.seats.some((s) => s.id === newSeatId));
  const seat = room?.seats.find((s) => s.id === newSeatId);

  if (!student || !seat || !room) {
    return { seatExists: !!seat, seatFree: false, seatLegal: false, hardViolations: [] };
  }

  const seatFree = !result.assignments.some((a) => a.seatId === newSeatId && a.studentId !== studentId);
  const seatLegal = !seat.blocked && seat.available && room.enabled;

  const simulatedAssignments = result.assignments.filter((a) => a.studentId !== studentId && a.seatId !== newSeatId);
  simulatedAssignments.push({ studentId, seatId: newSeatId, roomId: room.id });
  const report = validateAllocation(simulatedAssignments, result.studentSnapshot, result.roomSnapshot, result.configSnapshot);

  return {
    seatExists: true,
    seatFree,
    seatLegal,
    hardViolations: report.conflicts.filter((c) => c.studentIds.includes(studentId)),
  };
}

export function applyManualOverride(result: AllocationResult, studentId: string, newSeatId: string, forced: boolean): AllocationResult {
  const room = result.roomSnapshot.find((r) => r.seats.some((s) => s.id === newSeatId));
  if (!room) throw new Error(`Seat ${newSeatId} does not belong to any room in this allocation.`);

  const previous = result.assignments.find((a) => a.studentId === studentId);
  const assignments = result.assignments
    .filter((a) => a.studentId !== studentId && a.seatId !== newSeatId)
    .concat([{ studentId, seatId: newSeatId, roomId: room.id }]);

  const unallocatedStudentIds = result.unallocatedStudentIds.filter((id) => id !== studentId);
  const manualOverrides = result.manualOverrides.concat([
    { studentId, seatId: newSeatId, previousSeatId: previous?.seatId, at: new Date().toISOString(), forced },
  ]);

  const validationReport = validateAllocation(assignments, result.studentSnapshot, result.roomSnapshot, result.configSnapshot);

  return {
    ...result,
    assignments,
    unallocatedStudentIds,
    manualOverrides,
    validationReport,
    score: validationReport.overallScore,
    status: unallocatedStudentIds.length > 0 || !validationReport.allHardConstraintsPassed ? 'partial' : 'success',
  };
}

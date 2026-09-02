import {
  detectRuleContradictions,
  roomAvailableSeats,
  type FeasibilityIssue,
  type FeasibilityReport,
  type Room,
  type RuleConfig,
  type Student,
} from '@exam-allocator/core';

/**
 * Cheap pre-solve feasibility pass (spec §24/§25): compute counts and detect
 * obvious impossibilities BEFORE running the expensive solver, and explain
 * *why* rather than just failing.
 */
export function checkFeasibility(students: Student[], rooms: Room[], ruleConfig: RuleConfig): FeasibilityReport {
  const issues: FeasibilityIssue[] = [];

  const studentsByBranch: Record<string, number> = {};
  const studentsByYear: Record<string, number> = {};
  const studentsBySection: Record<string, number> = {};
  for (const s of students) {
    studentsByBranch[s.branch] = (studentsByBranch[s.branch] ?? 0) + 1;
    studentsByYear[String(s.year)] = (studentsByYear[String(s.year)] ?? 0) + 1;
    studentsBySection[s.section] = (studentsBySection[s.section] ?? 0) + 1;
  }

  const seatsByRoom: Record<string, number> = {};
  let totalAvailableSeats = 0;
  let blockedSeats = 0;
  for (const room of rooms) {
    const available = roomAvailableSeats(room);
    seatsByRoom[room.name] = available.length;
    totalAvailableSeats += available.length;
    blockedSeats += room.seats.filter((s) => s.blocked).length;
  }

  if (students.length === 0) {
    issues.push({
      code: 'no_students',
      message: 'No students are selected for this exam.',
      suggestions: ['Select at least one student before generating an allocation.'],
    });
  }

  if (rooms.length === 0) {
    issues.push({
      code: 'no_rooms',
      message: 'No rooms are selected for this exam.',
      suggestions: ['Select at least one room before generating an allocation.'],
    });
  } else if (totalAvailableSeats === 0) {
    issues.push({
      code: 'no_seats',
      message: 'The selected rooms have zero available (unblocked, enabled) seats.',
      suggestions: ['Enable at least one room.', 'Unblock some seats.'],
    });
  }

  if (students.length > totalAvailableSeats && rooms.length > 0) {
    issues.push({
      code: 'insufficient_seats',
      message: `Insufficient physical seats: ${students.length} students but only ${totalAvailableSeats} available seats.`,
      suggestions: [
        'Add another room to the exam.',
        'Increase capacity by unblocking seats.',
        'Remove or reschedule some students.',
      ],
    });
  }

  // Strict distribution / strict room requirement feasibility per room.
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const strictCountsByRoom = new Map<string, number>();
  for (const entry of ruleConfig.distribution) {
    if (entry.mode === 'strict' && entry.count !== undefined) {
      strictCountsByRoom.set(entry.roomId, (strictCountsByRoom.get(entry.roomId) ?? 0) + entry.count);
    }
  }
  for (const [roomId, requiredCount] of strictCountsByRoom) {
    const room = roomsById.get(roomId);
    if (!room) continue;
    const available = roomAvailableSeats(room).length;
    if (requiredCount > available) {
      issues.push({
        code: 'strict_distribution_exceeds_capacity',
        message: `Room "${room.name}" has strict branch distribution requiring ${requiredCount} seats but only ${available} are available.`,
        suggestions: [
          `Reduce the strict seat count for ${room.name}.`,
          'Mark the requirement as PREFERRED instead of STRICT.',
          'Unblock more seats in this room.',
        ],
      });
    }
  }

  for (const room of rooms) {
    const strictReq = (room.branchRequirements ?? []).filter((r) => r.mode === 'strict');
    if (!strictReq.length) continue;
    const allowedBranches = new Set(strictReq.map((r) => r.branch));
    const eligibleStudents = students.filter((s) => allowedBranches.has(s.branch)).length;
    const available = roomAvailableSeats(room).length;
    if (eligibleStudents === 0) {
      issues.push({
        code: 'strict_room_branch_no_students',
        message: `Room "${room.name}" is restricted to [${[...allowedBranches].join(', ')}] but no selected students belong to those branches.`,
        suggestions: ['Relax the room branch restriction.', 'Select students from the required branch(es).'],
      });
    } else if (eligibleStudents > available) {
      issues.push({
        code: 'strict_room_branch_overflow',
        message: `Room "${room.name}" is restricted to [${[...allowedBranches].join(', ')}] (${eligibleStudents} students) but only has ${available} feasible seats.`,
        suggestions: ['Add another room restricted to the same branch(es).', 'Relax the restriction to PREFERRED.'],
      });
    }
  }

  const ruleContradictions = detectRuleContradictions(ruleConfig);

  const feasible = issues.length === 0 && ruleContradictions.length === 0;

  return {
    feasible,
    totalStudents: students.length,
    totalAvailableSeats,
    studentsByBranch,
    studentsByYear,
    studentsBySection,
    seatsByRoom,
    blockedSeats,
    issues,
    ruleContradictions,
  };
}

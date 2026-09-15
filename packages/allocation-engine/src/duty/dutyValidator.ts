import type { DutyConflict, DutyRoster, DutyValidationReport, Room, Teacher } from '@exam-allocator/core';

/**
 * Independent re-check of a duty roster, same philosophy as the seat
 * AllocationValidator - never trusts the allocator's own bookkeeping.
 * `branchesInRoom` (roomId -> set of student branches seated there) is
 * needed only to re-check the own-branch-avoidance preference; pass an
 * empty map when there's no seat allocation yet. `roomDutyTargets` is the
 * capacity-derived required invigilator count per room (see
 * `computeRoomDutyTargets`), not a single flat number - a bigger room is
 * allowed more invigilators than a smaller one.
 */
export function validateDutyRoster(
  roster: Pick<DutyRoster, 'assignments' | 'roomDutyTargets' | 'avoidOwnBranchInvigilation'>,
  teachers: Teacher[],
  rooms: Room[],
  branchesInRoom: Map<string, Set<string>>
): DutyValidationReport {
  const conflicts: DutyConflict[] = [];
  const teachersById = new Map(teachers.map((t) => [t.id, t]));

  const teacherRooms = new Map<string, Set<string>>();
  for (const a of roster.assignments) {
    const set = teacherRooms.get(a.teacherId) ?? new Set<string>();
    set.add(a.roomId);
    teacherRooms.set(a.teacherId, set);
  }
  let duplicateCount = 0;
  for (const [teacherId, roomSet] of teacherRooms) {
    if (roomSet.size > 1) {
      duplicateCount++;
      conflicts.push({
        id: `dup-${teacherId}`,
        type: 'duplicate_teacher',
        severity: 'high',
        teacherId,
        description: `${teachersById.get(teacherId)?.name ?? teacherId} is assigned to ${roomSet.size} rooms at the same time.`,
      });
    }
  }

  const roomCounts = new Map<string, number>();
  for (const a of roster.assignments) roomCounts.set(a.roomId, (roomCounts.get(a.roomId) ?? 0) + 1);
  let overstaffedCount = 0;
  for (const [roomId, count] of roomCounts) {
    const target = roster.roomDutyTargets[roomId] ?? 1;
    if (count > target) {
      overstaffedCount++;
      conflicts.push({
        id: `over-${roomId}`,
        type: 'room_overstaffed',
        severity: 'medium',
        roomId,
        description: `Room has ${count} invigilator(s) assigned, more than its required ${target}.`,
      });
    }
  }

  if (roster.avoidOwnBranchInvigilation) {
    for (const a of roster.assignments) {
      const teacher = teachersById.get(a.teacherId);
      if (teacher && branchesInRoom.get(a.roomId)?.has(teacher.branch)) {
        conflicts.push({
          id: `ownbranch-${a.teacherId}-${a.roomId}`,
          type: 'own_branch_violation',
          severity: 'medium',
          teacherId: a.teacherId,
          roomId: a.roomId,
          description: `${teacher.name} (${teacher.branch}) is invigilating a room seating their own branch's students.`,
        });
      }
    }
  }

  const enabledRooms = rooms.filter((r) => r.enabled);
  const totalRoomsNeeded = enabledRooms.length;
  const roomsFullyStaffed = enabledRooms.filter((r) => (roomCounts.get(r.id) ?? 0) >= (roster.roomDutyTargets[r.id] ?? 1)).length;

  const fulfillmentRatios = enabledRooms.map((r) => {
    const target = roster.roomDutyTargets[r.id] ?? 1;
    const actual = roomCounts.get(r.id) ?? 0;
    return target === 0 ? 1 : Math.min(1, actual / target);
  });
  const balanceScore = fulfillmentRatios.length === 0 ? 100 : Math.round((fulfillmentRatios.reduce((a, b) => a + b, 0) / fulfillmentRatios.length) * 100);

  return {
    generatedAt: new Date().toISOString(),
    totalRoomsNeeded,
    roomsFullyStaffed,
    balanceScore,
    conflicts,
    // Own-branch avoidance is a configurable preference, not a safety invariant -
    // only duplicate assignment and overstaffing are true hard constraints here.
    allHardConstraintsPassed: duplicateCount === 0 && overstaffedCount === 0,
  };
}

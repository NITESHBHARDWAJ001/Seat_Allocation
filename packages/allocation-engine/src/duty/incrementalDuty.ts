import type { DutyConflict, DutyRoster, Room, Teacher } from '@exam-allocator/core';
import { validateDutyRoster } from './dutyValidator.js';

export interface ManualDutyPreview {
  hardViolations: DutyConflict[];
}

export function previewManualDutyOverride(
  roster: DutyRoster,
  teacherId: string,
  newRoomId: string,
  teachers: Teacher[],
  rooms: Room[],
  branchesInRoom: Map<string, Set<string>>
): ManualDutyPreview {
  const assignments = roster.assignments.filter((a) => a.teacherId !== teacherId).concat([{ teacherId, roomId: newRoomId }]);
  const report = validateDutyRoster({ ...roster, assignments }, teachers, rooms, branchesInRoom);
  return { hardViolations: report.conflicts.filter((c) => c.teacherId === teacherId || c.roomId === newRoomId) };
}

export function applyManualDutyOverride(
  roster: DutyRoster,
  teacherId: string,
  newRoomId: string,
  forced: boolean,
  teachers: Teacher[],
  rooms: Room[],
  branchesInRoom: Map<string, Set<string>>
): DutyRoster {
  const previous = roster.assignments.find((a) => a.teacherId === teacherId);
  const assignments = roster.assignments.filter((a) => a.teacherId !== teacherId).concat([{ teacherId, roomId: newRoomId }]);
  const unassignedTeacherIds = roster.unassignedTeacherIds.filter((id) => id !== teacherId);
  const manualOverrides = roster.manualOverrides.concat([
    { teacherId, roomId: newRoomId, previousRoomId: previous?.roomId, at: new Date().toISOString(), forced },
  ]);
  const validationReport = validateDutyRoster({ ...roster, assignments }, teachers, rooms, branchesInRoom);
  return { ...roster, assignments, unassignedTeacherIds, manualOverrides, validationReport };
}

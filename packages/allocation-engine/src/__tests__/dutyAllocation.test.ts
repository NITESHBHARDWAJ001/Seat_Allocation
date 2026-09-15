import { describe, expect, it } from 'vitest';
import type { Exam } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { allocateDuties, computeRoomDutyTargets, findConflictingTeacherIds, findWorkloadExcludedTeacherIds } from '../duty/dutyAllocator.js';
import { applyManualDutyOverride, previewManualDutyOverride } from '../duty/incrementalDuty.js';
import { baseRuleConfig, makeRegularRoom, makeStudents, makeTeachers } from './helpers.js';

function makeExam(overrides: Partial<Exam> & { id: string }): Exam {
  return {
    name: overrides.id,
    date: '2026-10-01',
    startTime: '09:00',
    endTime: '12:00',
    studentIds: [],
    roomIds: [],
    ruleConfig: baseRuleConfig(),
    subjectAssignments: [],
    allocationIds: [],
    dutyRosterIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeRoomDutyTargets', () => {
  it('scales invigilator count with room capacity', () => {
    const small = makeRegularRoom('R1', 1, 5); // 5 seats
    const big = makeRegularRoom('R2', 1, 20); // 20 seats
    const targets = computeRoomDutyTargets([small, big], 10);
    expect(targets['R1']).toBe(1); // ceil(5/10)
    expect(targets['R2']).toBe(2); // ceil(20/10)
  });

  it('never assigns a target below 1, even for a tiny room', () => {
    const tiny = makeRegularRoom('R1', 1, 1);
    const targets = computeRoomDutyTargets([tiny], 100);
    expect(targets['R1']).toBe(1);
  });
});

describe('allocateDuties', () => {
  it('distributes teachers evenly across equal-sized rooms and reproducibly', () => {
    const rooms = [makeRegularRoom('R1', 1, 5), makeRegularRoom('R2', 1, 5), makeRegularRoom('R3', 1, 5)];
    const teachers = makeTeachers(10, 'CSE', 'T');

    const roster = allocateDuties({ examId: 'e1', teachers, rooms, seatsPerInvigilator: 100, avoidOwnBranchInvigilation: false, seed: 42 });

    const counts = rooms.map((r) => roster.assignments.filter((a) => a.roomId === r.id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(roster.assignments).toHaveLength(3);
    expect(roster.unassignedTeacherIds).toHaveLength(7);
    expect(roster.validationReport.allHardConstraintsPassed).toBe(true);

    const roster2 = allocateDuties({ examId: 'e1', teachers, rooms, seatsPerInvigilator: 100, avoidOwnBranchInvigilation: false, seed: 42 });
    expect(roster2.assignments).toEqual(roster.assignments);
  });

  it('gives a bigger room more invigilators than a smaller one', () => {
    const small = makeRegularRoom('R1', 1, 5); // target 1 at ratio 5
    const big = makeRegularRoom('R2', 1, 10); // target 2 at ratio 5
    const teachers = makeTeachers(6, 'CSE', 'T');

    const roster = allocateDuties({ examId: 'e1', teachers, rooms: [small, big], seatsPerInvigilator: 5, avoidOwnBranchInvigilation: false, seed: 1 });

    expect(roster.assignments.filter((a) => a.roomId === 'R1')).toHaveLength(1);
    expect(roster.assignments.filter((a) => a.roomId === 'R2')).toHaveLength(2);
    const teacherIds = roster.assignments.map((a) => a.teacherId);
    expect(new Set(teacherIds).size).toBe(teacherIds.length);
  });

  it('reports a shortfall honestly instead of forcing a double-booking', () => {
    const rooms = [makeRegularRoom('R1', 1, 5), makeRegularRoom('R2', 1, 5), makeRegularRoom('R3', 1, 5)];
    const teachers = makeTeachers(2, 'CSE', 'T');

    const roster = allocateDuties({ examId: 'e1', teachers, rooms, seatsPerInvigilator: 100, avoidOwnBranchInvigilation: false, seed: 1 });

    expect(roster.assignments).toHaveLength(2);
    expect(roster.understaffedRoomIds).toHaveLength(1);
    expect(roster.validationReport.allHardConstraintsPassed).toBe(true);
  });

  it('excludes teachers already on duty in an overlapping exam', () => {
    const rooms = [makeRegularRoom('R1', 1, 5)];
    const teachers = makeTeachers(3, 'CSE', 'T');

    const roster = allocateDuties({
      examId: 'e1',
      teachers,
      rooms,
      seatsPerInvigilator: 100,
      avoidOwnBranchInvigilation: false,
      excludeTeacherIds: new Set(['T-1', 'T-2']),
      seed: 1,
    });

    expect(roster.assignments).toHaveLength(1);
    expect(roster.assignments[0]!.teacherId).toBe('T-3');
  });

  it('avoids assigning a teacher to a room seating their own branch when the option is on', () => {
    const room = makeRegularRoom('R1', 1, 4);
    const students = makeStudents(4, 'CSE', 'S');
    const ruleConfig = baseRuleConfig();
    ruleConfig.adjacencyRules = [];
    const seatAllocation = generateAllocation({ examId: 'e1', students, rooms: [room], ruleConfig });
    expect(seatAllocation.status).toBe('success');

    const teachers = [
      { id: 'T-cse', name: 'CSE Teacher', branch: 'CSE', active: true },
      { id: 'T-ece', name: 'ECE Teacher', branch: 'ECE', active: true },
    ];

    const roster = allocateDuties({
      examId: 'e1',
      teachers,
      rooms: [room],
      seatsPerInvigilator: 100,
      avoidOwnBranchInvigilation: true,
      seatAllocation,
      seed: 1,
    });

    expect(roster.assignments).toHaveLength(1);
    expect(roster.assignments[0]!.teacherId).toBe('T-ece');
    expect(roster.validationReport.conflicts.some((c) => c.type === 'own_branch_violation')).toBe(false);
  });
});

describe('findConflictingTeacherIds', () => {
  it('flags a teacher already rostered on an overlapping-time exam on the same date', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '12:00', activeDutyRosterId: 'rosterA' });
    const examB = makeExam({ id: 'B', date: '2026-10-01', startTime: '11:00', endTime: '13:00' });
    const rosterA = allocateDuties({
      examId: 'A',
      teachers: makeTeachers(2, 'CSE', 'T'),
      rooms: [makeRegularRoom('R1', 1, 1)],
      seatsPerInvigilator: 100,
      avoidOwnBranchInvigilation: false,
      seed: 1,
    });
    rosterA.id = 'rosterA';

    const conflicting = findConflictingTeacherIds(examB, [examA, examB], [rosterA]);
    expect(conflicting.has(rosterA.assignments[0]!.teacherId)).toBe(true);
  });

  it('does not flag a teacher when exam times do not overlap', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '11:00', activeDutyRosterId: 'rosterA' });
    const examB = makeExam({ id: 'B', date: '2026-10-01', startTime: '11:00', endTime: '13:00' });
    const rosterA = allocateDuties({
      examId: 'A',
      teachers: makeTeachers(2, 'CSE', 'T'),
      rooms: [makeRegularRoom('R1', 1, 1)],
      seatsPerInvigilator: 100,
      avoidOwnBranchInvigilation: false,
      seed: 1,
    });
    rosterA.id = 'rosterA';

    const conflicting = findConflictingTeacherIds(examB, [examA, examB], [rosterA]);
    expect(conflicting.size).toBe(0);
  });
});

describe('findWorkloadExcludedTeacherIds', () => {
  function rosterFor(examId: string, teacherId: string, roomId: string): ReturnType<typeof allocateDuties> {
    const r = allocateDuties({
      examId,
      teachers: [{ id: teacherId, name: teacherId, branch: 'CSE', active: true }],
      rooms: [makeRegularRoom(roomId, 1, 1)],
      seatsPerInvigilator: 100,
      avoidOwnBranchInvigilation: false,
      seed: 1,
    });
    r.id = `${examId}-roster`;
    return r;
  }

  it('excludes a teacher who already hit the per-day cap on another same-day exam', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '12:00', activeDutyRosterId: 'A-roster' });
    const examB = makeExam({ id: 'B', date: '2026-10-01', startTime: '14:00', endTime: '17:00' });
    const rosterA = rosterFor('A', 'T-1', 'RA');

    const excluded = findWorkloadExcludedTeacherIds(examB, [examA, examB], [rosterA], 1, undefined);
    expect(excluded.has('T-1')).toBe(true);
  });

  it('does not exclude on a different day when only the per-day cap is set', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '12:00', activeDutyRosterId: 'A-roster' });
    const examB = makeExam({ id: 'B', date: '2026-10-02', startTime: '09:00', endTime: '12:00' });
    const rosterA = rosterFor('A', 'T-1', 'RA');

    const excluded = findWorkloadExcludedTeacherIds(examB, [examA, examB], [rosterA], 1, undefined);
    expect(excluded.has('T-1')).toBe(false);
  });

  it('excludes a teacher who already hit the total cap regardless of day', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '12:00', activeDutyRosterId: 'A-roster' });
    const examB = makeExam({ id: 'B', date: '2026-10-05', startTime: '09:00', endTime: '12:00' });
    const rosterA = rosterFor('A', 'T-1', 'RA');

    const excluded = findWorkloadExcludedTeacherIds(examB, [examA, examB], [rosterA], undefined, 1);
    expect(excluded.has('T-1')).toBe(true);
  });

  it('excludes nobody when no caps are set', () => {
    const examA = makeExam({ id: 'A', date: '2026-10-01', startTime: '09:00', endTime: '12:00', activeDutyRosterId: 'A-roster' });
    const examB = makeExam({ id: 'B', date: '2026-10-01', startTime: '14:00', endTime: '17:00' });
    const rosterA = rosterFor('A', 'T-1', 'RA');

    const excluded = findWorkloadExcludedTeacherIds(examB, [examA, examB], [rosterA]);
    expect(excluded.size).toBe(0);
  });
});

describe('manual duty override', () => {
  it('moves a teacher into an empty room with no violation', () => {
    const rooms = [makeRegularRoom('R1', 1, 5), makeRegularRoom('R2', 1, 5), makeRegularRoom('R3', 1, 5)];
    const teachers = makeTeachers(2, 'CSE', 'T');
    const roster = allocateDuties({ examId: 'e1', teachers, rooms, seatsPerInvigilator: 100, avoidOwnBranchInvigilation: false, seed: 1 });
    const branchesInRoom = new Map<string, Set<string>>();

    const moved = teachers[0]!;
    const occupiedRoomIds = new Set(roster.assignments.map((a) => a.roomId));
    const emptyRoom = rooms.find((r) => !occupiedRoomIds.has(r.id))!;

    const preview = previewManualDutyOverride(roster, moved.id, emptyRoom.id, teachers, rooms, branchesInRoom);
    expect(preview.hardViolations).toHaveLength(0);

    const updated = applyManualDutyOverride(roster, moved.id, emptyRoom.id, false, teachers, rooms, branchesInRoom);
    expect(updated.assignments.find((a) => a.teacherId === moved.id)?.roomId).toBe(emptyRoom.id);
    expect(updated.manualOverrides).toHaveLength(1);
  });

  it('flags overstaffing when a manual move overfills a room', () => {
    const rooms = [makeRegularRoom('R1', 1, 5), makeRegularRoom('R2', 1, 5)];
    const teachers = makeTeachers(2, 'CSE', 'T');
    const roster = allocateDuties({ examId: 'e1', teachers, rooms, seatsPerInvigilator: 100, avoidOwnBranchInvigilation: false, seed: 1 });
    const branchesInRoom = new Map<string, Set<string>>();

    const moved = teachers[0]!;
    const otherAssignment = roster.assignments.find((a) => a.teacherId !== moved.id)!;

    const preview = previewManualDutyOverride(roster, moved.id, otherAssignment.roomId, teachers, rooms, branchesInRoom);
    expect(preview.hardViolations.some((c) => c.type === 'room_overstaffed')).toBe(true);
  });
});

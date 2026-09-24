import { describe, expect, it } from 'vitest';
import type { AllocationResult, DutyRoster, DutyWindow, Exam } from '@exam-allocator/core';
import { generateAllocation } from '../engine.js';
import { allocateDuties, computeOccupiedRoomTargets, occupancyFromAllocation } from '../duty/dutyAllocator.js';
import { computeWindowDemand, planDutyWindow } from '../duty/dutyWindowPlanner.js';
import { baseRuleConfig, makeRegularRoom, makeStudents, makeTeachers } from './helpers.js';

function makeWindow(overrides: Partial<DutyWindow> = {}): DutyWindow {
  return {
    id: 'w1',
    name: 'Sessional 1',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    studentsPerInvigilator: 30,
    avoidOwnBranchInvigilation: false,
    perTeacher: {},
    ...overrides,
  };
}

/** One exam session with its finished seat allocation. `studentCount` students over rooms of 60 seats each. */
function makeSession(id: string, date: string, startTime: string, endTime: string, studentCount: number) {
  const roomCount = Math.ceil(studentCount / 60);
  const rooms = Array.from({ length: roomCount }, (_, i) => makeRegularRoom(`${id}-room${i + 1}`, 6, 10, i + 1));
  const students = makeStudents(studentCount, 'CSE', `${id}-S`);
  const allocation = generateAllocation({
    examId: id,
    students,
    rooms,
    ruleConfig: { ...baseRuleConfig(), adjacencyRules: [] },
    seed: 1,
  });
  const exam: Exam = {
    id,
    name: id,
    date,
    startTime,
    endTime,
    studentIds: students.map((s) => s.id),
    roomIds: rooms.map((r) => r.id),
    ruleConfig: baseRuleConfig(),
    subjectAssignments: [],
    allocationIds: [allocation.id],
    activeAllocationId: allocation.id,
    dutyRosterIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { exam, allocation };
}

function planFor(sessions: ReturnType<typeof makeSession>[], teacherCount: number, window = makeWindow(), extra: { existingRosters?: DutyRoster[]; lockedExamIds?: Set<string>; seed?: number } = {}) {
  const allocationsByExamId: Record<string, AllocationResult | undefined> = {};
  for (const s of sessions) allocationsByExamId[s.exam.id] = s.allocation;
  return planDutyWindow({
    window,
    exams: sessions.map((s) => s.exam),
    allocationsByExamId,
    teachers: makeTeachers(teacherCount, 'ECE', 'T'),
    existingRosters: extra.existingRosters ?? [],
    lockedExamIds: extra.lockedExamIds,
    seed: extra.seed,
  });
}

describe('duty sizing follows occupied rooms and students seated', () => {
  it('gives duty only to rooms with students, and scales with the student count', () => {
    const rooms = [makeRegularRoom('A', 6, 10), makeRegularRoom('B', 6, 12), makeRegularRoom('C', 6, 10)];
    const occupancy = { A: 12, B: 61 }; // room C has nobody
    const targets = computeOccupiedRoomTargets(rooms, occupancy, 30);
    expect(targets).toEqual({ A: 1, B: 3 });
    expect(targets['C']).toBeUndefined();
  });

  it('honours a per-room override', () => {
    const rooms = [makeRegularRoom('A', 6, 10)];
    expect(computeOccupiedRoomTargets(rooms, { A: 10 }, 30, { A: 2 })).toEqual({ A: 2 });
  });

  it('allocateDuties in occupancy mode skips empty rooms and staffs by students', () => {
    const roomA = makeRegularRoom('A', 6, 10);
    const roomB = makeRegularRoom('B', 6, 10);
    const roomC = makeRegularRoom('C', 6, 10);
    const roster = allocateDuties({
      examId: 'e',
      teachers: makeTeachers(10, 'ECE', 'T'),
      rooms: [roomA, roomB, roomC],
      seatsPerInvigilator: 30,
      avoidOwnBranchInvigilation: false,
      occupancy: { A: 12, B: 45 },
      seed: 1,
    });
    expect(roster.basis).toBe('students');
    expect(roster.roomDutyTargets).toEqual({ A: 1, B: 2 });
    expect(roster.assignments.filter((a) => a.roomId === 'A')).toHaveLength(1);
    expect(roster.assignments.filter((a) => a.roomId === 'B')).toHaveLength(2);
    expect(roster.assignments.some((a) => a.roomId === 'C')).toBe(false);
  });

  it('occupancyFromAllocation counts students actually seated per room', () => {
    const { allocation } = makeSession('X', '2026-11-02', '09:00', '12:00', 70);
    const occ = occupancyFromAllocation(allocation);
    expect(Object.values(occ).reduce((a, b) => a + b, 0)).toBe(70);
  });
});

describe('planDutyWindow - fair distribution across a date range', () => {
  it('spreads duties evenly: everyone within one duty of everyone else', () => {
    // 5 exams on different days, each 2 rooms x 60 students -> 4 slots per exam = 20 slots for 8 teachers.
    const sessions = ['02', '03', '04', '05', '06'].map((d) => makeSession(`E${d}`, `2026-11-${d}`, '09:00', '12:00', 120));
    const { report, rosters } = planFor(sessions, 8);

    expect(report.totalSlots).toBe(20);
    expect(report.filledSlots).toBe(20);
    expect(report.unfilledSlots).toBe(0);
    expect(report.spread).toBeLessThanOrEqual(1);
    for (const t of report.teachers) expect([2, 3]).toContain(t.duties);
    expect(rosters).toHaveLength(5);
  });

  it('stays even with awkward numbers (7 teachers, 27 slots)', () => {
    const sessions = Array.from({ length: 9 }, (_, i) => makeSession(`E${i}`, `2026-11-${String(i + 2).padStart(2, '0')}`, '09:00', '12:00', 90)); // 2 rooms: 60 + 30 -> 2 + 1 = 3 slots
    const { report } = planFor(sessions, 7);
    expect(report.totalSlots).toBe(27);
    expect(report.filledSlots).toBe(27);
    expect(report.spread).toBeLessThanOrEqual(1);
  });

  it('fairness holds across several seeds', () => {
    const sessions = ['02', '03', '04', '05'].map((d) => makeSession(`E${d}`, `2026-11-${d}`, '09:00', '12:00', 60));
    for (const seed of [1, 7, 42, 99, 1234]) {
      expect(planFor(sessions, 6, makeWindow(), { seed }).report.spread).toBeLessThanOrEqual(1);
    }
  });

  it('never puts a teacher in two overlapping sessions', () => {
    const a = makeSession('A', '2026-11-02', '09:00', '12:00', 120); // 4 slots
    const b = makeSession('B', '2026-11-02', '10:00', '13:00', 120); // overlaps A -> 4 more slots
    const { rosters } = planFor([a, b], 8);
    const inA = new Set(rosters.find((r) => r.examId === 'A')!.assignments.map((x) => x.teacherId));
    const inB = rosters.find((r) => r.examId === 'B')!.assignments.map((x) => x.teacherId);
    expect(inB.some((t) => inA.has(t))).toBe(false);
  });

  it('lets a teacher do two non-overlapping sessions the same day, unless max per day says otherwise', () => {
    const morning = makeSession('M', '2026-11-02', '09:00', '10:30', 120);
    const afternoon = makeSession('N', '2026-11-02', '14:00', '15:30', 120);
    const free = planFor([morning, afternoon], 4); // 4 slots each, only 4 teachers -> everyone works both
    expect(free.report.filledSlots).toBe(8);
    expect(free.report.teachers.every((t) => t.duties === 2)).toBe(true);

    const capped = planFor([morning, afternoon], 4, makeWindow({ maxPerDay: 1 }));
    expect(capped.report.teachers.every((t) => t.duties <= 1)).toBe(true);
    expect(capped.report.unfilledSlots).toBe(4);
    expect(capped.report.warnings.join(' ')).toMatch(/could not be filled/);
  });

  it('respects a per-teacher max, an exempt teacher, and reports below-minimum honestly', () => {
    const sessions = ['02', '03', '04'].map((d) => makeSession(`E${d}`, `2026-11-${d}`, '09:00', '12:00', 60)); // 2 slots each = 6
    const window = makeWindow({ defaultMaxDuties: 2, perTeacher: { 'T-1': { exempt: true }, 'T-2': { max: 1 } } });
    const { report } = planFor(sessions, 5, window);
    const byId = new Map(report.teachers.map((t) => [t.teacherId, t]));
    expect(byId.get('T-1')!.duties).toBe(0);
    expect(byId.get('T-2')!.duties).toBeLessThanOrEqual(1);
    for (const t of report.teachers) if (t.max !== undefined) expect(t.duties).toBeLessThanOrEqual(t.max);

    const withMin = planFor(sessions, 5, makeWindow({ defaultMinDuties: 5 }));
    expect(withMin.report.teachers.some((t) => t.belowMin)).toBe(true);
    expect(withMin.report.warnings.join(' ')).toMatch(/below their minimum/);
  });

  it('reports a shortfall instead of breaking a rule when there are not enough teachers', () => {
    const { report } = planFor([makeSession('E', '2026-11-02', '09:00', '12:00', 120)], 2);
    expect(report.totalSlots).toBe(4);
    expect(report.filledSlots).toBe(2);
    expect(report.unfilledSlots).toBe(2);
  });

  it('only plans exams inside the date range', () => {
    const inside = makeSession('IN', '2026-11-05', '09:00', '12:00', 60);
    const outside = makeSession('OUT', '2026-12-20', '09:00', '12:00', 60);
    const { rosters, report } = planFor([inside, outside], 4);
    expect(rosters.map((r) => r.examId)).toEqual(['IN']);
    expect(report.examsInWindow).toBe(1);
  });

  it('skips exams with no seating and says so', () => {
    const seated = makeSession('S', '2026-11-05', '09:00', '12:00', 60);
    const noSeating = makeSession('N', '2026-11-06', '09:00', '12:00', 60);
    const result = planDutyWindow({
      window: makeWindow(),
      exams: [seated.exam, noSeating.exam],
      allocationsByExamId: { S: seated.allocation },
      teachers: makeTeachers(4, 'ECE', 'T'),
      existingRosters: [],
    });
    expect(result.report.skipped).toEqual([{ examId: 'N', examName: 'N', reason: 'No seating generated yet' }]);
    expect(result.rosters.map((r) => r.examId)).toEqual(['S']);
  });

  it('keeps a hand-edited (locked) roster and counts its duties toward fairness', () => {
    const e1 = makeSession('E1', '2026-11-02', '09:00', '12:00', 60);
    const e2 = makeSession('E2', '2026-11-03', '09:00', '12:00', 60);
    const e3 = makeSession('E3', '2026-11-04', '09:00', '12:00', 60);
    const lockedRoster: DutyRoster = {
      id: 'locked-1',
      examId: 'E1',
      generatedAt: '2026-01-01T00:00:00.000Z',
      seed: 1,
      seatsPerInvigilator: 30,
      roomDutyTargets: { 'E1-room1': 2 },
      avoidOwnBranchInvigilation: false,
      assignments: [
        { teacherId: 'T-1', roomId: 'E1-room1' },
        { teacherId: 'T-2', roomId: 'E1-room1' },
      ],
      manualOverrides: [{ teacherId: 'T-1', roomId: 'E1-room1', at: '2026-01-01T00:00:00.000Z', forced: false }],
      unassignedTeacherIds: [],
      understaffedRoomIds: [],
      validationReport: { generatedAt: '', totalRoomsNeeded: 1, roomsFullyStaffed: 1, balanceScore: 100, conflicts: [], allHardConstraintsPassed: true },
      version: 1,
    };
    e1.exam.activeDutyRosterId = 'locked-1';
    e1.exam.dutyRosterIds = ['locked-1'];

    const { rosters, report } = planFor([e1, e2, e3], 6, makeWindow(), { existingRosters: [lockedRoster] });
    expect(rosters.map((r) => r.examId).sort()).toEqual(['E2', 'E3']); // E1 untouched
    expect(report.examsKept).toBe(1);
    expect(report.totalSlots).toBe(6);
    expect(report.spread).toBeLessThanOrEqual(1);
    // T-1 and T-2 already worked E1, so E2/E3 go to other teachers first.
    const later = rosters.flatMap((r) => r.assignments.map((a) => a.teacherId));
    expect(later.filter((t) => t === 'T-1' || t === 'T-2')).toHaveLength(0);
  });

  it('is reproducible for the same seed', () => {
    const sessions = ['02', '03', '04'].map((d) => makeSession(`E${d}`, `2026-11-${d}`, '09:00', '12:00', 120));
    const shape = (seed: number) => JSON.stringify(planFor(sessions, 9, makeWindow(), { seed }).rosters.map((r) => r.assignments));
    expect(shape(5)).toBe(shape(5));
  });

  it('tags rosters with the window and the seat allocation they were sized from', () => {
    const s = makeSession('E', '2026-11-02', '09:00', '12:00', 60);
    const { rosters } = planFor([s], 4);
    expect(rosters[0]!.windowId).toBe('w1');
    expect(rosters[0]!.basedOnAllocationId).toBe(s.allocation.id);
    expect(rosters[0]!.basis).toBe('students');
  });
});

describe('computeWindowDemand', () => {
  it('sums invigilator slots from occupied rooms only', () => {
    const a = makeSession('A', '2026-11-02', '09:00', '12:00', 90); // 60 + 30 -> 2 + 1
    const b = makeSession('B', '2026-11-03', '09:00', '12:00', 60); // 2
    const demand = computeWindowDemand(makeWindow(), [a.exam, b.exam], { A: a.allocation, B: b.allocation });
    expect(demand.totalSlots).toBe(5);
    expect(demand.sessions).toHaveLength(2);
  });
});

import type { AllocationResult, DutyRoster, DutyTeacherQuota, DutyWindow, Exam, Teacher } from '@exam-allocator/core';
import { SeededRandom } from '../rng.js';
import { timingsOverlap } from '../scheduling/conflicts.js';
import { allocateDuties, buildBranchesInRoom, computeOccupiedRoomTargets, occupancyFromAllocation } from './dutyAllocator.js';
import { validateDutyRoster } from './dutyValidator.js';

/**
 * Fair duty distribution across a date range ("duty window").
 *
 * Duty unit: one teacher, one room, one session (an exam sitting = date + start + end).
 * Only rooms that actually have students get invigilators, sized by students seated.
 *
 * Fairness: sessions are planned in date order and each session picks the
 * *least-loaded* teachers first (seeded random tie-break), then a balancing
 * pass moves duties from the busiest teacher to the quietest one wherever the
 * hard rules allow. Hard rules are never broken to even things out:
 *   - no two overlapping sessions for one teacher
 *   - per-teacher max duties in the window (and exempt teachers get none)
 *   - max sessions per day
 *   - optional own-branch avoidance
 * When supply cannot cover demand the shortfall is reported, not hidden.
 */

export interface WindowTeacherStat {
  teacherId: string;
  name: string;
  branch: string;
  duties: number;
  min?: number;
  max?: number;
  exempt: boolean;
  belowMin: boolean;
  atMax: boolean;
}

export interface SkippedExam {
  examId: string;
  examName: string;
  reason: string;
}

export interface DutyWindowReport {
  windowId: string;
  examsInWindow: number;
  examsPlanned: number;
  examsKept: number;
  skipped: SkippedExam[];
  totalSlots: number;
  filledSlots: number;
  unfilledSlots: number;
  teachers: WindowTeacherStat[];
  /** Duties of the busiest minus the quietest teacher who is eligible for duty (0 or 1 = perfectly even). */
  spread: number;
  warnings: string[];
}

export interface PlanDutyWindowParams {
  window: DutyWindow;
  exams: Exam[];
  /** Each exam's active seat allocation (exams without one are skipped). */
  allocationsByExamId: Record<string, AllocationResult | undefined>;
  teachers: Teacher[];
  existingRosters: DutyRoster[];
  /** Exams whose current duty roster must be kept as-is (they still count toward loads and overlaps). */
  lockedExamIds?: Set<string>;
  seed?: number;
}

export interface PlanDutyWindowResult {
  /** New roster versions, one per planned exam - caller persists them and marks them active. */
  rosters: DutyRoster[];
  report: DutyWindowReport;
}

export function examsInWindow(window: Pick<DutyWindow, 'startDate' | 'endDate'>, exams: Exam[]): Exam[] {
  return exams
    .filter((e) => e.date >= window.startDate && e.date <= window.endDate)
    .slice()
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/** Exams whose active roster carries manual moves - regenerating must not throw that hand work away. */
export function defaultLockedExamIds(exams: Exam[], rosters: DutyRoster[]): Set<string> {
  const byId = new Map(rosters.map((r) => [r.id, r]));
  const locked = new Set<string>();
  for (const exam of exams) {
    const roster = exam.activeDutyRosterId ? byId.get(exam.activeDutyRosterId) : undefined;
    if (roster && roster.manualOverrides.length > 0) locked.add(exam.id);
  }
  return locked;
}

function quotaFor(window: DutyWindow, teacherId: string): { min?: number; max?: number; exempt: boolean } {
  const q: DutyTeacherQuota = window.perTeacher[teacherId] ?? {};
  return { min: q.min ?? window.defaultMinDuties, max: q.max ?? window.defaultMaxDuties, exempt: q.exempt === true };
}

export interface WindowDemand {
  examsInWindow: number;
  sessions: Array<{ examId: string; name: string; date: string; startTime: string; slots: number; occupiedRooms: number }>;
  skipped: SkippedExam[];
  totalSlots: number;
}

/** How many invigilator slots the window needs, from the rooms that actually have students. */
export function computeWindowDemand(
  window: Pick<DutyWindow, 'startDate' | 'endDate' | 'studentsPerInvigilator'>,
  exams: Exam[],
  allocationsByExamId: Record<string, AllocationResult | undefined>
): WindowDemand {
  const inWindow = examsInWindow(window, exams);
  const sessions: WindowDemand['sessions'] = [];
  const skipped: SkippedExam[] = [];
  for (const exam of inWindow) {
    const allocation = allocationsByExamId[exam.id];
    if (!allocation) {
      skipped.push({ examId: exam.id, examName: exam.name, reason: 'No seating generated yet' });
      continue;
    }
    const occupancy = occupancyFromAllocation(allocation);
    const targets = computeOccupiedRoomTargets(allocation.roomSnapshot, occupancy, window.studentsPerInvigilator);
    const roomCount = Object.keys(targets).length;
    if (roomCount === 0) {
      skipped.push({ examId: exam.id, examName: exam.name, reason: 'Nobody is seated in any room' });
      continue;
    }
    sessions.push({
      examId: exam.id,
      name: exam.name,
      date: exam.date,
      startTime: exam.startTime,
      slots: Object.values(targets).reduce((a, b) => a + b, 0),
      occupiedRooms: roomCount,
    });
  }
  return { examsInWindow: inWindow.length, sessions, skipped, totalSlots: sessions.reduce((a, s) => a + s.slots, 0) };
}

export function planDutyWindow(params: PlanDutyWindowParams): PlanDutyWindowResult {
  const { window, teachers } = params;
  const seed = params.seed ?? 1;
  const inWindow = examsInWindow(window, params.exams);
  const locked = params.lockedExamIds ?? defaultLockedExamIds(inWindow, params.existingRosters);

  const rosterById = new Map(params.existingRosters.map((r) => [r.id, r]));
  const activeRosterByExam = new Map<string, DutyRoster>();
  for (const exam of params.exams) {
    const roster = exam.activeDutyRosterId ? rosterById.get(exam.activeDutyRosterId) : undefined;
    if (roster) activeRosterByExam.set(exam.id, roster);
  }

  // Decide which window exams are planned now vs kept vs skipped.
  const skipped: SkippedExam[] = [];
  const toPlan: Exam[] = [];
  const kept: Exam[] = [];
  for (const exam of inWindow) {
    if (locked.has(exam.id) && activeRosterByExam.has(exam.id)) {
      kept.push(exam);
      continue;
    }
    const allocation = params.allocationsByExamId[exam.id];
    if (!allocation) {
      skipped.push({ examId: exam.id, examName: exam.name, reason: 'No seating generated yet' });
      if (activeRosterByExam.has(exam.id)) kept.push(exam);
      continue;
    }
    if (Object.keys(occupancyFromAllocation(allocation)).length === 0) {
      skipped.push({ examId: exam.id, examName: exam.name, reason: 'Nobody is seated in any room' });
      if (activeRosterByExam.has(exam.id)) kept.push(exam);
      continue;
    }
    toPlan.push(exam);
    activeRosterByExam.delete(exam.id); // its old roster is being replaced
  }

  const loads = new Map<string, number>();
  const perDay = new Map<string, number>();
  const bump = (teacherId: string, date: string, by: number) => {
    loads.set(teacherId, (loads.get(teacherId) ?? 0) + by);
    const key = `${teacherId}|${date}`;
    perDay.set(key, (perDay.get(key) ?? 0) + by);
  };
  const load = (id: string) => loads.get(id) ?? 0;
  const dayCount = (id: string, date: string) => perDay.get(`${id}|${date}`) ?? 0;

  for (const exam of kept) {
    const roster = activeRosterByExam.get(exam.id);
    if (roster) for (const a of roster.assignments) bump(a.teacherId, exam.date, 1);
  }

  function busyElsewhere(teacherId: string, exam: Exam): boolean {
    for (const other of params.exams) {
      if (other.id === exam.id || !timingsOverlap(exam, other)) continue;
      const roster = activeRosterByExam.get(other.id);
      if (roster?.assignments.some((a) => a.teacherId === teacherId)) return true;
    }
    return false;
  }

  function hardEligible(teacher: Teacher, exam: Exam): boolean {
    if (!teacher.active) return false;
    const q = quotaFor(window, teacher.id);
    if (q.exempt) return false;
    if (q.max !== undefined && load(teacher.id) >= q.max) return false;
    if (window.maxPerDay && dayCount(teacher.id, exam.date) >= window.maxPerDay) return false;
    return !busyElsewhere(teacher.id, exam);
  }

  const planned: Array<{ exam: Exam; allocation: AllocationResult; roster: DutyRoster }> = [];

  toPlan.forEach((exam, index) => {
    const allocation = params.allocationsByExamId[exam.id]!;
    const rng = new SeededRandom(seed + index * 7919);
    const exclude = new Set(teachers.filter((t) => !hardEligible(t, exam)).map((t) => t.id));
    // Seeded shuffle first so ties are broken randomly but repeatably, then a stable sort by load.
    const ordered = rng.shuffle(teachers.slice()).sort((a, b) => load(a.id) - load(b.id));

    const previousVersions = params.existingRosters.filter((r) => r.examId === exam.id).length;
    const roster = allocateDuties({
      examId: exam.id,
      teachers,
      rooms: allocation.roomSnapshot,
      seatsPerInvigilator: window.studentsPerInvigilator,
      avoidOwnBranchInvigilation: window.avoidOwnBranchInvigilation,
      seatAllocation: allocation,
      excludeTeacherIds: exclude,
      seed: seed + index,
      version: previousVersions + 1,
      occupancy: occupancyFromAllocation(allocation),
      orderedTeachers: ordered,
      windowId: window.id,
    });
    for (const a of roster.assignments) bump(a.teacherId, exam.date, 1);
    activeRosterByExam.set(exam.id, roster);
    planned.push({ exam, allocation, roster });
  });

  // ---- Balancing pass: move a duty from the busiest teacher to the quietest wherever rules allow.
  const balanceTeachers = teachers.filter((t) => t.active && !quotaFor(window, t.id).exempt);
  const branchesByExam = new Map(planned.map((p) => [p.exam.id, buildBranchesInRoom(p.allocation)]));

  function canTake(candidate: Teacher, entry: (typeof planned)[number]): boolean {
    if (entry.roster.assignments.some((a) => a.teacherId === candidate.id)) return false;
    const q = quotaFor(window, candidate.id);
    if (q.max !== undefined && load(candidate.id) + 1 > q.max) return false;
    if (window.maxPerDay && dayCount(candidate.id, entry.exam.date) + 1 > window.maxPerDay) return false;
    return !busyElsewhere(candidate.id, entry.exam);
  }

  for (let guard = 0; guard < 5000; guard++) {
    const byLoad = balanceTeachers.slice().sort((a, b) => load(b.id) - load(a.id));
    let moved = false;
    outer: for (const busy of byLoad) {
      for (const quiet of byLoad.slice().reverse()) {
        if (load(busy.id) - load(quiet.id) < 2) break;
        for (const entry of planned) {
          const assignment = entry.roster.assignments.find((a) => a.teacherId === busy.id);
          if (!assignment) continue;
          if (!canTake(quiet, entry)) continue;
          if (window.avoidOwnBranchInvigilation && branchesByExam.get(entry.exam.id)?.get(assignment.roomId)?.has(quiet.branch)) continue;
          assignment.teacherId = quiet.id;
          bump(busy.id, entry.exam.date, -1);
          bump(quiet.id, entry.exam.date, 1);
          moved = true;
          break outer;
        }
      }
    }
    if (!moved) break;
  }

  // ---- Finalise rosters (unassigned list + validation reflect any balancing moves).
  for (const entry of planned) {
    const assigned = new Set(entry.roster.assignments.map((a) => a.teacherId));
    entry.roster.unassignedTeacherIds = teachers.filter((t) => t.active && !quotaFor(window, t.id).exempt && !assigned.has(t.id)).map((t) => t.id);
    const occupiedRooms = entry.allocation.roomSnapshot.filter((r) => r.enabled && (entry.roster.roomDutyTargets[r.id] ?? 0) > 0);
    entry.roster.validationReport = validateDutyRoster(entry.roster, teachers, occupiedRooms, branchesByExam.get(entry.exam.id) ?? new Map());
  }

  // ---- Report
  const keptRosters = kept.map((e) => activeRosterByExam.get(e.id)).filter((r): r is DutyRoster => !!r);
  const allRosters = [...planned.map((p) => p.roster), ...keptRosters];
  const totalSlots = allRosters.reduce((sum, r) => sum + Object.values(r.roomDutyTargets).reduce((a, b) => a + b, 0), 0);
  const filledSlots = allRosters.reduce((sum, r) => sum + r.assignments.length, 0);

  const stats: WindowTeacherStat[] = teachers
    .filter((t) => t.active)
    .map((t) => {
      const q = quotaFor(window, t.id);
      const duties = load(t.id);
      return {
        teacherId: t.id,
        name: t.name,
        branch: t.branch,
        duties,
        min: q.min,
        max: q.max,
        exempt: q.exempt,
        belowMin: !q.exempt && q.min !== undefined && duties < q.min,
        atMax: q.max !== undefined && duties >= q.max,
      };
    })
    .sort((a, b) => b.duties - a.duties || a.name.localeCompare(b.name));

  const eligibleLoads = stats.filter((s) => !s.exempt).map((s) => s.duties);
  const spread = eligibleLoads.length === 0 ? 0 : Math.max(...eligibleLoads) - Math.min(...eligibleLoads);

  const warnings: string[] = [];
  if (filledSlots < totalSlots) {
    warnings.push(
      `${totalSlots - filledSlots} duty slot(s) could not be filled - not enough teachers were free (max duties, per-day limit, overlapping sessions, exemptions or own-branch avoidance). Raise the limits or add teachers.`
    );
  }
  const below = stats.filter((s) => s.belowMin);
  if (below.length > 0) {
    warnings.push(`${below.length} teacher(s) are below their minimum duties: ${below.slice(0, 6).map((s) => `${s.name} (${s.duties}/${s.min})`).join(', ')}${below.length > 6 ? '…' : ''}.`);
  }
  if (spread > 1) {
    warnings.push(`Duties could not be made perfectly even (busiest ${spread} more than quietest) because of the limits above.`);
  }
  if (skipped.length > 0) {
    warnings.push(`${skipped.length} exam(s) in the window were skipped (no seating yet) - generate their seating, then run again.`);
  }

  return {
    rosters: planned.map((p) => p.roster),
    report: {
      windowId: window.id,
      examsInWindow: inWindow.length,
      examsPlanned: planned.length,
      examsKept: kept.length,
      skipped,
      totalSlots,
      filledSlots,
      unfilledSlots: Math.max(0, totalSlots - filledSlots),
      teachers: stats,
      spread,
      warnings,
    },
  };
}

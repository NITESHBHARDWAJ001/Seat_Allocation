import type { Exam } from '@exam-allocator/core';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True if two date+time ranges are on the same date and their times overlap. */
export function timingsOverlap(
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
): boolean {
  if (a.date !== b.date) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

export interface StudentSittingConflict {
  studentId: string;
  conflictingExamId: string;
  conflictingExamName: string;
}

/**
 * A student physically cannot sit two exams whose date+time overlap. Given a
 * candidate exam (its timing plus the student roster being considered - not
 * necessarily saved yet) and every other exam already in the system, returns
 * one entry per (student, other exam) pair where the student appears in both
 * rosters and the two exams overlap. Excludes the candidate's own id so
 * re-checking an exam being edited doesn't flag itself.
 */
export function findStudentSittingConflicts(
  candidate: { id?: string; date: string; startTime: string; endTime: string; studentIds: string[] },
  allExams: Exam[]
): StudentSittingConflict[] {
  if (!candidate.date || !candidate.startTime || !candidate.endTime || candidate.studentIds.length === 0) return [];
  const conflicts: StudentSittingConflict[] = [];
  const candidateStudentIds = new Set(candidate.studentIds);

  for (const other of allExams) {
    if (candidate.id && other.id === candidate.id) continue;
    if (!timingsOverlap(candidate, other)) continue;
    for (const studentId of other.studentIds) {
      if (candidateStudentIds.has(studentId)) {
        conflicts.push({ studentId, conflictingExamId: other.id, conflictingExamName: other.name });
      }
    }
  }
  return conflicts;
}

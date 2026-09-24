import { DEFAULT_INSTITUTION, generateId, normalizeRoll, type AttendanceEntry, type AttendanceMark, type ExamAttendance, type InstitutionProfile } from '../vendor/core/index.js';
import { attendanceRepository, settingsRepository } from './repositories.js';

export const UMC_REASONS = ['Copying', 'Mobile phone', 'Impersonation', 'Talking / passing chits', 'Other'];

export async function getOrCreateAttendance(examId: string): Promise<ExamAttendance> {
  const existing = await attendanceRepository.getByExamId(examId);
  if (existing) return existing;
  const now = new Date().toISOString();
  return attendanceRepository.create({ id: generateId('att'), examId, entries: {}, createdAt: now, updatedAt: now });
}

export interface MarkInput {
  rollNumber: string;
  mark: AttendanceMark;
  reason?: string;
  note?: string;
  name?: string;
  branch?: string;
}

/** Adds or replaces marks and persists. Returns the saved record. */
export async function applyMarks(attendance: ExamAttendance, marks: MarkInput[]): Promise<ExamAttendance> {
  const entries = { ...attendance.entries };
  const markedAt = new Date().toISOString();
  for (const m of marks) {
    const roll = normalizeRoll(m.rollNumber);
    if (!roll) continue;
    const entry: AttendanceEntry = { rollNumber: roll, mark: m.mark, markedAt };
    if (m.reason) entry.reason = m.reason;
    if (m.note) entry.note = m.note;
    if (m.name) entry.name = m.name;
    if (m.branch) entry.branch = m.branch;
    entries[roll] = entry;
  }
  return attendanceRepository.update(attendance.id, { entries, updatedAt: markedAt });
}

/** Back to present (removes the exception). */
export async function clearMarks(attendance: ExamAttendance, rolls: string[]): Promise<ExamAttendance> {
  const entries = { ...attendance.entries };
  for (const r of rolls) delete entries[normalizeRoll(r)];
  return attendanceRepository.update(attendance.id, { entries, updatedAt: new Date().toISOString() });
}

export async function setFinalized(attendance: ExamAttendance, finalized: boolean): Promise<ExamAttendance> {
  return attendanceRepository.update(attendance.id, { finalized, updatedAt: new Date().toISOString() });
}

/** Splits pasted text ("101, 102\n103 104;105") into normalized unique roll numbers. */
export function parseRollList(text: string): string[] {
  return [...new Set(text.split(/[\s,;|]+/).map(normalizeRoll).filter(Boolean))];
}

const INSTITUTION_KEY = 'institutionProfile';

export async function getInstitution(): Promise<InstitutionProfile> {
  return { ...DEFAULT_INSTITUTION, ...(await settingsRepository.get<InstitutionProfile>(INSTITUTION_KEY)) };
}

export async function saveInstitution(profile: InstitutionProfile): Promise<void> {
  await settingsRepository.set(INSTITUTION_KEY, profile);
}

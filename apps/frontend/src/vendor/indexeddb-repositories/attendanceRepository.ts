import { generateId, type AttendanceRepository, type ExamAttendance } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbAttendanceRepository implements AttendanceRepository {
  async getAll(): Promise<ExamAttendance[]> {
    const db = await getDb();
    return db.getAll('attendance');
  }

  async getById(id: string): Promise<ExamAttendance | undefined> {
    const db = await getDb();
    return db.get('attendance', id);
  }

  async getByExamId(examId: string): Promise<ExamAttendance | undefined> {
    const db = await getDb();
    const all = await db.getAllFromIndex('attendance', 'examId', examId);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  async create(attendance: ExamAttendance): Promise<ExamAttendance> {
    const db = await getDb();
    const withId = attendance.id ? attendance : { ...attendance, id: generateId('att') };
    await db.put('attendance', withId);
    return withId;
  }

  async update(id: string, patch: Partial<ExamAttendance>): Promise<ExamAttendance> {
    const db = await getDb();
    const existing = await db.get('attendance', id);
    if (!existing) throw new Error(`Attendance ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('attendance', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('attendance', id);
  }
}

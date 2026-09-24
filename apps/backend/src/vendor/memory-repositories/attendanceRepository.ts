import { generateId, type AttendanceRepository, type ExamAttendance } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryAttendanceRepository implements AttendanceRepository {
  private store: JsonFileStore<ExamAttendance>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<ExamAttendance>(filePath);
  }

  async getAll(): Promise<ExamAttendance[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<ExamAttendance | undefined> {
    return this.store.get(id);
  }

  async getByExamId(examId: string): Promise<ExamAttendance | undefined> {
    const all = await this.store.all();
    return all.filter((a) => a.examId === examId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  async create(attendance: ExamAttendance): Promise<ExamAttendance> {
    const withId = attendance.id ? attendance : { ...attendance, id: generateId('att') };
    return this.store.set(withId);
  }

  async update(id: string, patch: Partial<ExamAttendance>): Promise<ExamAttendance> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Attendance ${id} not found`);
    return this.store.set({ ...existing, ...patch, id });
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

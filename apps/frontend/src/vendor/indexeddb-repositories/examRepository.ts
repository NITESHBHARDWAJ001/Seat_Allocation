import { generateId, type Exam, type ExamRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbExamRepository implements ExamRepository {
  async getAll(): Promise<Exam[]> {
    const db = await getDb();
    return db.getAll('exams');
  }

  async getById(id: string): Promise<Exam | undefined> {
    const db = await getDb();
    return db.get('exams', id);
  }

  async create(exam: Exam): Promise<Exam> {
    const db = await getDb();
    const withId = exam.id ? exam : { ...exam, id: generateId('exam') };
    await db.put('exams', withId);
    return withId;
  }

  async update(id: string, patch: Partial<Exam>): Promise<Exam> {
    const db = await getDb();
    const existing = await db.get('exams', id);
    if (!existing) throw new Error(`Exam ${id} not found`);
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await db.put('exams', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('exams', id);
  }
}

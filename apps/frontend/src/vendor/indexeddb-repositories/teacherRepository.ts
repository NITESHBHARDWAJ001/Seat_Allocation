import { generateId, type Teacher, type TeacherRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbTeacherRepository implements TeacherRepository {
  async getAll(): Promise<Teacher[]> {
    const db = await getDb();
    return db.getAll('teachers');
  }

  async getById(id: string): Promise<Teacher | undefined> {
    const db = await getDb();
    return db.get('teachers', id);
  }

  async create(teacher: Teacher): Promise<Teacher> {
    const db = await getDb();
    const withId = teacher.id ? teacher : { ...teacher, id: generateId('teacher') };
    await db.put('teachers', withId);
    return withId;
  }

  async createMany(teachers: Teacher[]): Promise<Teacher[]> {
    const db = await getDb();
    const tx = db.transaction('teachers', 'readwrite');
    const withIds = teachers.map((t) => (t.id ? t : { ...t, id: generateId('teacher') }));
    await Promise.all(withIds.map((t) => tx.store.put(t)));
    await tx.done;
    return withIds;
  }

  async update(id: string, patch: Partial<Teacher>): Promise<Teacher> {
    const db = await getDb();
    const existing = await db.get('teachers', id);
    if (!existing) throw new Error(`Teacher ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('teachers', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('teachers', id);
  }
}

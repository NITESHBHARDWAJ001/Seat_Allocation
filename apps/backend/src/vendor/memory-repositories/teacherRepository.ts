import { generateId, type Teacher, type TeacherRepository } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryTeacherRepository implements TeacherRepository {
  private store: JsonFileStore<Teacher>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Teacher>(filePath);
  }

  async getAll(): Promise<Teacher[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<Teacher | undefined> {
    return this.store.get(id);
  }

  async create(teacher: Teacher): Promise<Teacher> {
    const withId = teacher.id ? teacher : { ...teacher, id: generateId('teacher') };
    return this.store.set(withId);
  }

  async createMany(teachers: Teacher[]): Promise<Teacher[]> {
    const withIds = teachers.map((t) => (t.id ? t : { ...t, id: generateId('teacher') }));
    return this.store.setMany(withIds);
  }

  async update(id: string, patch: Partial<Teacher>): Promise<Teacher> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Teacher ${id} not found`);
    const updated = { ...existing, ...patch, id };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

import { generateId, type Exam, type ExamRepository } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryExamRepository implements ExamRepository {
  private store: JsonFileStore<Exam>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Exam>(filePath);
  }

  async getAll(): Promise<Exam[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<Exam | undefined> {
    return this.store.get(id);
  }

  async create(exam: Exam): Promise<Exam> {
    const withId = exam.id ? exam : { ...exam, id: generateId('exam') };
    return this.store.set(withId);
  }

  async update(id: string, patch: Partial<Exam>): Promise<Exam> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Exam ${id} not found`);
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

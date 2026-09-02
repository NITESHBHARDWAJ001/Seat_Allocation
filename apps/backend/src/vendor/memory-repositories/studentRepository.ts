import { generateId, type Student, type StudentQuery, type StudentRepository } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryStudentRepository implements StudentRepository {
  private store: JsonFileStore<Student>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Student>(filePath);
  }

  async getAll(): Promise<Student[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<Student | undefined> {
    return this.store.get(id);
  }

  async query(q: StudentQuery): Promise<Student[]> {
    let students = await this.store.all();
    if (q.branch) students = students.filter((s) => s.branch === q.branch);
    if (q.year !== undefined) students = students.filter((s) => s.year === q.year);
    if (q.section) students = students.filter((s) => s.section === q.section);
    if (q.activeOnly) students = students.filter((s) => s.active);
    if (q.search) {
      const term = q.search.toLowerCase();
      students = students.filter(
        (s) => s.rollNumber.toLowerCase().includes(term) || s.name.toLowerCase().includes(term)
      );
    }
    return students;
  }

  async create(student: Student): Promise<Student> {
    const withId = student.id ? student : { ...student, id: generateId('student') };
    return this.store.set(withId);
  }

  async createMany(students: Student[]): Promise<Student[]> {
    const withIds = students.map((s) => (s.id ? s : { ...s, id: generateId('student') }));
    return this.store.setMany(withIds);
  }

  async update(id: string, patch: Partial<Student>): Promise<Student> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Student ${id} not found`);
    const updated = { ...existing, ...patch, id };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }

  async findDuplicateRollNumbers(): Promise<string[]> {
    const students = await this.store.all();
    const counts = new Map<string, number>();
    for (const s of students) counts.set(s.rollNumber, (counts.get(s.rollNumber) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).map(([roll]) => roll);
  }
}

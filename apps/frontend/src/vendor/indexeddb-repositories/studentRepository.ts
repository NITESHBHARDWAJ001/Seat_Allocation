import { generateId, type Student, type StudentQuery, type StudentRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbStudentRepository implements StudentRepository {
  async getAll(): Promise<Student[]> {
    const db = await getDb();
    return db.getAll('students');
  }

  async getById(id: string): Promise<Student | undefined> {
    const db = await getDb();
    return db.get('students', id);
  }

  async query(q: StudentQuery): Promise<Student[]> {
    let students = await this.getAll();
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
    const db = await getDb();
    const withId = student.id ? student : { ...student, id: generateId('student') };
    await db.put('students', withId);
    return withId;
  }

  async createMany(students: Student[]): Promise<Student[]> {
    const db = await getDb();
    const tx = db.transaction('students', 'readwrite');
    const withIds = students.map((s) => (s.id ? s : { ...s, id: generateId('student') }));
    await Promise.all(withIds.map((s) => tx.store.put(s)));
    await tx.done;
    return withIds;
  }

  async update(id: string, patch: Partial<Student>): Promise<Student> {
    const db = await getDb();
    const existing = await db.get('students', id);
    if (!existing) throw new Error(`Student ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('students', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('students', id);
  }

  async findDuplicateRollNumbers(): Promise<string[]> {
    const students = await this.getAll();
    const counts = new Map<string, number>();
    for (const s of students) counts.set(s.rollNumber, (counts.get(s.rollNumber) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).map(([roll]) => roll);
  }
}

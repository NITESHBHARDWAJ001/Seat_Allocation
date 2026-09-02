import type { sheets_v4 } from 'googleapis';
import { generateId, type Student, type StudentQuery, type StudentRepository } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'rollNumber', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'branch', type: 'string' },
  { key: 'year', type: 'number' },
  { key: 'section', type: 'string' },
  { key: 'semester', type: 'number', optional: true },
  { key: 'batch', type: 'string', optional: true },
  { key: 'gender', type: 'string', optional: true },
  { key: 'customAttributes', type: 'json', optional: true },
  { key: 'active', type: 'boolean' },
];

export class GoogleSheetsStudentRepository implements StudentRepository {
  private table: SheetTable<Student>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Students') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<Student[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<Student | undefined> {
    return this.table.getById(id);
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
    const withId = student.id ? student : { ...student, id: generateId('student') };
    return this.table.create(withId);
  }

  async createMany(students: Student[]): Promise<Student[]> {
    const withIds = students.map((s) => (s.id ? s : { ...s, id: generateId('student') }));
    return this.table.createMany(withIds);
  }

  async update(id: string, patch: Partial<Student>): Promise<Student> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }

  async findDuplicateRollNumbers(): Promise<string[]> {
    const students = await this.getAll();
    const counts = new Map<string, number>();
    for (const s of students) counts.set(s.rollNumber, (counts.get(s.rollNumber) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).map(([roll]) => roll);
  }
}

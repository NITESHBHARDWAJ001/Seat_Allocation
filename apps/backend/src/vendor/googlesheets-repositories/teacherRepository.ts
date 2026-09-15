import type { sheets_v4 } from 'googleapis';
import { generateId, type Teacher, type TeacherRepository } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'branch', type: 'string' },
  { key: 'email', type: 'string', optional: true },
  { key: 'phone', type: 'string', optional: true },
  { key: 'active', type: 'boolean' },
];

export class GoogleSheetsTeacherRepository implements TeacherRepository {
  private table: SheetTable<Teacher>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Teachers') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<Teacher[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<Teacher | undefined> {
    return this.table.getById(id);
  }

  async create(teacher: Teacher): Promise<Teacher> {
    const withId = teacher.id ? teacher : { ...teacher, id: generateId('teacher') };
    return this.table.create(withId);
  }

  async createMany(teachers: Teacher[]): Promise<Teacher[]> {
    const withIds = teachers.map((t) => (t.id ? t : { ...t, id: generateId('teacher') }));
    return this.table.createMany(withIds);
  }

  async update(id: string, patch: Partial<Teacher>): Promise<Teacher> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }
}

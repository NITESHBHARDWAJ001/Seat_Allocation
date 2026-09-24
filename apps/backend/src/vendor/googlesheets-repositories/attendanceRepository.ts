import type { sheets_v4 } from 'googleapis';
import { generateId, type AttendanceRepository, type ExamAttendance } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'examId', type: 'string' },
  { key: 'entries', type: 'json' },
  { key: 'finalized', type: 'boolean', optional: true },
  { key: 'createdAt', type: 'string' },
  { key: 'updatedAt', type: 'string' },
];

export class GoogleSheetsAttendanceRepository implements AttendanceRepository {
  private table: SheetTable<ExamAttendance>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Attendance') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<ExamAttendance[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<ExamAttendance | undefined> {
    return this.table.getById(id);
  }

  async getByExamId(examId: string): Promise<ExamAttendance | undefined> {
    const all = await this.getAll();
    return all.filter((a) => a.examId === examId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  async create(attendance: ExamAttendance): Promise<ExamAttendance> {
    const withId = attendance.id ? attendance : { ...attendance, id: generateId('att') };
    return this.table.create(withId);
  }

  async update(id: string, patch: Partial<ExamAttendance>): Promise<ExamAttendance> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }
}

import type { sheets_v4 } from 'googleapis';
import { generateId, type Exam, type ExamRepository } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'date', type: 'string' },
  { key: 'startTime', type: 'string' },
  { key: 'endTime', type: 'string' },
  { key: 'studentIds', type: 'json' },
  { key: 'roomIds', type: 'json' },
  { key: 'ruleConfig', type: 'json' },
  { key: 'allocationIds', type: 'json' },
  { key: 'activeAllocationId', type: 'string', optional: true },
  { key: 'createdAt', type: 'string' },
  { key: 'updatedAt', type: 'string' },
];

export class GoogleSheetsExamRepository implements ExamRepository {
  private table: SheetTable<Exam>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Exams') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<Exam[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<Exam | undefined> {
    return this.table.getById(id);
  }

  async create(exam: Exam): Promise<Exam> {
    const withId = exam.id ? exam : { ...exam, id: generateId('exam') };
    return this.table.create(withId);
  }

  async update(id: string, patch: Partial<Exam>): Promise<Exam> {
    return this.table.update(id, { ...patch, updatedAt: new Date().toISOString() });
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }
}

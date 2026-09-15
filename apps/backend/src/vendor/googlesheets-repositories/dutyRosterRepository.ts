import type { sheets_v4 } from 'googleapis';
import { generateId, type DutyRoster, type DutyRosterRepository } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'examId', type: 'string' },
  { key: 'generatedAt', type: 'string' },
  { key: 'seed', type: 'number' },
  { key: 'seatsPerInvigilator', type: 'number' },
  { key: 'roomDutyTargets', type: 'json' },
  { key: 'maxDutiesPerDay', type: 'number', optional: true },
  { key: 'maxDutiesTotal', type: 'number', optional: true },
  { key: 'avoidOwnBranchInvigilation', type: 'boolean' },
  { key: 'assignments', type: 'json' },
  { key: 'manualOverrides', type: 'json' },
  { key: 'unassignedTeacherIds', type: 'json' },
  { key: 'understaffedRoomIds', type: 'json' },
  { key: 'validationReport', type: 'json' },
  { key: 'version', type: 'number' },
];

export class GoogleSheetsDutyRosterRepository implements DutyRosterRepository {
  private table: SheetTable<DutyRoster>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'DutyRosters') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<DutyRoster[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<DutyRoster | undefined> {
    return this.table.getById(id);
  }

  async getByExamId(examId: string): Promise<DutyRoster[]> {
    const all = await this.getAll();
    return all.filter((r) => r.examId === examId).sort((a, b) => b.version - a.version);
  }

  async create(roster: DutyRoster): Promise<DutyRoster> {
    const withId = roster.id ? roster : { ...roster, id: generateId('duty') };
    return this.table.create(withId);
  }

  async update(id: string, patch: Partial<DutyRoster>): Promise<DutyRoster> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }
}

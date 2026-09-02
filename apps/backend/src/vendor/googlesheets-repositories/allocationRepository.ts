import type { sheets_v4 } from 'googleapis';
import { generateId, type AllocationRepository, type AllocationResult } from '../core/index.js';
import { SheetTable, type FieldSpec } from './sheetTable.js';

const FIELDS: FieldSpec[] = [
  { key: 'id', type: 'string' },
  { key: 'examId', type: 'string' },
  { key: 'generatedAt', type: 'string' },
  { key: 'seed', type: 'number' },
  { key: 'algorithmVersion', type: 'string' },
  { key: 'configSnapshot', type: 'json' },
  { key: 'studentSnapshot', type: 'json' },
  { key: 'roomSnapshot', type: 'json' },
  { key: 'assignments', type: 'json' },
  { key: 'manualOverrides', type: 'json' },
  { key: 'unallocatedStudentIds', type: 'json' },
  { key: 'validationReport', type: 'json' },
  { key: 'score', type: 'number' },
  { key: 'status', type: 'string' },
  { key: 'feasibility', type: 'json' },
  { key: 'relaxedRules', type: 'json' },
  { key: 'version', type: 'number' },
  { key: 'parentAllocationId', type: 'string', optional: true },
];

/**
 * Implements the full interface for consistency with the other Sheets
 * repositories, but note: AllocationResult snapshots the entire student +
 * room dataset plus the validation report, which can produce a very large
 * JSON blob per row at real college scale (1,000+ students). Google Sheets
 * cells have a ~50,000 character limit and the API has per-minute quotas -
 * this is fine for demos/small exams, but IndexedDB (frontend) or a real
 * database (backend) remain the recommended store for allocation results at
 * production scale.
 */
export class GoogleSheetsAllocationRepository implements AllocationRepository {
  private table: SheetTable<AllocationResult>;

  constructor(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName = 'Allocations') {
    this.table = new SheetTable(sheets, spreadsheetId, tabName, FIELDS);
  }

  async getAll(): Promise<AllocationResult[]> {
    return this.table.getAll();
  }

  async getById(id: string): Promise<AllocationResult | undefined> {
    return this.table.getById(id);
  }

  async getByExamId(examId: string): Promise<AllocationResult[]> {
    const all = await this.getAll();
    return all.filter((a) => a.examId === examId).sort((a, b) => b.version - a.version);
  }

  async create(allocation: AllocationResult): Promise<AllocationResult> {
    const withId = allocation.id ? allocation : { ...allocation, id: generateId('allocresult') };
    return this.table.create(withId);
  }

  async update(id: string, patch: Partial<AllocationResult>): Promise<AllocationResult> {
    return this.table.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    return this.table.remove(id);
  }
}

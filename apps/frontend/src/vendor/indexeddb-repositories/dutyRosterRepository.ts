import { generateId, type DutyRoster, type DutyRosterRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbDutyRosterRepository implements DutyRosterRepository {
  async getAll(): Promise<DutyRoster[]> {
    const db = await getDb();
    return db.getAll('dutyRosters');
  }

  async getById(id: string): Promise<DutyRoster | undefined> {
    const db = await getDb();
    return db.get('dutyRosters', id);
  }

  async getByExamId(examId: string): Promise<DutyRoster[]> {
    const db = await getDb();
    const results = await db.getAllFromIndex('dutyRosters', 'examId', examId);
    return results.sort((a, b) => b.version - a.version);
  }

  async create(roster: DutyRoster): Promise<DutyRoster> {
    const db = await getDb();
    const withId = roster.id ? roster : { ...roster, id: generateId('duty') };
    await db.put('dutyRosters', withId);
    return withId;
  }

  async update(id: string, patch: Partial<DutyRoster>): Promise<DutyRoster> {
    const db = await getDb();
    const existing = await db.get('dutyRosters', id);
    if (!existing) throw new Error(`Duty roster ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('dutyRosters', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('dutyRosters', id);
  }
}

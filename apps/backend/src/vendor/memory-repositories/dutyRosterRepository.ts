import { generateId, type DutyRoster, type DutyRosterRepository } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryDutyRosterRepository implements DutyRosterRepository {
  private store: JsonFileStore<DutyRoster>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<DutyRoster>(filePath);
  }

  async getAll(): Promise<DutyRoster[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<DutyRoster | undefined> {
    return this.store.get(id);
  }

  async getByExamId(examId: string): Promise<DutyRoster[]> {
    const all = await this.store.all();
    return all.filter((r) => r.examId === examId).sort((a, b) => b.version - a.version);
  }

  async create(roster: DutyRoster): Promise<DutyRoster> {
    const withId = roster.id ? roster : { ...roster, id: generateId('duty') };
    return this.store.set(withId);
  }

  async update(id: string, patch: Partial<DutyRoster>): Promise<DutyRoster> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Duty roster ${id} not found`);
    const updated = { ...existing, ...patch, id };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

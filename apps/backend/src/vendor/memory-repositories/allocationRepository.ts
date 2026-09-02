import { generateId, type AllocationRepository, type AllocationResult } from '../core/index.js';
import { JsonFileStore } from './jsonFileStore.js';

export class MemoryAllocationRepository implements AllocationRepository {
  private store: JsonFileStore<AllocationResult>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<AllocationResult>(filePath);
  }

  async getAll(): Promise<AllocationResult[]> {
    return this.store.all();
  }

  async getById(id: string): Promise<AllocationResult | undefined> {
    return this.store.get(id);
  }

  async getByExamId(examId: string): Promise<AllocationResult[]> {
    const all = await this.store.all();
    return all.filter((a) => a.examId === examId).sort((a, b) => b.version - a.version);
  }

  async create(allocation: AllocationResult): Promise<AllocationResult> {
    const withId = allocation.id ? allocation : { ...allocation, id: generateId('allocresult') };
    return this.store.set(withId);
  }

  async update(id: string, patch: Partial<AllocationResult>): Promise<AllocationResult> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Allocation ${id} not found`);
    const updated = { ...existing, ...patch, id };
    return this.store.set(updated);
  }

  async remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

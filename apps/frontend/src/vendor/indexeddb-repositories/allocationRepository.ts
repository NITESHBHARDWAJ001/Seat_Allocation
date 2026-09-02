import { generateId, type AllocationRepository, type AllocationResult } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbAllocationRepository implements AllocationRepository {
  async getAll(): Promise<AllocationResult[]> {
    const db = await getDb();
    return db.getAll('allocations');
  }

  async getById(id: string): Promise<AllocationResult | undefined> {
    const db = await getDb();
    return db.get('allocations', id);
  }

  async getByExamId(examId: string): Promise<AllocationResult[]> {
    const db = await getDb();
    const results = await db.getAllFromIndex('allocations', 'examId', examId);
    return results.sort((a, b) => b.version - a.version);
  }

  async create(allocation: AllocationResult): Promise<AllocationResult> {
    const db = await getDb();
    const withId = allocation.id ? allocation : { ...allocation, id: generateId('allocresult') };
    await db.put('allocations', withId);
    return withId;
  }

  async update(id: string, patch: Partial<AllocationResult>): Promise<AllocationResult> {
    const db = await getDb();
    const existing = await db.get('allocations', id);
    if (!existing) throw new Error(`Allocation ${id} not found`);
    const updated = { ...existing, ...patch, id };
    await db.put('allocations', updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('allocations', id);
  }
}

import type { SettingsRepository } from '../core/index.js';
import { getDb } from './db.js';

export class IndexedDbSettingsRepository implements SettingsRepository {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const db = await getDb();
    const record = await db.get('settings', key);
    return record?.value as T | undefined;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const db = await getDb();
    await db.put('settings', { key, value });
  }

  async remove(key: string): Promise<void> {
    const db = await getDb();
    await db.delete('settings', key);
  }
}

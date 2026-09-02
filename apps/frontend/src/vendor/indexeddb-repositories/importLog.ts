import { generateId } from '../core/index.js';
import { getDb, type ImportRecord } from './db.js';

export async function logImport(kind: ImportRecord['kind'], count: number, source: string): Promise<ImportRecord> {
  const db = await getDb();
  const record: ImportRecord = { id: generateId('import'), at: new Date().toISOString(), kind, count, source };
  await db.put('imports', record);
  return record;
}

export async function getImportLog(): Promise<ImportRecord[]> {
  const db = await getDb();
  const all = await db.getAll('imports');
  return all.sort((a, b) => (a.at < b.at ? 1 : -1));
}

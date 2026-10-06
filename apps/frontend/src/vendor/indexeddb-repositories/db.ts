import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AllocationResult, DutyRoster, Exam, ExamAttendance, Room, Student, Teacher } from '../core/index.js';

export interface ImportRecord {
  id: string;
  at: string;
  kind: 'students' | 'rooms';
  count: number;
  source: string;
}

export interface OutboxRecord {
  key: string; // `${entity}:${id}`
  entity: string;
  id: string;
  op: 'put' | 'delete';
  at: string;
}

interface SettingsRecord {
  key: string;
  value: unknown;
}

export interface ExamAllocatorDB extends DBSchema {
  students: {
    key: string;
    value: Student;
    indexes: { rollNumber: string; branch: string; year: number; section: string };
  };
  rooms: {
    key: string;
    value: Room;
    indexes: { name: string };
  };
  exams: {
    key: string;
    value: Exam;
  };
  allocations: {
    key: string;
    value: AllocationResult;
    indexes: { examId: string };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
  imports: {
    key: string;
    value: ImportRecord;
  };
  teachers: {
    key: string;
    value: Teacher;
    indexes: { branch: string };
  };
  dutyRosters: {
    key: string;
    value: DutyRoster;
    indexes: { examId: string };
  };
  attendance: {
    key: string;
    value: ExamAttendance;
    indexes: { examId: string };
  };
  /** Local changes not yet sent to the server (one entry per record, latest state is read at sync time). */
  outbox: {
    key: string;
    value: OutboxRecord;
  };
  /** Sync bookkeeping: pull cursor, last sync time, per-exam attendance snapshots. */
  syncMeta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const BASE_DB_NAME = 'exam-allocator-db';
const DB_VERSION = 4;
let dbName = BASE_DB_NAME;

/**
 * Each signed-in organization gets its own local database (exam-allocator-db__<org>), so two colleges using the
 * same browser never see each other's data. null = the original single database used when the app runs
 * without a server. Call before the first repository use (the app does this at startup).
 */
export function setDbNamespace(namespace: string | null): void {
  const next = namespace ? `${BASE_DB_NAME}__${namespace}` : BASE_DB_NAME;
  if (next === dbName) return;
  dbName = next;
  if (dbPromise) dbPromise.then((db) => db.close()).catch(() => undefined);
  dbPromise = null;
}

export const currentDbName = (): string => dbName;
export const LOCAL_ONLY_DB_NAME = BASE_DB_NAME;

let dbPromise: Promise<IDBPDatabase<ExamAllocatorDB>> | null = null;

/**
 * Opens (or returns the cached handle to) the app's IndexedDB database.
 * Wrapped so init failures surface as a clear error instead of an unhandled
 * rejection deep in a repository call (spec §67: handle DB init/transaction
 * failures explicitly).
 */
export function getDb(): Promise<IDBPDatabase<ExamAllocatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExamAllocatorDB>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('students')) {
          const store = db.createObjectStore('students', { keyPath: 'id' });
          store.createIndex('rollNumber', 'rollNumber');
          store.createIndex('branch', 'branch');
          store.createIndex('year', 'year');
          store.createIndex('section', 'section');
        }
        if (!db.objectStoreNames.contains('rooms')) {
          const store = db.createObjectStore('rooms', { keyPath: 'id' });
          store.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('exams')) {
          db.createObjectStore('exams', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('allocations')) {
          const store = db.createObjectStore('allocations', { keyPath: 'id' });
          store.createIndex('examId', 'examId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('imports')) {
          db.createObjectStore('imports', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('teachers')) {
          const store = db.createObjectStore('teachers', { keyPath: 'id' });
          store.createIndex('branch', 'branch');
        }
        if (!db.objectStoreNames.contains('dutyRosters')) {
          const store = db.createObjectStore('dutyRosters', { keyPath: 'id' });
          store.createIndex('examId', 'examId');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('attendance')) {
          const store = db.createObjectStore('attendance', { keyPath: 'id' });
          store.createIndex('examId', 'examId');
        }
      },
      blocked() {
        console.warn('IndexedDB upgrade blocked by another open tab of this app.');
      },
      blocking() {
        console.warn('This tab is blocking an IndexedDB upgrade in another tab; consider reloading.');
      },
      terminated() {
        console.error('IndexedDB connection terminated unexpectedly.');
        dbPromise = null;
      },
    }).catch((err: unknown) => {
      dbPromise = null;
      throw new Error(`Failed to open IndexedDB (${dbName}): ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return dbPromise;
}

/** Dev-only helper: wipes all local data so a fresh demo dataset can be seeded. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

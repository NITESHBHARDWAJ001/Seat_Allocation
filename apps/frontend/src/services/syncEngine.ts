import {
  batchChanges,
  diffAttendance,
  mergePulledMarks,
  parseAttendanceMarkId,
  SYNCED_SETTING_KEYS,
  type PulledMark,
  type PushChange,
  type SyncedMarks,
} from '../vendor/allocation-engine/index.js';
import { type AttendanceEntry, type ExamAttendance } from '../vendor/core/index.js';
import { getDb, type OutboxRecord } from '../vendor/indexeddb-repositories/index.js';
import { apiFetch } from './auth.js';
import { rawRepositories as raw } from './repositories.js';

/**
 * Background sync between this browser's local database (what the app really works on) and the server.
 * Always in small pieces: only records that changed, at most a few hundred (or ~1 MB) per request, and pulls page by
 * page from a cursor. It can stop at any point (network drop, closed tab) and the next run simply continues:
 * every write is "insert or update by id", and the cursor / outbox only advance after a piece is safely stored.
 */

export interface SyncResult {
  pushed: number;
  rejected: number;
  pulled: number;
  /** true when data from the server changed something locally (screens should reload) */
  changedLocal: boolean;
}

const PULL_PAGE = 300;
const ENTITY_REPOS = ['students', 'rooms', 'teachers', 'exams', 'allocations', 'dutyRosters'] as const;
type PlainEntity = (typeof ENTITY_REPOS)[number];

// ------------------------------------------------------------------------------------------------ meta store
async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('syncMeta', key))?.value as T | undefined;
}
async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('syncMeta', { key, value });
}

/**
 * Identifies this browser's copy of the data to the server so it is not sent back its own uploads. Kept inside the
 * local database on purpose: if the local data is ever wiped, the browser gets a new id and re-downloads everything.
 */
async function deviceId(): Promise<string> {
  let id = await getMeta<string>('deviceId');
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await setMeta('deviceId', id);
  }
  return id;
}

export async function getSyncMeta(): Promise<{ lastSyncAt: string | null; cursor: string }> {
  return { lastSyncAt: (await getMeta<string>('lastSyncAt')) ?? null, cursor: (await getMeta<string>('cursor')) ?? '0' };
}

export async function countPending(): Promise<number> {
  const db = await getDb();
  return db.count('outbox');
}

// ------------------------------------------------------------------------------------------------ push
interface Pending {
  change: PushChange;
  /** outbox rows this change settles once the server has it */
  outboxKeys: string[];
}

async function loadPlain(entity: PlainEntity, ids: string[]): Promise<Map<string, unknown>> {
  const repo = raw[entity] as { getById(id: string): Promise<unknown>; getAll(): Promise<any[]> };
  const out = new Map<string, unknown>();
  if (ids.length > 60) {
    const wanted = new Set(ids);
    for (const r of await repo.getAll()) if (wanted.has(r.id)) out.set(r.id, r);
  } else {
    for (const id of ids) {
      const r = await repo.getById(id);
      if (r) out.set(id, r);
    }
  }
  return out;
}

async function buildPending(items: OutboxRecord[]): Promise<{ pending: Pending[]; attendanceSnapshots: Map<string, SyncedMarks> }> {
  const pending: Pending[] = [];
  const attendanceSnapshots = new Map<string, SyncedMarks>();

  for (const entity of ENTITY_REPOS) {
    const rows = items.filter((i) => i.entity === entity);
    const puts = rows.filter((r) => r.op === 'put');
    const loaded = await loadPlain(entity, puts.map((r) => r.id));
    for (const row of rows) {
      const record = row.op === 'put' ? loaded.get(row.id) : undefined;
      pending.push({ change: { entity, id: row.id, data: record ?? null }, outboxKeys: [row.key] });
    }
  }

  for (const row of items.filter((i) => i.entity === 'settings')) {
    const value = row.op === 'put' ? await raw.settings.get(row.id) : undefined;
    pending.push({ change: { entity: 'settings', id: row.id, data: value === undefined ? null : { key: row.id, value } }, outboxKeys: [row.key] });
  }

  for (const row of items.filter((i) => i.entity === 'attendance')) {
    const examId = row.id;
    const local = row.op === 'put' ? await raw.attendance.getByExamId(examId) : undefined;
    const synced = (await getMeta<SyncedMarks>(`att:${examId}`)) ?? {};
    const diff = diffAttendance(examId, local?.entries ?? {}, synced);
    attendanceSnapshots.set(examId, diff.nextSynced);
    diff.changes.forEach((c) => pending.push({ change: c, outboxKeys: [] }));
    // per-exam flags (finalized) travel as one small record next to the per-roll marks
    pending.push({ change: { entity: 'attendance', id: examId, data: local ? { examId, finalized: !!local.finalized } : null }, outboxKeys: [row.key] }); // pushed last, so the row is settled only once the marks before it are stored
  }
  return { pending, attendanceSnapshots };
}

async function pushPhase(): Promise<{ pushed: number; rejected: number }> {
  const db = await getDb();
  const items = await db.getAll('outbox');
  if (items.length === 0) return { pushed: 0, rejected: 0 };
  const { pending, attendanceSnapshots } = await buildPending(items);
  const byChange = new Map(pending.map((p) => [p.change, p] as const));

  const device = await deviceId();
  let pushed = 0;
  let rejected = 0;
  for (const batch of batchChanges(pending.map((p) => p.change))) {
    const res = await apiFetch<{ applied: number; rejected: Array<{ entity: string; id: string; reason: string }> }>('/sync/push', { method: 'POST', body: { changes: batch, deviceId: device } });
    pushed += res.applied;
    rejected += res.rejected.length;
    // Settled outbox rows are removed only if the record was not edited again while the request was in flight.
    const tx = db.transaction('outbox', 'readwrite');
    for (const change of batch) {
      for (const key of byChange.get(change)?.outboxKeys ?? []) {
        const row = await tx.store.get(key);
        const sent = items.find((i) => i.key === key);
        if (row && sent && row.at === sent.at) await tx.store.delete(key);
      }
    }
    await tx.done;
  }
  for (const [examId, snapshot] of attendanceSnapshots) await setMeta(`att:${examId}`, snapshot);
  return { pushed, rejected };
}

// ------------------------------------------------------------------------------------------------ pull
interface PulledRecord {
  entity: string;
  id: string;
  data: any;
  deleted: boolean;
  seq: string;
}

async function applyPage(records: PulledRecord[]): Promise<boolean> {
  const db = await getDb();
  const pendingKeys = new Set((await db.getAllKeys('outbox')) as string[]);
  let changed = false;
  const marksByExam = new Map<string, PulledMark[]>();
  const flagsByExam = new Map<string, boolean>();

  for (const r of records) {
    const key = `${r.entity}:${r.id}`;
    if ((ENTITY_REPOS as readonly string[]).includes(r.entity)) {
      if (pendingKeys.has(key)) continue; // a newer local edit is waiting to be pushed; it will win on the next push
      const repo = raw[r.entity as PlainEntity] as any;
      if (r.deleted || !r.data) await repo.remove(r.id).catch(() => undefined);
      else await repo.create(r.data);
      changed = true;
    } else if (r.entity === 'settings') {
      if (pendingKeys.has(key) || !(SYNCED_SETTING_KEYS as readonly string[]).includes(r.id)) continue;
      if (r.deleted || !r.data) await raw.settings.remove(r.id);
      else await raw.settings.set(r.id, r.data.value);
      changed = true;
    } else if (r.entity === 'attendanceMark') {
      const parsed = parseAttendanceMarkId(r.id);
      if (!parsed) continue;
      const list = marksByExam.get(parsed.examId) ?? [];
      list.push({ roll: parsed.roll, entry: r.deleted || !r.data ? null : (r.data as AttendanceEntry) });
      marksByExam.set(parsed.examId, list);
    } else if (r.entity === 'attendance') {
      if (!pendingKeys.has(key) && !r.deleted && r.data) flagsByExam.set(r.id, !!r.data.finalized);
    }
  }

  const examIds = new Set([...marksByExam.keys(), ...flagsByExam.keys()]);
  for (const examId of examIds) {
    let local = await raw.attendance.getByExamId(examId);
    const now = new Date().toISOString();
    let dirty = false;
    if (!local) {
      local = { id: `att_${examId}`, examId, entries: {}, createdAt: now, updatedAt: now } satisfies ExamAttendance;
      dirty = true;
    }
    const marks = marksByExam.get(examId);
    if (marks) {
      const synced = (await getMeta<SyncedMarks>(`att:${examId}`)) ?? {};
      const merged = mergePulledMarks(local.entries, synced, marks);
      if (merged.changed > 0) {
        local = { ...local, entries: merged.entries, updatedAt: now };
        dirty = true;
      }
      await setMeta(`att:${examId}`, merged.synced);
    }
    if (flagsByExam.has(examId) && !!local.finalized !== flagsByExam.get(examId)) {
      local = { ...local, finalized: flagsByExam.get(examId), updatedAt: now };
      dirty = true;
    }
    if (dirty) {
      await raw.attendance.create(local);
      changed = true;
    }
  }
  return changed;
}

async function pullPhase(): Promise<{ pulled: number; changed: boolean }> {
  let cursor = (await getMeta<string>('cursor')) ?? '0';
  const device = await deviceId();
  let pulled = 0;
  let changed = false;
  for (;;) {
    const page = await apiFetch<{ records: PulledRecord[]; next: string; hasMore: boolean }>(`/sync/pull?since=${cursor}&limit=${PULL_PAGE}&device=${encodeURIComponent(device)}`);
    if (page.records.length > 0) {
      if (await applyPage(page.records)) changed = true;
      pulled += page.records.length;
    }
    // the cursor only moves forward after the page has been applied locally
    cursor = page.next;
    await setMeta('cursor', cursor);
    if (!page.hasMore) break;
  }
  return { pulled, changed };
}

// ------------------------------------------------------------------------------------------------ public API
export async function runSync(opts: { canPush: boolean }): Promise<SyncResult> {
  const push = opts.canPush ? await pushPhase() : { pushed: 0, rejected: 0 };
  const pull = await pullPhase();
  await setMeta('lastSyncAt', new Date().toISOString());
  return { pushed: push.pushed, rejected: push.rejected, pulled: pull.pulled, changedLocal: pull.changed };
}

/**
 * One-off helper for an organization's first day: copies the data of this browser's original local-only database
 * into the current (organization) database through the tracked repositories, so it is uploaded by the next sync.
 */
export async function importLocalOnlyData(): Promise<{ copied: Record<string, number> }> {
  const { openDB } = await import('idb');
  const { LOCAL_ONLY_DB_NAME, currentDbName } = await import('../vendor/indexeddb-repositories/index.js');
  const { studentRepository, roomRepository, examRepository, allocationRepository, teacherRepository, dutyRosterRepository, attendanceRepository, settingsRepository } = await import('./repositories.js');
  if (currentDbName() === LOCAL_ONLY_DB_NAME) throw new Error('Already using the local-only database.');
  const legacy = await openDB(LOCAL_ONLY_DB_NAME);
  const copied: Record<string, number> = {};
  try {
    const copy = async (store: string, repo: { create(x: any): Promise<unknown> }) => {
      if (!legacy.objectStoreNames.contains(store)) return;
      const rows = await legacy.getAll(store);
      for (const r of rows) await repo.create(r);
      copied[store] = rows.length;
    };
    await copy('students', studentRepository);
    await copy('rooms', roomRepository);
    await copy('teachers', teacherRepository);
    await copy('exams', examRepository);
    await copy('allocations', allocationRepository);
    await copy('dutyRosters', dutyRosterRepository);
    await copy('attendance', attendanceRepository);
    if (legacy.objectStoreNames.contains('settings')) {
      let n = 0;
      for (const key of SYNCED_SETTING_KEYS) {
        const rec = await legacy.get('settings', key);
        if (rec) {
          await settingsRepository.set(key, rec.value);
          n++;
        }
      }
      copied.settings = n;
    }
  } finally {
    legacy.close();
  }
  return { copied };
}

/** Deterministic id for a per-exam attendance record, so every device converges on the same one. */
export const attendanceRecordId = (examId: string): string => `att_${examId}`;

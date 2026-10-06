import { roleCanWrite, SYNCED_SETTING_KEYS, type OrgRole } from '../vendor/allocation-engine/index.js';
import { getDb } from '../vendor/indexeddb-repositories/index.js';

/**
 * Change tracking for the background sync. Every repository the pages use is wrapped so that a successful write
 * also drops a small "this record changed" note into the local outbox. Pages, the solver and everything else keep
 * calling the same repository methods; in local-only mode tracking is switched off and nothing extra happens.
 * The outbox stores only WHICH record changed - the sync reads the record's latest state when it uploads, so many
 * quick edits to one record still travel as a single change.
 */

interface TrackingState {
  enabled: boolean;
  role: OrgRole | null;
}
const state: TrackingState = { enabled: false, role: null };

export function configureTracking(opts: { enabled: boolean; role: OrgRole | null }): void {
  state.enabled = opts.enabled;
  state.role = opts.role;
}

export class ReadOnlyRoleError extends Error {
  constructor(role: string, what: string) {
    super(`Your role (${role.replace('_', ' ')}) cannot change ${what}.`);
  }
}

const isSyncedSetting = (key: string): boolean => (SYNCED_SETTING_KEYS as readonly string[]).includes(key);

function guard(entity: string): void {
  if (!state.enabled || !state.role) return;
  if (!roleCanWrite(state.role, entity)) throw new ReadOnlyRoleError(state.role, entity === 'settings' ? 'these settings' : entity);
}

export async function markDirty(entity: string, ids: string[], op: 'put' | 'delete' = 'put'): Promise<void> {
  if (!state.enabled || ids.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction('outbox', 'readwrite');
    const at = new Date().toISOString();
    await Promise.all(ids.map((id) => tx.store.put({ key: `${entity}:${id}`, entity, id, op, at })));
    await tx.done;
  } catch (err) {
    // never let bookkeeping break a save; the next full sync still reconciles
    console.warn('[sync] could not record change', err);
  }
}

type Kind = 'plain' | 'settings' | 'attendance';

/** Wraps a repository so its writes are guarded by role and recorded for sync. Reads pass straight through. */
export function trackRepo<T extends object>(entity: string, repo: T, kind: Kind = 'plain'): T {
  const idOf = (r: any): string | undefined => (kind === 'attendance' ? r?.examId : r?.id);
  const ent = kind === 'attendance' ? 'attendance' : entity;
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      const fn = value.bind(target) as (...a: any[]) => Promise<any>;

      if (kind === 'settings') {
        if (prop === 'set') {
          return async (key: string, v: unknown) => {
            if (isSyncedSetting(key)) guard('settings');
            await fn(key, v);
            if (isSyncedSetting(key)) await markDirty('settings', [key]);
          };
        }
        if (prop === 'remove') {
          return async (key: string) => {
            if (isSyncedSetting(key)) guard('settings');
            await fn(key);
            if (isSyncedSetting(key)) await markDirty('settings', [key], 'delete');
          };
        }
        return fn;
      }

      switch (prop) {
        case 'create':
        case 'update':
        case 'setSeatBlocked':
          return async (...args: any[]) => {
            guard(ent);
            const result = await fn(...args);
            const id = idOf(result);
            if (id) await markDirty(ent, [id]);
            return result;
          };
        case 'createMany':
          return async (...args: any[]) => {
            guard(ent);
            const result = await fn(...args);
            await markDirty(ent, (result as any[]).map(idOf).filter((x): x is string => !!x));
            return result;
          };
        case 'remove':
          return async (id: string) => {
            guard(ent);
            let key = id;
            if (kind === 'attendance') {
              const existing = await (target as any).getById(id);
              key = existing?.examId ?? id;
            }
            await fn(id);
            await markDirty(ent, [key], 'delete');
          };
        default:
          return fn;
      }
    },
  });
}

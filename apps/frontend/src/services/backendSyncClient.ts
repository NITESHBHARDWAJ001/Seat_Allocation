export type SyncEntityName = 'students' | 'rooms' | 'exams' | 'allocations' | 'teachers' | 'dutyRosters';

export const SYNC_ENTITIES: SyncEntityName[] = ['students', 'rooms', 'exams', 'allocations', 'teachers', 'dutyRosters'];

function base(backendUrl: string): string {
  return backendUrl.replace(/\/+$/, '');
}

export async function checkBackendHealth(backendUrl: string): Promise<void> {
  const res = await fetch(`${base(backendUrl)}/api/health`);
  if (!res.ok) throw new Error(`Backend responded with status ${res.status}`);
  const data = await res.json();
  if (!data?.ok) throw new Error('Backend health check did not return ok');
}

export interface BulkPushResult {
  created: number;
  updated: number;
  errors: string[];
}

export async function pushEntities<T extends { id: string }>(
  backendUrl: string,
  entity: SyncEntityName,
  items: T[]
): Promise<BulkPushResult> {
  const res = await fetch(`${base(backendUrl)}/api/sync/${entity}/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Push failed for ${entity} (status ${res.status})`);
  return res.json();
}

export async function pullEntities<T>(backendUrl: string, entity: SyncEntityName): Promise<T[]> {
  const res = await fetch(`${base(backendUrl)}/api/sync/${entity}`);
  if (!res.ok) throw new Error(`Pull failed for ${entity} (status ${res.status})`);
  return res.json();
}

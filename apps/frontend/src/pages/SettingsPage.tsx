import { useEffect, useState } from 'react';
import { useAppData } from '../services/AppDataContext.js';
import { getSyncSettings, saveSyncSettings, type SyncSettings } from '../services/syncSettings.js';
import { checkBackendHealth, pullEntities, pushEntities, SYNC_ENTITIES, type SyncEntityName } from '../services/backendSyncClient.js';
import {
  allocationRepository,
  dutyRosterRepository,
  examRepository,
  roomRepository,
  studentRepository,
  teacherRepository,
} from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';

const repositoriesByEntity: Record<SyncEntityName, { getAll: () => Promise<any[]>; create: (item: any) => Promise<any> }> = {
  students: studentRepository,
  rooms: roomRepository,
  exams: examRepository,
  allocations: allocationRepository,
  teachers: teacherRepository,
  dutyRosters: dutyRosterRepository,
};

type EntitySummary = { entity: SyncEntityName; message: string; ok: boolean };

export default function SettingsPage() {
  const { refreshAll } = useAppData();
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'push' | 'pull' | 'test' | null>(null);
  const [summaries, setSummaries] = useState<EntitySummary[] | null>(null);

  useEffect(() => {
    getSyncSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  async function updateSettings(patch: Partial<SyncSettings>) {
    const next = { ...settings!, ...patch };
    setSettings(next);
    await saveSyncSettings(next);
  }

  async function handleTestConnection() {
    setBusy('test');
    setConnectionStatus(null);
    try {
      await checkBackendHealth(settings!.backendUrl);
      setConnectionStatus('Connected successfully.');
    } catch (e) {
      setConnectionStatus(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handlePush() {
    setBusy('push');
    setSummaries(null);
    const results: EntitySummary[] = [];
    for (const entity of SYNC_ENTITIES) {
      try {
        const items = await repositoriesByEntity[entity].getAll();
        const result = await pushEntities(settings!.backendUrl, entity, items);
        const errorNote = result.errors.length > 0 ? `, ${result.errors.length} error(s)` : '';
        results.push({ entity, ok: result.errors.length === 0, message: `${result.created} created, ${result.updated} updated${errorNote}` });
      } catch (e) {
        results.push({ entity, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    setSummaries(results);
    const now = new Date().toISOString();
    await updateSettings({ lastSyncedAt: now });
    setBusy(null);
  }

  async function handlePull() {
    setBusy('pull');
    setSummaries(null);
    const results: EntitySummary[] = [];
    for (const entity of SYNC_ENTITIES) {
      try {
        const items = await pullEntities<any>(settings!.backendUrl, entity);
        for (const item of items) {
          await repositoriesByEntity[entity].create(item);
        }
        results.push({ entity, ok: true, message: `${items.length} pulled` });
      } catch (e) {
        results.push({ entity, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    setSummaries(results);
    const now = new Date().toISOString();
    await updateSettings({ lastSyncedAt: now });
    await refreshAll();
    setBusy(null);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manually sync local data with a shared spreadsheet backend" />
      <div className="p-6 space-y-6 max-w-2xl">
        <div className="card p-4 space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => updateSettings({ enabled: e.target.checked })}
            />
            <span className="text-sm font-medium text-slate-800">Enable spreadsheet sync</span>
          </label>
          <p className="text-xs text-slate-500">
            This app stores all its data locally in your browser (IndexedDB) - nothing leaves this browser by default.
            Enabling sync lets you manually push your local data to a shared backend (backed by a Google Sheet), and pull
            it back down on another browser or device, using the spreadsheet as a shared handoff point. Sync is entirely
            manual and additive: pushing never deletes rows in the spreadsheet, and pulling never deletes records already
            in this browser.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Backend URL</label>
            <input
              className="input w-full"
              value={settings.backendUrl}
              disabled={!settings.enabled}
              onChange={(e) => updateSettings({ backendUrl: e.target.value })}
              placeholder="http://localhost:4000"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={!settings.enabled || busy !== null} onClick={handleTestConnection}>
              {busy === 'test' ? 'Testing...' : 'Test Connection'}
            </button>
            <button className="btn-primary" disabled={!settings.enabled || busy !== null} onClick={handlePush}>
              {busy === 'push' ? 'Pushing...' : 'Push Local → Spreadsheet'}
            </button>
            <button className="btn-primary" disabled={!settings.enabled || busy !== null} onClick={handlePull}>
              {busy === 'pull' ? 'Pulling...' : 'Pull Spreadsheet → Local'}
            </button>
          </div>

          {connectionStatus && <div className="text-sm text-slate-700">{connectionStatus}</div>}
          {settings.lastSyncedAt && (
            <div className="text-xs text-slate-500">Last synced: {new Date(settings.lastSyncedAt).toLocaleString()}</div>
          )}
        </div>

        {summaries && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Sync Result</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.entity}>
                    <td className="capitalize">{s.entity}</td>
                    <td className={s.ok ? 'text-slate-700' : 'text-red-600'}>{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Note: pushing or pulling a large dataset makes one request per record on the backend, so this is best used for
          typical college-scale data as an occasional, manual action rather than a continuous sync.
        </p>
      </div>
    </div>
  );
}

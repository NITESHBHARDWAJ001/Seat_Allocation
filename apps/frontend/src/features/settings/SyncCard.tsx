import { useState } from 'react';
import { useAppData } from '../../services/AppDataContext.js';
import { useAuth } from '../../services/AuthContext.js';
import { DEFAULT_INTERVAL_MIN, useSync } from '../../services/SyncContext.js';
import { importLocalOnlyData } from '../../services/syncEngine.js';

const INTERVALS = [
  { value: 1, label: 'every minute' },
  { value: 5, label: 'every 5 minutes' },
  { value: 15, label: 'every 15 minutes' },
  { value: 30, label: 'every 30 minutes' },
  { value: 60, label: 'every hour' },
  { value: 0, label: 'only when I press Sync now' },
];

const ago = (iso: string | null): string => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
};

/** Background sync status and options for the signed-in organization. */
export default function SyncCard() {
  const { role, user } = useAuth();
  const sync = useSync();
  const { refreshAll } = useAppData();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const canImport = role === 'org_admin' || role === 'exam_cell';

  return (
    <div className="card p-4 space-y-3">
      <div className="font-semibold text-slate-900">Sync with the server</div>
      <p className="text-xs text-slate-500">
        Everything you do is saved in this browser first, so the app stays fast and works offline. In the background only the records that changed are sent to {user?.orgName ?? 'the server'} in small batches, and other
        people's changes are brought in.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Status</div>
          <div className={sync.lastError ? 'text-red-700' : 'text-emerald-700'}>{sync.syncing ? 'Syncing…' : sync.lastError ? 'Problem' : 'OK'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Last sync</div>
          <div>{ago(sync.lastSyncAt)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Waiting to upload</div>
          <div className={sync.pending ? 'text-amber-700 font-medium' : ''}>{sync.pending}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Last run</div>
          <div>{sync.lastResult ? `↑${sync.lastResult.pushed} ↓${sync.lastResult.pulled}` : '—'}</div>
        </div>
      </div>
      {sync.lastError && <div className="text-sm text-red-700">{sync.lastError} (will retry automatically)</div>}
      {sync.lastResult && sync.lastResult.rejected > 0 && <div className="text-xs text-amber-700">{sync.lastResult.rejected} change(s) were not accepted by the server (your role may not allow them).</div>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700">
          Sync automatically{' '}
          <select className="input inline-block w-auto py-1" value={sync.intervalMin} onChange={(e) => sync.setIntervalMin(Number(e.target.value))}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
                {i.value === DEFAULT_INTERVAL_MIN ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary" disabled={sync.syncing} onClick={() => void sync.syncNow()}>
          {sync.syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <div className="text-xs text-slate-400">This setting applies to this browser only. It also syncs when you return to the tab and when the connection comes back.</div>

      {canImport && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="text-sm font-medium text-slate-800">Bring in data you already have on this computer</div>
          <div className="text-xs text-slate-500">
            If you used the app before signing in (no server), copy that local data into {user?.orgName}. It is then uploaded by the next sync. Records with the same id are overwritten with the local version.
          </div>
          <button
            className="btn-secondary"
            disabled={importing}
            onClick={async () => {
              if (!confirm('Copy the data from this browser’s local-only copy into the organization?')) return;
              setImporting(true);
              try {
                const { copied } = await importLocalOnlyData();
                const total = Object.values(copied).reduce((a, b) => a + b, 0);
                setImportMsg(total ? `Copied ${total} records (${Object.entries(copied).map(([k, v]) => `${k}: ${v}`).join(', ')}). They will upload on the next sync.` : 'No local-only data found on this computer.');
                await refreshAll();
              } catch (e) {
                setImportMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? 'Copying…' : 'Copy local-only data into this organization'}
          </button>
          {importMsg && <div className="text-xs text-slate-600">{importMsg}</div>}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/auth.js';
import { useAuth } from '../services/AuthContext.js';
import PageHeader from '../components/PageHeader.js';

interface OrgUser {
  id: string;
  login: string;
  name: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}
interface OrgInfo {
  name: string;
  code: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Organization admin',
  exam_cell: 'Exam cell',
  attendance_marker: 'Attendance marker',
  viewer: 'Viewer (read-only)',
};
const ROLE_HELP: Record<string, string> = {
  org_admin: 'Everything, including managing users.',
  exam_cell: 'Students, rooms, exams, seating, duty, reports, memos.',
  attendance_marker: 'Marks absentees and prints attendance sheets only.',
  viewer: 'Can look at seating, duty chart and reports; cannot change anything.',
};

function Secret({ title, login, password, onClose }: { title: string; login: string; password: string; onClose: () => void }) {
  return (
    <div className="card p-4 border-emerald-300 bg-emerald-50 space-y-2 text-sm">
      <div className="font-semibold text-emerald-900">{title}</div>
      <div>
        Login: <span className="font-mono">{login}</span>
      </div>
      <div>
        Temporary password: <span className="font-mono bg-white border border-emerald-200 rounded px-2 py-0.5">{password}</span>
      </div>
      <div className="text-xs text-emerald-800">Shown only once. The user must choose their own password at first sign-in.</div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(`Login: ${login}\nTemporary password: ${password}`)}>
          Copy
        </button>
        <button className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Organization admin: organization details and the people who can sign in, with their roles. */
export default function UsersPage() {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; login: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: '', login: '', role: 'exam_cell', password: '' });
  const [orgForm, setOrgForm] = useState<OrgInfo | null>(null);
  const [savedOrg, setSavedOrg] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, u] = await Promise.all([apiFetch<OrgInfo>('/org'), apiFetch<OrgUser[]>('/org/users')]);
      setOrg(o);
      setOrgForm(o);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      setError(null);
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await act(() => apiFetch<{ user: OrgUser; temporaryPassword: string }>('/org/users', { method: 'POST', body: { ...form, password: form.password || undefined } }));
    if (res) {
      setSecret({ title: `User "${res.user.name}" created`, login: res.user.login, password: res.temporaryPassword });
      setForm({ name: '', login: '', role: 'exam_cell', password: '' });
      await load();
    }
  }

  return (
    <div>
      <PageHeader title="Users & organization" subtitle={org ? `${org.name} · code ${org.code}` : ''} />
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
        {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-2">{error}</div>}
        {secret && <Secret {...secret} onClose={() => setSecret(null)} />}

        <div className="card p-4 space-y-3">
          <div className="font-semibold">Add a user</div>
          <form onSubmit={addUser} className="grid sm:grid-cols-2 gap-3">
            <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Login (email or username)" value={form.login} autoCapitalize="none" onChange={(e) => setForm({ ...form, login: e.target.value })} />
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Temporary password (optional, else generated)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <div className="text-xs text-slate-500 sm:col-span-2">{ROLE_HELP[form.role]}</div>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={!form.name.trim() || !form.login.trim()}>
                Create user
              </button>
            </div>
          </form>
        </div>

        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const me = u.id === user?.id;
                return (
                  <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                    <td className="font-medium">
                      {u.name} {me && <span className="text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="font-mono text-xs">{u.login}</td>
                    <td>
                      <select
                        className="input py-1"
                        value={u.role}
                        disabled={me}
                        onChange={async (e) => {
                          await act(() => apiFetch(`/org/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }));
                          await load();
                        }}
                      >
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-slate-500">Disabled</span>}</td>
                    <td className="text-xs text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        className="btn-ghost"
                        onClick={async () => {
                          const res = await act(() => apiFetch<{ login: string; temporaryPassword: string }>(`/org/users/${u.id}/reset-password`, { method: 'POST' }));
                          if (res) setSecret({ title: `New temporary password for ${u.name}`, login: res.login, password: res.temporaryPassword });
                        }}
                      >
                        Reset password
                      </button>
                      {!me && (
                        <button
                          className="btn-ghost"
                          onClick={async () => {
                            await act(() => apiFetch(`/org/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }));
                            await load();
                          }}
                        >
                          {u.active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {orgForm && (
          <div className="card p-4 space-y-3">
            <div className="font-semibold">Organization details</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  ['name', 'Organization name'],
                  ['contactName', 'Contact person'],
                  ['contactEmail', 'Contact email'],
                  ['contactPhone', 'Contact phone'],
                  ['address', 'Address'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-slate-600">{label}</span>
                  <input
                    className="input mt-1"
                    value={orgForm[key] ?? ''}
                    onChange={(e) => {
                      setSavedOrg(false);
                      setOrgForm({ ...orgForm, [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={async () => {
                  await act(() => apiFetch('/org', { method: 'PATCH', body: orgForm }));
                  setSavedOrg(true);
                  await load();
                }}
              >
                Save details
              </button>
              {savedOrg && <span className="text-xs text-emerald-700">Saved</span>}
            </div>
            <div className="text-xs text-slate-500">College name, centre number and the emblem printed on memos are set under Settings → Institution.</div>
          </div>
        )}
      </div>
    </div>
  );
}

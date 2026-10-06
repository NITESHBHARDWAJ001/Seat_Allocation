import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/auth.js';
import { useAuth } from '../services/AuthContext.js';
import { ChangePasswordForm } from './ChangePasswordPage.js';

interface Org {
  id: string;
  name: string;
  code: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
  userCount: number;
  studentCount: number;
  examCount: number;
  lastSyncAt: string | null;
  lastLoginAt: string | null;
}
interface OrgUserRow {
  id: string;
  login: string;
  name: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}
interface AuditRow {
  id: number;
  at: string;
  actor: string | null;
  orgName: string | null;
  action: string;
  target: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');
const EMPTY_FORM = { name: '', code: '', contactName: '', contactEmail: '', contactPhone: '', address: '', adminName: '', adminLogin: '', adminPassword: '' };

/**
 * Platform administration. Shows which organizations are registered and how they are being used (user, student and
 * exam counts, last activity). It deliberately has no view into an organization's students, seating or attendance.
 */
export default function PlatformPage() {
  const { user, signOut } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<{ org: Org; users: OrgUserRow[] } | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [secret, setSecret] = useState<{ title: string; login: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrgs(await apiFetch<Org[]>('/platform/orgs'));
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

  const open = (id: string) =>
    act(async () => {
      const d = await apiFetch<{ organization: Org; users: OrgUserRow[] }>(`/platform/orgs/${id}`);
      setSelected({ org: d.organization, users: d.users });
      setAudit(null);
    });

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    const res = await act(() => apiFetch<{ organization: Org; adminLogin: string; temporaryPassword: string }>('/platform/orgs', { method: 'POST', body: { ...form, adminPassword: form.adminPassword || undefined } }));
    if (res) {
      setSecret({ title: `Organization "${res.organization.name}" created. Give these to its administrator:`, login: res.adminLogin, password: res.temporaryPassword });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    }
  }

  const setStatus = async (org: Org, status: 'active' | 'suspended') => {
    if (status === 'suspended' && !confirm(`Suspend ${org.name}? Nobody in it will be able to sign in or sync until you reactivate it.`)) return;
    await act(() => apiFetch(`/platform/orgs/${org.id}`, { method: 'PATCH', body: { status } }));
    await load();
    await open(org.id);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">Exam Room Allocator — Platform administration</div>
          <div className="text-xs text-slate-500">Signed in as {user?.name}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowPassword((v) => !v)}>
            Change password
          </button>
          <button className="btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-2">{error}</div>}
        {showPassword && (
          <div className="card p-4 max-w-sm">
            <ChangePasswordForm onDone={() => setShowPassword(false)} />
          </div>
        )}
        {secret && (
          <div className="card p-4 border-emerald-300 bg-emerald-50 space-y-2 text-sm">
            <div className="font-semibold text-emerald-900">{secret.title}</div>
            <div>
              Login: <span className="font-mono">{secret.login}</span>
            </div>
            <div>
              Temporary password: <span className="font-mono bg-white border border-emerald-200 rounded px-2 py-0.5">{secret.password}</span>
            </div>
            <div className="text-xs text-emerald-800">Shown only once. The administrator must choose their own password at first sign-in.</div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(`Login: ${secret.login}\nTemporary password: ${secret.password}`)}>
                Copy
              </button>
              <button className="btn-ghost" onClick={() => setSecret(null)}>
                Done
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Organizations', orgs.length],
            ['Active', orgs.filter((o) => o.status === 'active').length],
            ['Suspended', orgs.filter((o) => o.status === 'suspended').length],
            ['Users in total', orgs.reduce((n, o) => n + o.userCount, 0)],
          ].map(([label, value]) => (
            <div key={label as string} className="card px-4 py-3">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="text-2xl font-semibold mt-1">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="font-semibold text-slate-900">Organizations</div>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={async () => {
                setSelected(null);
                setAudit(await act(() => apiFetch<AuditRow[]>('/platform/audit')) ?? null);
              }}
            >
              Activity log
            </button>
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'New organization'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={createOrg} className="card p-4 grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 font-medium">Organization</div>
            <input className="input" placeholder="Organization name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Short code * (e.g. siet)" value={form.code} autoCapitalize="none" onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input className="input" placeholder="Contact person" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <input className="input" placeholder="Contact email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <input className="input" placeholder="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="sm:col-span-2 font-medium pt-2">First organization administrator</div>
            <input className="input" placeholder="Admin name *" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            <input className="input" placeholder="Admin login (email or username) *" value={form.adminLogin} autoCapitalize="none" onChange={(e) => setForm({ ...form, adminLogin: e.target.value })} />
            <input className="input sm:col-span-2" placeholder="Temporary password (optional, otherwise generated)" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={!form.name.trim() || !form.code.trim() || !form.adminName.trim() || !form.adminLogin.trim()}>
                Create organization
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Code</th>
                <th>Status</th>
                <th>Users</th>
                <th>Students</th>
                <th>Exams</th>
                <th>Last sync</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => void open(o.id)}>
                  <td className="font-medium">{o.name}</td>
                  <td className="font-mono text-xs">{o.code}</td>
                  <td>{o.status === 'active' ? <span className="text-emerald-700">Active</span> : <span className="text-red-700">Suspended</span>}</td>
                  <td>{o.userCount}</td>
                  <td>{o.studentCount}</td>
                  <td>{o.examCount}</td>
                  <td className="text-xs text-slate-500">{fmt(o.lastSyncAt)}</td>
                  <td className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-6">
                    No organizations yet. Create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{selected.org.name}</div>
                <div className="text-xs text-slate-500">
                  code {selected.org.code} · registered {fmt(selected.org.createdAt)} · last sign-in {fmt(selected.org.lastLoginAt)}
                </div>
              </div>
              <div className="flex gap-2">
                {selected.org.status === 'active' ? (
                  <button className="btn-danger" onClick={() => void setStatus(selected.org, 'suspended')}>
                    Suspend
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => void setStatus(selected.org, 'active')}>
                    Reactivate
                  </button>
                )}
                <button className="btn-ghost" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>Contact: {selected.org.contactName ?? '—'}</div>
              <div>Email: {selected.org.contactEmail ?? '—'}</div>
              <div>Phone: {selected.org.contactPhone ?? '—'}</div>
              <div>Address: {selected.org.address ?? '—'}</div>
            </div>
            <div className="text-sm font-medium">Users ({selected.users.length})</div>
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
                {selected.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="font-mono text-xs">{u.login}</td>
                    <td>{u.role.replace('_', ' ')}</td>
                    <td>{u.active ? 'Active' : 'Disabled'}</td>
                    <td className="text-xs text-slate-500">{fmt(u.lastLoginAt)}</td>
                    <td className="text-right">
                      {u.role === 'org_admin' && (
                        <button
                          className="btn-ghost"
                          onClick={async () => {
                            if (!confirm(`Give ${u.name} a new temporary password?`)) return;
                            const res = await act(() => apiFetch<{ login: string; temporaryPassword: string }>(`/platform/orgs/${selected.org.id}/reset-admin-password`, { method: 'POST', body: { userId: u.id } }));
                            if (res) setSecret({ title: `New temporary password for ${u.name} (${selected.org.name})`, login: res.login, password: res.temporaryPassword });
                          }}
                        >
                          Reset password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-slate-500">You can see who is registered and how much the organization uses the system. Students, exams and attendance are not visible to the platform.</div>
          </div>
        )}

        {audit && (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Organization</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="text-xs text-slate-500">{fmt(a.at)}</td>
                    <td>{a.actor ?? '—'}</td>
                    <td>{a.orgName ?? '—'}</td>
                    <td>{a.action.replace(/_/g, ' ')}</td>
                    <td className="text-xs">{a.target ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

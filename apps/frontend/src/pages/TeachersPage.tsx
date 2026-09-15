import { useMemo, useState } from 'react';
import type { Teacher } from '../vendor/core/index.js';
import { generateId } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { teacherRepository } from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';

type TeacherDraft = Pick<Teacher, 'name' | 'branch' | 'email' | 'phone'>;

const emptyDraft: TeacherDraft = { name: '', branch: '', email: '', phone: '' };

export default function TeachersPage() {
  const { teachers, refreshTeachers } = useAppData();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<TeacherDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TeacherDraft>(emptyDraft);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const branches = useMemo(() => [...new Set(teachers.map((t) => t.branch))].sort(), [teachers]);

  const filtered = useMemo(() => {
    let list = teachers;
    if (branchFilter) list = list.filter((t) => t.branch === branchFilter);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(term));
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers, branchFilter, search]);

  async function handleAdd() {
    if (!draft.name.trim() || !draft.branch.trim()) return;
    await teacherRepository.create({
      id: generateId('teacher'),
      name: draft.name.trim(),
      branch: draft.branch.trim(),
      email: draft.email?.trim() || undefined,
      phone: draft.phone?.trim() || undefined,
      active: true,
    });
    setDraft(emptyDraft);
    setShowAddForm(false);
    await refreshTeachers();
  }

  function startEdit(t: Teacher) {
    setEditingId(t.id);
    setEditDraft({ name: t.name, branch: t.branch, email: t.email, phone: t.phone });
  }

  async function saveEdit(id: string) {
    await teacherRepository.update(id, {
      name: editDraft.name.trim(),
      branch: editDraft.branch.trim(),
      email: editDraft.email?.trim() || undefined,
      phone: editDraft.phone?.trim() || undefined,
    });
    setEditingId(null);
    await refreshTeachers();
  }

  async function toggleActive(t: Teacher) {
    await teacherRepository.update(t.id, { active: !t.active });
    await refreshTeachers();
  }

  async function remove(id: string) {
    await teacherRepository.remove(id);
    await refreshTeachers();
  }

  function parseBulk(): { valid: Teacher[]; errors: string[] } {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const valid: Teacher[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      const [name, branch, email, phone] = parts;
      if (!name || !branch) {
        errors.push(`Line ${idx + 1}: expected "name, branch[, email, phone]"`);
        return;
      }
      valid.push({ id: generateId('teacher'), name, branch, email: email || undefined, phone: phone || undefined, active: true });
    });
    return { valid, errors };
  }

  async function handleBulkImport() {
    const { valid, errors } = parseBulk();
    if (errors.length) {
      setBulkError(errors.join('\n'));
      return;
    }
    if (valid.length === 0) {
      setBulkError('No valid rows found.');
      return;
    }
    await teacherRepository.createMany(valid);
    setBulkText('');
    setBulkError(null);
    setShowBulk(false);
    await refreshTeachers();
  }

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle={`${teachers.length} total — invigilators available for duty allocation`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowBulk((v) => !v)}>
              Bulk Import
            </button>
            <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
              Add Teacher
            </button>
          </>
        }
      />

      <div className="p-6 space-y-4">
        {showBulk && (
          <div className="card p-4 space-y-2">
            <div className="text-sm font-medium text-slate-700">Bulk paste import</div>
            <p className="text-xs text-slate-500">
              One teacher per line: <code>name, branch[, email, phone]</code>
            </p>
            <textarea
              className="input font-mono h-32"
              placeholder={'Asha Rao, CSE\nBilal Khan, ECE, bilal@example.edu'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkError && <pre className="text-xs text-red-600 whitespace-pre-wrap">{bulkError}</pre>}
            <div className="flex gap-2">
              <button className="btn-primary" onClick={handleBulkImport}>
                Import
              </button>
              <button className="btn-ghost" onClick={() => setShowBulk(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showAddForm && (
          <div className="card p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Name">
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Branch">
                <input className="input" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} />
              </Field>
              <Field label="Email (optional)">
                <input className="input" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label="Phone (optional)">
                <input className="input" value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" onClick={handleAdd}>
                Save Teacher
              </button>
              <button className="btn-ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input className="input max-w-xs" placeholder="Search name..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-[140px]" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">{filtered.length} shown</span>
        </div>

        <div className="card overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Branch</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="bg-brand-50/40">
                    <td>
                      <input className="input" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.branch} onChange={(e) => setEditDraft({ ...editDraft, branch: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.email ?? ''} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.phone ?? ''} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
                    </td>
                    <td colSpan={2}>
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => saveEdit(t.id)}>
                          Save
                        </button>
                        <button className="btn-ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.branch}</td>
                    <td>{t.email ?? '—'}</td>
                    <td>{t.phone ?? '—'}</td>
                    <td>
                      <button
                        className={`badge ${t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                        onClick={() => toggleActive(t)}
                      >
                        {t.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-2 justify-end">
                        <button className="btn-ghost" onClick={() => startEdit(t)}>
                          Edit
                        </button>
                        <button className="btn-ghost text-red-600" onClick={() => remove(t.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-8">
                    No teachers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

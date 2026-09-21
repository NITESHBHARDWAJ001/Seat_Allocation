import { useMemo, useState } from 'react';
import type { Student } from '../vendor/core/index.js';
import { compareRollNumbers, generateId } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { studentRepository } from '../services/repositories.js';
import { exportStudentsCsv } from '../services/exportService.js';
import PageHeader from '../components/PageHeader.js';
import MultiSelectFilter from '../components/MultiSelectFilter.js';
import ExcelImportControls from '../components/ExcelImportControls.js';

type StudentDraft = Pick<Student, 'rollNumber' | 'name' | 'branch' | 'year' | 'section' | 'semester' | 'batch'>;

const emptyDraft: StudentDraft = { rollNumber: '', name: '', branch: '', year: 1, section: '', semester: undefined, batch: '' };

export default function StudentsPage() {
  const { students, refreshStudents } = useAppData();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<Set<string>>(new Set());
  const [yearFilter, setYearFilter] = useState<Set<number>>(new Set());
  const [sectionFilter, setSectionFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StudentDraft>(emptyDraft);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const branches = useMemo(() => [...new Set(students.map((s) => s.branch))].sort(), [students]);
  const years = useMemo(() => [...new Set(students.map((s) => s.year))].sort((a, b) => a - b), [students]);
  const sections = useMemo(() => [...new Set(students.map((s) => s.section))].sort(), [students]);

  const duplicateRolls = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) counts.set(s.rollNumber, (counts.get(s.rollNumber) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([roll]) => roll));
  }, [students]);

  const missingFieldsCount = useMemo(
    () => students.filter((s) => !s.rollNumber || !s.name || !s.branch || !s.section).length,
    [students]
  );

  const filtered = useMemo(() => {
    let list = students;
    if (branchFilter.size > 0) list = list.filter((s) => branchFilter.has(s.branch));
    if (yearFilter.size > 0) list = list.filter((s) => yearFilter.has(s.year));
    if (sectionFilter) list = list.filter((s) => s.section === sectionFilter);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((s) => s.rollNumber.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
    }
    return list.slice().sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
  }, [students, branchFilter, yearFilter, sectionFilter, search]);

  async function handleAdd() {
    if (!draft.rollNumber.trim() || !draft.name.trim() || !draft.branch.trim() || !draft.section.trim()) return;
    await studentRepository.create({
      id: generateId('student'),
      rollNumber: draft.rollNumber.trim(),
      name: draft.name.trim(),
      branch: draft.branch.trim(),
      year: Number(draft.year) || 1,
      section: draft.section.trim(),
      semester: draft.semester ? Number(draft.semester) : undefined,
      batch: draft.batch?.trim() || undefined,
      active: true,
    });
    setDraft(emptyDraft);
    setShowAddForm(false);
    await refreshStudents();
  }

  function startEdit(s: Student) {
    setEditingId(s.id);
    setEditDraft({
      rollNumber: s.rollNumber,
      name: s.name,
      branch: s.branch,
      year: s.year,
      section: s.section,
      semester: s.semester,
      batch: s.batch,
    });
  }

  async function saveEdit(id: string) {
    await studentRepository.update(id, {
      rollNumber: editDraft.rollNumber.trim(),
      name: editDraft.name.trim(),
      branch: editDraft.branch.trim(),
      year: Number(editDraft.year) || 1,
      section: editDraft.section.trim(),
      semester: editDraft.semester ? Number(editDraft.semester) : undefined,
      batch: editDraft.batch?.trim() || undefined,
    });
    setEditingId(null);
    await refreshStudents();
  }

  async function toggleActive(s: Student) {
    await studentRepository.update(s.id, { active: !s.active });
    await refreshStudents();
  }

  async function remove(id: string) {
    await studentRepository.remove(id);
    await refreshStudents();
  }

  function parseBulk(): { valid: Student[]; errors: string[] } {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const valid: Student[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      const [rollNumber, name, branch, yearStr, section, semesterStr, batch] = parts;
      if (!rollNumber || !name || !branch || !yearStr || !section) {
        errors.push(`Line ${idx + 1}: expected "rollNumber, name, branch, year, section[, semester, batch]"`);
        return;
      }
      const year = Number(yearStr);
      if (Number.isNaN(year)) {
        errors.push(`Line ${idx + 1}: year "${yearStr}" is not a number.`);
        return;
      }
      valid.push({
        id: generateId('student'),
        rollNumber,
        name,
        branch,
        year,
        section,
        semester: semesterStr ? Number(semesterStr) : undefined,
        batch: batch || undefined,
        active: true,
      });
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
    await studentRepository.createMany(valid);
    setBulkText('');
    setBulkError(null);
    setShowBulk(false);
    await refreshStudents();
  }

  async function handleExcelImport(records: { rowNumber: number; values: Record<string, string> }[]): Promise<string> {
    const valid: Student[] = records.map(({ values: v }) => ({
      id: generateId('student'),
      rollNumber: v.rollNumber!,
      name: v.name!,
      branch: v.branch!,
      year: Number(v.year),
      section: v.section!,
      semester: v.semester ? Number(v.semester) : undefined,
      batch: v.batch || undefined,
      active: true,
    }));
    await studentRepository.createMany(valid);
    await refreshStudents();
    return `Imported ${valid.length} student(s) from Excel.`;
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`${students.length} total`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => exportStudentsCsv(students)}>
              Export CSV
            </button>
            <button className="btn-secondary" onClick={() => setShowBulk((v) => !v)}>
              Bulk Import
            </button>
            <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
              Add Student
            </button>
          </>
        }
      />

      <div className="p-6 space-y-4">
        {(duplicateRolls.size > 0 || missingFieldsCount > 0) && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {duplicateRolls.size > 0 && <div>Duplicate roll numbers: {[...duplicateRolls].join(', ')}</div>}
            {missingFieldsCount > 0 && <div>{missingFieldsCount} student(s) have a missing required field.</div>}
          </div>
        )}

        <ExcelImportControls kind="students" onImport={handleExcelImport} />

        {showBulk && (
          <div className="card p-4 space-y-2">
            <div className="text-sm font-medium text-slate-700">Bulk paste import</div>
            <p className="text-xs text-slate-500">
              One student per line: <code>rollNumber, name, branch, year, section[, semester, batch]</code>
            </p>
            <textarea
              className="input font-mono h-32"
              placeholder={'CSE24001, Asha Rao, CSE, 2, A\nCSE24002, Bilal Khan, CSE, 2, A'}
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Field label="Roll Number">
                <input className="input" value={draft.rollNumber} onChange={(e) => setDraft({ ...draft, rollNumber: e.target.value })} />
              </Field>
              <Field label="Name">
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Branch">
                <input className="input" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} />
              </Field>
              <Field label="Year">
                <input type="number" className="input" value={draft.year} onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })} />
              </Field>
              <Field label="Section">
                <input className="input" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} />
              </Field>
              <Field label="Batch (optional)">
                <input className="input" value={draft.batch ?? ''} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" onClick={handleAdd}>
                Save Student
              </button>
              <button className="btn-ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input className="input max-w-xs" placeholder="Search roll number or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <MultiSelectFilter label="Branches" options={branches} selected={branchFilter} onChange={setBranchFilter} />
          <MultiSelectFilter label="Years" options={years} selected={yearFilter} onChange={setYearFilter} formatOption={(y) => `Year ${y}`} />
          <select className="input max-w-[120px]" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">{filtered.length} shown</span>
        </div>

        <div className="card overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Roll Number</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Year</th>
                <th>Section</th>
                <th>Batch</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id} className="bg-brand-50/40">
                    <td>
                      <input className="input" value={editDraft.rollNumber} onChange={(e) => setEditDraft({ ...editDraft, rollNumber: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.branch} onChange={(e) => setEditDraft({ ...editDraft, branch: e.target.value })} />
                    </td>
                    <td>
                      <input type="number" className="input w-16" value={editDraft.year} onChange={(e) => setEditDraft({ ...editDraft, year: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input className="input w-16" value={editDraft.section} onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={editDraft.batch ?? ''} onChange={(e) => setEditDraft({ ...editDraft, batch: e.target.value })} />
                    </td>
                    <td colSpan={2}>
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => saveEdit(s.id)}>
                          Save
                        </button>
                        <button className="btn-ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className={duplicateRolls.has(s.rollNumber) ? 'bg-amber-50' : ''}>
                    <td className="font-mono">{s.rollNumber}</td>
                    <td>{s.name}</td>
                    <td>{s.branch}</td>
                    <td>{s.year}</td>
                    <td>{s.section}</td>
                    <td>{s.batch ?? '—'}</td>
                    <td>
                      <button
                        className={`badge ${s.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                        onClick={() => toggleActive(s)}
                      >
                        {s.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-2 justify-end">
                        <button className="btn-ghost" onClick={() => startEdit(s)}>
                          Edit
                        </button>
                        <button className="btn-ghost text-red-600" onClick={() => remove(s.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400 py-8">
                    No students match the current filters.
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

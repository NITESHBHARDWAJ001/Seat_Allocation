import { useMemo } from 'react';
import type { SubjectAssignment, Student } from '../../vendor/core/index.js';
import { generateId } from '../../vendor/core/index.js';
import { detectSubjectConflicts } from '../../vendor/allocation-engine/index.js';

export default function SubjectAssignmentEditor({
  value,
  onChange,
  students,
}: {
  value: SubjectAssignment[];
  onChange: (next: SubjectAssignment[]) => void;
  students: Student[];
}) {
  const branches = useMemo(() => [...new Set(students.map((s) => s.branch))].sort(), [students]);
  const years = useMemo(() => [...new Set(students.map((s) => s.year))].sort((a, b) => a - b), [students]);
  const conflicts = useMemo(() => detectSubjectConflicts(value), [value]);

  function update(i: number, patch: Partial<SubjectAssignment>) {
    const next = value.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...value, { id: generateId('subject'), branch: branches[0] ?? '', year: years[0] ?? 1, subjectName: '' }]);
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">
        Different branch/year groups can sit different papers in the same session (e.g. CSE-Y2 writes Data
        Structures while ECE-Y2 writes Signals) — one subject per branch+year.
      </p>
      {conflicts.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 mb-2 text-sm text-red-800">
          {conflicts.map((c, i) => (
            <div key={i}>
              Conflict: {c.branch} Year {c.year} has {c.subjectNames.length} different subjects assigned:{' '}
              {c.subjectNames.join(', ')}.
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {value.map((a, i) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-md px-3 py-2">
            <select className="input w-28" value={a.branch} onChange={(e) => update(i, { branch: e.target.value })}>
              {branches.length === 0 && <option value="">—</option>}
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select className="input w-24" value={a.year} onChange={(e) => update(i, { year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
            <input
              className="input flex-1 min-w-[140px]"
              placeholder="Subject name"
              value={a.subjectName}
              onChange={(e) => update(i, { subjectName: e.target.value })}
            />
            <input
              className="input w-28"
              placeholder="Code (optional)"
              value={a.subjectCode ?? ''}
              onChange={(e) => update(i, { subjectCode: e.target.value || undefined })}
            />
            <button className="btn-ghost text-red-600" onClick={() => remove(i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-2" onClick={add} disabled={students.length === 0}>
        Add subject rule
      </button>
    </div>
  );
}

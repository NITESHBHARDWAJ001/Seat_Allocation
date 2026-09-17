import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultRuleConfig, generateId, type SubjectAssignment } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { examRepository } from '../services/repositories.js';
import { deleteMixGroup, getMixGroups, mixGroupType, saveMixGroup, type MixGroup, type MixGroupType } from '../services/mixGroups.js';
import PageHeader from '../components/PageHeader.js';
import RuleConfigEditor from '../components/RuleConfigEditor.js';
import MultiSelectFilter from '../components/MultiSelectFilter.js';
import SubjectAssignmentEditor from '../features/exam/SubjectAssignmentEditor.js';
import { findStudentSittingConflicts, selectMinimalRooms } from '../vendor/allocation-engine/index.js';

export default function ExamCreatePage() {
  const { students, rooms, exams, refreshExams } = useAppData();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [ruleConfig, setRuleConfig] = useState(defaultRuleConfig());
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [branchFilter, setBranchFilter] = useState<Set<string>>(new Set());
  const [yearFilter, setYearFilter] = useState<Set<number>>(new Set());
  const [mixGroups, setMixGroups] = useState<MixGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<MixGroupType>('year');

  useEffect(() => {
    getMixGroups().then(setMixGroups);
  }, []);

  const branches = useMemo(() => [...new Set(students.map((s) => s.branch))].sort(), [students]);
  const years = useMemo(() => [...new Set(students.map((s) => s.year))].sort((a, b) => a - b), [students]);

  const visibleStudents = useMemo(() => {
    return students.filter((s) => (branchFilter.size === 0 || branchFilter.has(s.branch)) && (yearFilter.size === 0 || yearFilter.has(s.year)));
  }, [students, branchFilter, yearFilter]);

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Always-on check: a student can't physically sit two exams whose date+time
  // overlap. Recomputed live as the date/time/roster changes, before the
  // exam is even created.
  const sittingConflicts = useMemo(() => {
    if (!date || selectedStudents.size === 0) return [];
    return findStudentSittingConflicts({ date, startTime, endTime, studentIds: [...selectedStudents] }, exams);
  }, [date, startTime, endTime, selectedStudents, exams]);

  function toggleStudent(id: string) {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedStudents((prev) => new Set([...prev, ...visibleStudents.map((s) => s.id)]));
  }
  function clearAllVisible() {
    const visibleIds = new Set(visibleStudents.map((s) => s.id));
    setSelectedStudents((prev) => new Set([...prev].filter((id) => !visibleIds.has(id))));
  }

  function toggleRoom(id: string) {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectMinimumRooms() {
    const minimal = selectMinimalRooms(rooms, selectedStudents.size);
    setSelectedRooms(new Set(minimal.map((r) => r.id)));
  }

  // "Customize whom to mix": a mix group is a saved combo you explicitly
  // declare as branch-wise, year-wise, or both - e.g. "Senior years" (year-
  // wise: Year 3+4, every branch) or "CSE+ECE" (branch-wise: those two
  // branches, every year). Applying one both sets the filter above AND
  // selects every matching student, so one click both shows and adds that
  // combined group to the roster.
  async function applyMixGroup(group: MixGroup) {
    const type = mixGroupType(group);
    const groupBranches = type === 'year' ? new Set<string>() : new Set(group.branches);
    const groupYears = type === 'branch' ? new Set<number>() : new Set(group.years);
    setBranchFilter(groupBranches);
    setYearFilter(groupYears);
    const matching = students.filter(
      (s) => (groupBranches.size === 0 || groupBranches.has(s.branch)) && (groupYears.size === 0 || groupYears.has(s.year))
    );
    setSelectedStudents((prev) => new Set([...prev, ...matching.map((s) => s.id)]));
  }

  function mixGroupSaveDisabled(): boolean {
    if (!newGroupName.trim()) return true;
    if (newGroupType === 'branch') return branchFilter.size === 0;
    if (newGroupType === 'year') return yearFilter.size === 0;
    return branchFilter.size === 0 || yearFilter.size === 0;
  }

  async function saveCurrentAsMixGroup() {
    if (mixGroupSaveDisabled()) return;
    const group: MixGroup = {
      id: generateId('mixgroup'),
      name: newGroupName.trim(),
      type: newGroupType,
      branches: newGroupType === 'year' ? [] : [...branchFilter],
      years: newGroupType === 'branch' ? [] : [...yearFilter],
    };
    const next = await saveMixGroup(group);
    setMixGroups(next);
    setNewGroupName('');
  }

  async function removeMixGroup(id: string) {
    const next = await deleteMixGroup(id);
    setMixGroups(next);
  }

  async function handleCreate() {
    if (!name.trim() || !date || selectedStudents.size === 0 || selectedRooms.size === 0) return;
    const now = new Date().toISOString();
    const exam = await examRepository.create({
      id: generateId('exam'),
      name: name.trim(),
      date,
      startTime,
      endTime,
      studentIds: [...selectedStudents],
      roomIds: [...selectedRooms],
      ruleConfig,
      subjectAssignments,
      allocationIds: [],
      dutyRosterIds: [],
      createdAt: now,
      updatedAt: now,
    });
    await refreshExams();
    navigate(`/exams/${exam.id}`);
  }

  return (
    <div>
      <PageHeader title="New Exam" subtitle="Define the exam, select students and rooms, and configure allocation rules" />
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="card p-4 grid sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <div className="label">Exam Name</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mid Semester Examination" />
          </div>
          <div>
            <div className="label">Date</div>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="label">Start</div>
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <div className="label">End</div>
              <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>

        {sittingConflicts.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="font-semibold mb-1">Sitting conflict: {sittingConflicts.length} student(s) already have an overlapping exam</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {sittingConflicts.slice(0, 8).map((c, i) => {
                const student = studentsById.get(c.studentId);
                return (
                  <li key={`${c.studentId}-${c.conflictingExamId}-${i}`}>
                    {student ? `${student.rollNumber} — ${student.name}` : c.studentId} is already scheduled for{' '}
                    <strong>{c.conflictingExamName}</strong> at an overlapping date/time.
                  </li>
                );
              })}
              {sittingConflicts.length > 8 && <li>…and {sittingConflicts.length - 8} more.</li>}
            </ul>
          </div>
        )}

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Mix Groups</h2>
          <p className="text-xs text-slate-500 mb-2">
            Declare whether a saved combo mixes by <strong>branch</strong> (e.g. "CSE + ECE", every year), by{' '}
            <strong>year</strong> (e.g. "Senior years" = Year 3 + 4, every branch), or <strong>both</strong> (a specific
            branch+year combination). Reapply it with one click on this or any future exam.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {mixGroups.map((g) => {
              const type = mixGroupType(g);
              const typeLabel = type === 'branch' ? 'Branch' : type === 'year' ? 'Year' : 'Branch+Year';
              return (
                <div key={g.id} className="flex items-center gap-1.5 border border-slate-200 rounded-full pl-3 pr-1 py-1 text-xs bg-slate-50">
                  <span className="badge bg-brand-50 text-brand-700">{typeLabel}</span>
                  <button className="font-medium text-brand-700 hover:underline" onClick={() => applyMixGroup(g)}>
                    {g.name}
                  </button>
                  <span className="text-slate-400">
                    {[g.branches.length > 0 ? g.branches.join('+') : null, g.years.length > 0 ? `Y${g.years.join('+')}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <button className="text-slate-400 hover:text-red-600 px-1" onClick={() => removeMixGroup(g.id)} title="Delete group">
                    ✕
                  </button>
                </div>
              );
            })}
            {mixGroups.length === 0 && <span className="text-xs text-slate-400">No saved groups yet.</span>}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs">
              {(['branch', 'year', 'both'] as MixGroupType[]).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1.5 ${newGroupType === t ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setNewGroupType(t)}
                >
                  {t === 'branch' ? 'Branch-wise' : t === 'year' ? 'Year-wise' : 'Both'}
                </button>
              ))}
            </div>
            <input
              className="input w-56"
              placeholder="Name this combo…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button className="btn-secondary" onClick={saveCurrentAsMixGroup} disabled={mixGroupSaveDisabled()}>
              Save current filter as group
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {newGroupType === 'branch' && 'Pick branches in the filter below (years are ignored - every year is included).'}
            {newGroupType === 'year' && 'Pick years in the filter below (branches are ignored - every branch is included).'}
            {newGroupType === 'both' && 'Pick both branches and years in the filter below - only that exact combination is included.'}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Students ({selectedStudents.size} selected)</h2>
            <div className="flex gap-2 items-center text-xs">
              <MultiSelectFilter label="Branches" options={branches} selected={branchFilter} onChange={setBranchFilter} className="w-32" />
              <MultiSelectFilter label="Years" options={years} selected={yearFilter} onChange={setYearFilter} formatOption={(y) => `Year ${y}`} className="w-28" />
              <button className="btn-secondary" onClick={selectAllVisible}>
                Select shown
              </button>
              <button className="btn-ghost" onClick={clearAllVisible}>
                Clear shown
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
            {visibleStudents.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selectedStudents.has(s.id)} onChange={() => toggleStudent(s.id)} />
                <span className="font-mono text-xs w-28">{s.rollNumber}</span>
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-slate-400">
                  {s.branch} · Y{s.year} · {s.section}
                </span>
              </label>
            ))}
            {visibleStudents.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No students match.</div>}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Rooms ({selectedRooms.size} selected)</h2>
            <button className="btn-secondary text-xs" onClick={selectMinimumRooms} disabled={selectedStudents.size === 0}>
              Select minimum rooms needed
            </button>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {rooms.map((r) => (
              <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selectedRooms.has(r.id)} onChange={() => toggleRoom(r.id)} />
                <span className="flex-1">{r.name}</span>
                <span className="text-xs text-slate-400">{r.seats.filter((s) => !s.blocked && s.available).length} seats</span>
              </label>
            ))}
            {rooms.length === 0 && <div className="text-sm text-slate-400">No rooms available.</div>}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Subjects Per Group (optional)</h2>
          <SubjectAssignmentEditor
            value={subjectAssignments}
            onChange={setSubjectAssignments}
            students={students.filter((s) => selectedStudents.has(s.id))}
          />
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Allocation Rules</h2>
          <RuleConfigEditor value={ruleConfig} onChange={setRuleConfig} rooms={rooms.filter((r) => selectedRooms.has(r.id))} />
        </div>

        <div className="flex gap-2 items-center pb-6">
          <button
            className={sittingConflicts.length > 0 ? 'btn-danger' : 'btn-primary'}
            onClick={handleCreate}
            disabled={!name.trim() || !date || selectedStudents.size === 0 || selectedRooms.size === 0}
          >
            {sittingConflicts.length > 0 ? 'Create Anyway (sitting conflicts unresolved)' : 'Create Exam'}
          </button>
          {sittingConflicts.length > 0 && (
            <span className="text-xs text-red-600">Resolve conflicts above, or create anyway if this is intentional.</span>
          )}
        </div>
      </div>
    </div>
  );
}

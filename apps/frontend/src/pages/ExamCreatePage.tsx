import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultRuleConfig, generateId } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { examRepository } from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';
import RuleConfigEditor from '../components/RuleConfigEditor.js';

export default function ExamCreatePage() {
  const { students, rooms, refreshExams } = useAppData();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [ruleConfig, setRuleConfig] = useState(defaultRuleConfig());
  const [branchFilter, setBranchFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  const branches = useMemo(() => [...new Set(students.map((s) => s.branch))].sort(), [students]);
  const years = useMemo(() => [...new Set(students.map((s) => s.year))].sort((a, b) => a - b), [students]);

  const visibleStudents = useMemo(() => {
    return students.filter((s) => (!branchFilter || s.branch === branchFilter) && (!yearFilter || String(s.year) === yearFilter));
  }, [students, branchFilter, yearFilter]);

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
      allocationIds: [],
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

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Students ({selectedStudents.size} selected)</h2>
            <div className="flex gap-2 items-center text-xs">
              <select className="input w-28" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select className="input w-24" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
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
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Rooms ({selectedRooms.size} selected)</h2>
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
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Allocation Rules</h2>
          <RuleConfigEditor value={ruleConfig} onChange={setRuleConfig} rooms={rooms.filter((r) => selectedRooms.has(r.id))} />
        </div>

        <div className="flex gap-2 pb-6">
          <button className="btn-primary" onClick={handleCreate} disabled={!name.trim() || !date || selectedStudents.size === 0 || selectedRooms.size === 0}>
            Create Exam
          </button>
        </div>
      </div>
    </div>
  );
}

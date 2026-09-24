import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { compareRollNumbers, normalizeRoll, type AllocationResult, type AttendanceMark, type Student } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { allocationRepository } from '../services/repositories.js';
import { applyMarks, clearMarks, getOrCreateAttendance, parseRollList, setFinalized, UMC_REASONS } from '../services/attendanceService.js';
import PageHeader from '../components/PageHeader.js';
import StatTile from '../components/StatTile.js';

const CHIP = {
  present: 'bg-white border-slate-200 text-slate-700 hover:border-slate-400',
  absent: 'bg-red-50 border-red-300 text-red-700 line-through',
  umc: 'bg-amber-50 border-amber-400 text-amber-800',
};

/**
 * The marking screen. Everyone is present by default; the fast path is ONE tap on a roll number (absent) or
 * typing / pasting roll numbers into the box. The mode switch decides what a tap or entry means.
 */
export default function AttendanceExamPage() {
  const { examId } = useParams();
  const { exams, students, attendances, refreshAttendances } = useAppData();
  const exam = exams.find((e) => e.id === examId);
  const attendance = attendances.find((a) => a.examId === examId);
  const [allocation, setAllocation] = useState<AllocationResult | undefined>();
  const [mode, setMode] = useState<Exclude<AttendanceMark, 'stray'>>('absent');
  const [reason, setReason] = useState(UMC_REASONS[0]!);
  const [roomTab, setRoomTab] = useState<string>('');
  const [quick, setQuick] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [unknownRolls, setUnknownRolls] = useState<string[]>([]);
  const [strayBranch, setStrayBranch] = useState('');
  const [strayName, setStrayName] = useState('');

  useEffect(() => {
    if (exam?.activeAllocationId) allocationRepository.getById(exam.activeAllocationId).then(setAllocation);
    else setAllocation(undefined);
  }, [exam?.activeAllocationId]);

  const examStudents = useMemo(() => {
    const ids = new Set(exam?.studentIds ?? []);
    return students.filter((s) => ids.has(s.id) && s.active);
  }, [exam, students]);
  const studentByRoll = useMemo(() => new Map(examStudents.map((s) => [normalizeRoll(s.rollNumber), s])), [examStudents]);
  const branches = useMemo(() => [...new Set(examStudents.map((s) => s.branch))].sort(), [examStudents]);
  const entries = attendance?.entries ?? {};
  const locked = !!attendance?.finalized;

  // Rooms and who sits where (from the seat allocation this sitting uses).
  const rooms = useMemo(() => {
    const roomOf = new Map((allocation?.assignments ?? []).map((a) => [a.studentId, a.roomId] as const));
    const list = (allocation?.roomSnapshot ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      students: examStudents.filter((s) => roomOf.get(s.id) === room.id).sort((a, b) => a.branch.localeCompare(b.branch) || compareRollNumbers(a.rollNumber, b.rollNumber)),
    }));
    const seatedIds = new Set(roomOf.keys());
    const unseated = examStudents.filter((s) => !seatedIds.has(s.id)).sort((a, b) => a.branch.localeCompare(b.branch) || compareRollNumbers(a.rollNumber, b.rollNumber));
    const withStudents = list.filter((r) => r.students.length > 0);
    if (unseated.length) withStudents.push({ id: '__unseated', name: 'No seat', students: unseated });
    return withStudents;
  }, [allocation, examStudents]);

  useEffect(() => {
    if (rooms.length && !rooms.some((r) => r.id === roomTab)) setRoomTab(rooms[0]!.id);
  }, [rooms, roomTab]);

  if (!exam) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Exam not found. <Link to="/attendance" className="text-brand-700 hover:underline">Back to attendance</Link>
      </div>
    );
  }

  const stats = {
    onRoll: examStudents.length,
    absent: Object.values(entries).filter((e) => e.mark === 'absent').length,
    umc: Object.values(entries).filter((e) => e.mark === 'umc').length,
    stray: Object.values(entries).filter((e) => e.mark === 'stray').length,
  };

  async function mark(rolls: Array<{ rollNumber: string; mark: AttendanceMark; reason?: string; name?: string; branch?: string }>) {
    const base = attendance ?? (await getOrCreateAttendance(exam!.id));
    await applyMarks(base, rolls);
    await refreshAttendances();
  }

  async function tapChip(student: Student) {
    if (locked) return;
    const roll = normalizeRoll(student.rollNumber);
    const current = entries[roll];
    if (current && current.mark === mode) {
      await clearMarks(attendance!, [roll]);
      await refreshAttendances();
    } else {
      await mark([{ rollNumber: roll, mark: mode, reason: mode === 'umc' ? reason : undefined }]);
    }
  }

  async function submitQuick() {
    if (locked) return;
    const rolls = parseRollList(quick);
    if (rolls.length === 0) return;
    const known = rolls.filter((r) => studentByRoll.has(r));
    const unknown = rolls.filter((r) => !studentByRoll.has(r));
    if (known.length) await mark(known.map((r) => ({ rollNumber: r, mark: mode, reason: mode === 'umc' ? reason : undefined })));
    setUnknownRolls(unknown);
    if (unknown.length && !strayBranch) setStrayBranch(branches[0] ?? '');
    setMessage(`${known.length} marked ${mode === 'umc' ? 'unfair means' : 'absent'}${unknown.length ? `; ${unknown.length} not on this exam's list (add as stray below)` : ''}.`);
    setQuick('');
  }

  async function addStrays() {
    await mark(unknownRolls.map((r) => ({ rollNumber: r, mark: 'stray' as const, branch: strayBranch, name: strayName || undefined })));
    setMessage(`${unknownRolls.length} stray case(s) added under ${strayBranch}.`);
    setUnknownRolls([]);
    setStrayName('');
  }

  const activeRoom = rooms.find((r) => r.id === roomTab);
  const absentByRoom = rooms
    .map((r) => ({ room: r, absent: r.students.filter((s) => entries[normalizeRoll(s.rollNumber)]?.mark === 'absent') }))
    .filter((x) => x.absent.length > 0);
  const umcList = Object.values(entries).filter((e) => e.mark === 'umc').sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));
  const strayList = Object.values(entries).filter((e) => e.mark === 'stray').sort((a, b) => compareRollNumbers(a.rollNumber, b.rollNumber));

  return (
    <div>
      <PageHeader
        title={exam.name}
        subtitle={`${exam.date} · ${exam.startTime}–${exam.endTime} · attendance`}
        actions={
          <>
            <Link to="/attendance" className="btn-ghost">
              All sittings
            </Link>
            <Link to={`/attendance/${exam.id}/sheets`} className="btn-secondary">
              Attendance sheets
            </Link>
            <Link to={`/attendance/${exam.id}/memos`} className="btn-secondary">
              Memos
            </Link>
            <button
              className={locked ? 'btn-secondary' : 'btn-primary'}
              onClick={async () => {
                const base = attendance ?? (await getOrCreateAttendance(exam.id));
                await setFinalized(base, !locked);
                await refreshAttendances();
              }}
            >
              {locked ? 'Unlock' : 'Finalize'}
            </button>
          </>
        }
      />
      <div className="p-6 space-y-4">
        {!exam.activeAllocationId && (
          <div className="card p-3 text-sm text-amber-800 bg-amber-50 border-amber-200">
            This sitting has no seating plan yet, so students are not grouped by room.{' '}
            <Link to={`/exams/${exam.id}`} className="underline">
              Generate the allocation
            </Link>
            .
          </div>
        )}
        {locked && <div className="card p-3 text-sm text-emerald-800 bg-emerald-50 border-emerald-200">Attendance is finalized. Unlock to make changes.</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="On roll" value={stats.onRoll} />
          <StatTile label="Absent" value={stats.absent} tone={stats.absent ? 'bad' : 'default'} />
          <StatTile label="Unfair means" value={stats.umc} tone={stats.umc ? 'warn' : 'default'} />
          <StatTile label="Stray" value={stats.stray} />
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm">
              <button className={`px-3 py-1.5 ${mode === 'absent' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} onClick={() => setMode('absent')}>
                Mark absent
              </button>
              <button className={`px-3 py-1.5 ${mode === 'umc' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600'}`} onClick={() => setMode('umc')}>
                Mark unfair means
              </button>
            </div>
            {mode === 'umc' && (
              <select className="input max-w-[14rem]" value={reason} onChange={(e) => setReason(e.target.value)}>
                {UMC_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            )}
            <span className="text-xs text-slate-500">Tap a roll number below to mark it; tap again to undo.</span>
          </div>
          <div className="flex gap-2">
            <textarea
              className="input flex-1 resize-y"
              rows={2}
              placeholder="Type or paste roll numbers (one per line, or separated by comma / space) and press Enter. Shift+Enter for a new line."
              value={quick}
              disabled={locked}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitQuick();
                }
              }}
            />
            <button className="btn-primary" disabled={locked || !quick.trim()} onClick={submitQuick}>
              Mark
            </button>
          </div>
          {message && <div className="text-xs text-slate-600">{message}</div>}
          {unknownRolls.length > 0 && (
            <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm space-y-2">
              <div>
                Not on this exam's list: <strong>{unknownRolls.join(', ')}</strong>. Add as stray case(s)?
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <select className="input max-w-[10rem]" value={strayBranch} onChange={(e) => setStrayBranch(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
                <input className="input max-w-[14rem]" placeholder="Name (optional)" value={strayName} onChange={(e) => setStrayName(e.target.value)} />
                <button className="btn-primary" onClick={addStrays}>
                  Add as stray
                </button>
                <button className="btn-ghost" onClick={() => setUnknownRolls([])}>
                  Ignore
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_20rem] gap-4 items-start">
          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => {
                const absent = r.students.filter((s) => entries[normalizeRoll(s.rollNumber)]?.mark === 'absent').length;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRoomTab(r.id)}
                    className={`px-3 py-1.5 rounded-md border text-sm ${roomTab === r.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {r.name} <span className="opacity-75">({r.students.length}{absent ? ` · ${absent} abs` : ''})</span>
                  </button>
                );
              })}
            </div>
            {activeRoom ? (
              <div className="space-y-3">
                {[...new Set(activeRoom.students.map((s) => s.branch))].map((branch) => (
                  <div key={branch}>
                    <div className="text-xs font-semibold text-slate-500 mb-1">{branch}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeRoom.students
                        .filter((s) => s.branch === branch)
                        .map((s) => {
                          const e = entries[normalizeRoll(s.rollNumber)];
                          const cls = e?.mark === 'absent' ? CHIP.absent : e?.mark === 'umc' ? CHIP.umc : CHIP.present;
                          return (
                            <button
                              key={s.id}
                              disabled={locked}
                              title={`${s.name}${e?.reason ? ` — ${e.reason}` : ''}`}
                              onClick={() => tapChip(s)}
                              className={`px-2 py-1 rounded border text-xs font-mono ${cls}`}
                            >
                              {s.rollNumber}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No students on this exam.</div>
            )}
          </div>

          <div className="card p-4 space-y-3 text-sm">
            <div className="font-semibold text-slate-800">Absent by room</div>
            {absentByRoom.length === 0 && <div className="text-slate-400 text-xs">Nobody marked absent yet.</div>}
            {absentByRoom.map(({ room, absent }) => (
              <div key={room.id}>
                <div className="text-xs font-semibold text-slate-500">
                  {room.name} · {absent.length}
                </div>
                <div className="font-mono text-xs text-red-700 break-words">{absent.map((s) => s.rollNumber).join(', ')}</div>
              </div>
            ))}
            <div className="font-semibold text-slate-800 pt-2 border-t border-slate-100">Unfair means</div>
            {umcList.length === 0 && <div className="text-slate-400 text-xs">None.</div>}
            {umcList.map((e) => (
              <div key={e.rollNumber} className="text-xs">
                <span className="font-mono text-amber-800">{e.rollNumber}</span> <span className="text-slate-500">{e.reason}</span>
              </div>
            ))}
            <div className="font-semibold text-slate-800 pt-2 border-t border-slate-100">Stray cases</div>
            {strayList.length === 0 && <div className="text-slate-400 text-xs">None.</div>}
            {strayList.map((e) => (
              <div key={e.rollNumber} className="text-xs">
                <span className="font-mono text-violet-800">{e.rollNumber}</span> <span className="text-slate-500">{e.branch}{e.name ? ` · ${e.name}` : ''}</span>
                {!locked && (
                  <button
                    className="ml-2 text-slate-400 hover:text-red-600"
                    onClick={async () => {
                      await clearMarks(attendance!, [e.rollNumber]);
                      await refreshAttendances();
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

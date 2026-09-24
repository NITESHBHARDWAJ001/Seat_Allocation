import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeRoll } from '../vendor/core/index.js';
import { buildSecrecyMemos, type SecrecyMemo } from '../vendor/allocation-engine/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { applyMarks, clearMarks, getOrCreateAttendance, UMC_REASONS } from '../services/attendanceService.js';
import { memoExamName, sessionLabel } from '../services/attendanceExport.js';
import PageHeader from '../components/PageHeader.js';

interface PaperRow {
  memo: SecrecyMemo;
  examName: string;
  present: number;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);

/**
 * Branch-wise reporting: all branches -> one branch (its papers across every sitting) -> one paper, where present
 * roll numbers are listed in order with absentees and unfair-means cases below, and can still be marked.
 */
export default function AttendanceReportsPage() {
  const { exams, students, attendances, refreshAttendances } = useAppData();
  const [branch, setBranch] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'absent' | 'umc'>('absent');
  const [reason, setReason] = useState(UMC_REASONS[0]!);

  const papers = useMemo<PaperRow[]>(() => {
    const byExam = new Map(attendances.map((a) => [a.examId, a]));
    const rows: PaperRow[] = [];
    for (const exam of exams) {
      const examStudents = students.filter((s) => exam.studentIds.includes(s.id));
      for (const memo of buildSecrecyMemos({ exam, students: examStudents, attendance: byExam.get(exam.id) })) {
        rows.push({ memo, examName: exam.name, present: memo.onRoll - memo.absent.length - memo.umc.length });
      }
    }
    return rows.sort((a, b) => (a.memo.date + a.memo.startTime).localeCompare(b.memo.date + b.memo.startTime));
  }, [exams, students, attendances]);

  const branchStats = useMemo(() => {
    const map = new Map<string, { papers: number; onRoll: number; absent: number; umc: number; stray: number }>();
    for (const { memo } of papers) {
      const s = map.get(memo.branch) ?? { papers: 0, onRoll: 0, absent: 0, umc: 0, stray: 0 };
      s.papers += 1;
      s.onRoll += memo.onRoll;
      s.absent += memo.absent.length;
      s.umc += memo.umc.length;
      s.stray += memo.stray.length;
      map.set(memo.branch, s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [papers]);

  const branchPapers = papers.filter((p) => p.memo.branch === branch);
  const current = papers.find((p) => p.memo.key === selected);
  const attendance = current ? attendances.find((a) => a.examId === current.memo.examId) : undefined;
  const locked = !!attendance?.finalized;

  async function tapRoll(roll: string) {
    if (!current || locked) return;
    const norm = normalizeRoll(roll);
    const existing = attendance?.entries[norm];
    if (existing && existing.mark === mode) {
      await clearMarks(attendance!, [norm]);
    } else {
      const base = attendance ?? (await getOrCreateAttendance(current.memo.examId));
      await applyMarks(base, [{ rollNumber: norm, mark: mode, reason: mode === 'umc' ? reason : undefined }]);
    }
    await refreshAttendances();
  }

  const crumb = (
    <div className="flex items-center gap-2 text-sm">
      <button className={branch ? 'text-brand-700 hover:underline' : 'font-semibold'} onClick={() => { setBranch(null); setSelected(null); }}>
        All branches
      </button>
      {branch && (
        <>
          <span className="text-slate-400">/</span>
          <button className={current ? 'text-brand-700 hover:underline' : 'font-semibold'} onClick={() => setSelected(null)}>
            {branch}
          </button>
        </>
      )}
      {current && (
        <>
          <span className="text-slate-400">/</span>
          <span className="font-semibold">{current.memo.subjectName}</span>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Attendance reports" subtitle="Branch-wise present, absent and unfair-means summary" actions={<Link to="/attendance" className="btn-ghost">All sittings</Link>} />
      <div className="p-6 space-y-4">
        {crumb}

        {!branch && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchStats.map(([name, s]) => (
              <button key={name} className="card p-4 text-left hover:border-brand-400" onClick={() => setBranch(name)}>
                <div className="flex justify-between items-baseline">
                  <div className="text-base font-semibold">{name}</div>
                  <div className="text-xs text-slate-500">{s.papers} paper(s)</div>
                </div>
                <div className="mt-2 grid grid-cols-4 text-center text-xs text-slate-500">
                  <div><div className="text-lg font-semibold text-slate-900">{s.onRoll}</div>on roll</div>
                  <div><div className="text-lg font-semibold text-red-600">{s.absent}</div>absent</div>
                  <div><div className="text-lg font-semibold text-amber-600">{s.umc}</div>UMC</div>
                  <div><div className="text-lg font-semibold text-emerald-600">{pct(s.onRoll - s.absent - s.umc, s.onRoll)}</div>present</div>
                </div>
              </button>
            ))}
            {branchStats.length === 0 && <div className="card p-8 text-sm text-slate-500 sm:col-span-3 text-center">No data yet.</div>}
          </div>
        )}

        {branch && !current && (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Sem</th>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>On roll</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>UMC</th>
                  <th>Stray</th>
                </tr>
              </thead>
              <tbody>
                {branchPapers.map(({ memo, present }) => (
                  <tr key={memo.key} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(memo.key)}>
                    <td>{memo.date}</td>
                    <td>{sessionLabel(memo.startTime)}</td>
                    <td>{memo.semester ?? '—'}</td>
                    <td className="font-medium">{memo.subjectName}</td>
                    <td className="text-slate-500">{memo.subjectCode}</td>
                    <td>{memo.onRoll}</td>
                    <td className="text-emerald-700">{present}</td>
                    <td className={memo.absent.length ? 'text-red-700 font-medium' : 'text-slate-400'}>{memo.absent.length}</td>
                    <td className={memo.umc.length ? 'text-amber-700 font-medium' : 'text-slate-400'}>{memo.umc.length}</td>
                    <td className={memo.stray.length ? 'text-violet-700 font-medium' : 'text-slate-400'}>{memo.stray.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {current && (
          <div className="space-y-4">
            <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <div className="font-semibold">{current.memo.subjectName}</div>
                <div className="text-xs text-slate-500">
                  {current.memo.branch} · {memoExamName(current.memo)} · {current.memo.date} · {sessionLabel(current.memo.startTime)} · {current.memo.subjectCode}
                </div>
              </div>
              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm ml-auto">
                <button className={`px-3 py-1.5 ${mode === 'absent' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} onClick={() => setMode('absent')}>Mark absent</button>
                <button className={`px-3 py-1.5 ${mode === 'umc' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600'}`} onClick={() => setMode('umc')}>Mark UMC</button>
              </div>
              {mode === 'umc' && (
                <select className="input max-w-[12rem]" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {UMC_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              )}
              <Link to={`/attendance/${current.memo.examId}/memos`} className="btn-secondary">Memo</Link>
            </div>

            <div className="card p-4">
              <div className="text-sm font-semibold text-emerald-700 mb-2">Present ({current.present})</div>
              <div className="flex flex-wrap gap-1.5">
                {current.memo.rollList
                  .filter((r) => !attendance?.entries[normalizeRoll(r)])
                  .map((r) => (
                    <button key={r} disabled={locked} onClick={() => tapRoll(r)} className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono hover:border-slate-400">
                      {r}
                    </button>
                  ))}
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {(
                [
                  ['Absent', current.memo.absent, 'text-red-700 border-red-200 bg-red-50'],
                  ['Unfair means', current.memo.umc, 'text-amber-800 border-amber-300 bg-amber-50'],
                  ['Stray', current.memo.stray, 'text-violet-800 border-violet-200 bg-violet-50'],
                ] as const
              ).map(([title, list, cls]) => (
                <div key={title} className="card p-4">
                  <div className="text-sm font-semibold mb-2">
                    {title} ({list.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.length === 0 && <span className="text-xs text-slate-400">None</span>}
                    {list.map((e) => (
                      <button key={e.rollNumber} disabled={locked || title === 'Stray'} onClick={() => tapRoll(e.rollNumber)} title={e.reason} className={`px-2 py-1 rounded border text-xs font-mono ${cls}`}>
                        {e.rollNumber}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {locked && <div className="text-xs text-emerald-700">This sitting is finalized; unlock it on the marking screen to change marks.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

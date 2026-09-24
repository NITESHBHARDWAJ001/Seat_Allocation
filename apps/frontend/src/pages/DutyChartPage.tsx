import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DutyWindow } from '../vendor/core/index.js';
import { examsInWindow } from '../vendor/allocation-engine/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { getDutyWindows } from '../services/dutyWindows.js';
import PageHeader from '../components/PageHeader.js';

/**
 * Reads the shared app data (exams + their active duty rosters), so it refreshes on its own
 * whenever duties are generated on the Duty Windows page, regenerated on an exam, or moved by hand.
 */
export default function DutyChartPage() {
  const { teachers, exams, dutyRosters, rooms } = useAppData();
  const [search, setSearch] = useState('');
  const [windows, setWindows] = useState<DutyWindow[]>([]);
  const [windowId, setWindowId] = useState('');

  useEffect(() => {
    getDutyWindows().then(setWindows);
  }, []);
  const selectedWindow = windows.find((w) => w.id === windowId);

  const sortedExams = useMemo(() => {
    const list = selectedWindow ? examsInWindow(selectedWindow, exams) : exams.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return list;
  }, [exams, selectedWindow]);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const rosterByExamId = useMemo(() => {
    const map = new Map<string, (typeof dutyRosters)[number]>();
    for (const exam of exams) {
      const roster = dutyRosters.find((r) => r.id === exam.activeDutyRosterId);
      if (roster) map.set(exam.id, roster);
    }
    return map;
  }, [exams, dutyRosters]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const exam of sortedExams) {
      const roster = rosterByExamId.get(exam.id);
      if (!roster) continue;
      for (const a of roster.assignments) map.set(a.teacherId, (map.get(a.teacherId) ?? 0) + 1);
    }
    return map;
  }, [sortedExams, rosterByExamId]);

  const filteredTeachers = useMemo(() => {
    const list = search.trim() ? teachers.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase())) : teachers;
    return list.slice().sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [teachers, search, totals]);

  const spread = useMemo(() => {
    const eligible = teachers.filter((t) => t.active && !selectedWindow?.perTeacher[t.id]?.exempt);
    if (eligible.length === 0) return 0;
    const v = eligible.map((t) => totals.get(t.id) ?? 0);
    return Math.max(...v) - Math.min(...v);
  }, [teachers, totals, selectedWindow]);

  function roomForTeacher(examId: string, teacherId: string): string | null {
    const roster = rosterByExamId.get(examId);
    if (!roster) return null;
    const assignment = roster.assignments.find((a) => a.teacherId === teacherId);
    if (!assignment) return null;
    return roomsById.get(assignment.roomId)?.name ?? assignment.roomId;
  }

  function fillFor(examId: string): { filled: number; needed: number } | null {
    const roster = rosterByExamId.get(examId);
    if (!roster) return null;
    return { filled: roster.assignments.length, needed: Object.values(roster.roomDutyTargets).reduce((a, b) => a + b, 0) };
  }

  function quotaText(teacherId: string): string {
    if (!selectedWindow) return '';
    const q = selectedWindow.perTeacher[teacherId] ?? {};
    if (q.exempt) return 'exempt';
    const min = q.min ?? selectedWindow.defaultMinDuties;
    const max = q.max ?? selectedWindow.defaultMaxDuties;
    return [min !== undefined ? `min ${min}` : '', max !== undefined ? `max ${max}` : ''].filter(Boolean).join(' · ');
  }

  return (
    <div>
      <PageHeader title="Duty Chart" subtitle="Every teacher's invigilation duty across all scheduled exams" />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input className="input max-w-xs" placeholder="Search teacher name..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-xs" value={windowId} onChange={(e) => setWindowId(e.target.value)}>
            <option value="">All exams</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.startDate} → {w.endDate})
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {sortedExams.length} session(s) · busiest − quietest teacher: <strong className={spread <= 1 ? 'text-emerald-700' : 'text-amber-700'}>{spread}</strong>
          </span>
        </div>

        {sortedExams.length === 0 || teachers.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            {teachers.length === 0 ? (
              <>
                No teachers yet.{' '}
                <Link to="/teachers" className="text-brand-700 hover:underline">
                  Add some
                </Link>
                .
              </>
            ) : (
              'No exams scheduled in this range.'
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white">Teacher</th>
                  <th>Total</th>
                  {sortedExams.map((exam) => (
                    <th key={exam.id}>
                      <Link to={`/exams/${exam.id}`} className="hover:underline">
                        {exam.date}
                        <br />
                        <span className="font-normal text-slate-400">
                          {exam.startTime}–{exam.endTime}
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map((t) => {
                  const total = totals.get(t.id) ?? 0;
                  const q = selectedWindow?.perTeacher[t.id];
                  const min = q?.min ?? selectedWindow?.defaultMinDuties;
                  const max = q?.max ?? selectedWindow?.defaultMaxDuties;
                  const bad = (min !== undefined && total < min && !q?.exempt) || (max !== undefined && total > max);
                  return (
                    <tr key={t.id}>
                      <td className="sticky left-0 bg-white font-medium">
                        {t.name} <span className="text-xs text-slate-400">({t.branch})</span>
                      </td>
                      <td className={bad ? 'text-amber-700 font-semibold' : 'font-semibold'}>
                        {total}
                        {quotaText(t.id) && <div className="text-[10px] font-normal text-slate-400">{quotaText(t.id)}</div>}
                      </td>
                      {sortedExams.map((exam) => {
                        const room = roomForTeacher(exam.id, t.id);
                        return (
                          <td key={exam.id} className={room ? 'text-emerald-700 font-medium' : 'text-slate-300'}>
                            {room ?? '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="sticky left-0 bg-white text-xs text-slate-500">Slots filled</td>
                  <td />
                  {sortedExams.map((exam) => {
                    const f = fillFor(exam.id);
                    return (
                      <td key={exam.id} className={`text-xs ${!f ? 'text-slate-300' : f.filled < f.needed ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>
                        {f ? `${f.filled}/${f.needed}` : 'no roster'}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

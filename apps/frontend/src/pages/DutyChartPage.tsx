import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../services/AppDataContext.js';
import PageHeader from '../components/PageHeader.js';

export default function DutyChartPage() {
  const { teachers, exams, dutyRosters, rooms } = useAppData();
  const [search, setSearch] = useState('');

  const sortedExams = useMemo(
    () => exams.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [exams]
  );
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const rosterByExamId = useMemo(() => {
    const map = new Map<string, (typeof dutyRosters)[number]>();
    for (const exam of exams) {
      const roster = dutyRosters.find((r) => r.id === exam.activeDutyRosterId);
      if (roster) map.set(exam.id, roster);
    }
    return map;
  }, [exams, dutyRosters]);

  const filteredTeachers = useMemo(() => {
    const list = search.trim() ? teachers.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase())) : teachers;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers, search]);

  function roomForTeacher(examId: string, teacherId: string): string | null {
    const roster = rosterByExamId.get(examId);
    if (!roster) return null;
    const assignment = roster.assignments.find((a) => a.teacherId === teacherId);
    if (!assignment) return null;
    return roomsById.get(assignment.roomId)?.name ?? assignment.roomId;
  }

  return (
    <div>
      <PageHeader title="Duty Chart" subtitle="Every teacher's invigilation duty across all scheduled exams" />
      <div className="p-6 space-y-4">
        <input className="input max-w-xs" placeholder="Search teacher name..." value={search} onChange={(e) => setSearch(e.target.value)} />

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
              'No exams scheduled yet.'
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white">Teacher</th>
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
                {filteredTeachers.map((t) => (
                  <tr key={t.id}>
                    <td className="sticky left-0 bg-white font-medium">
                      {t.name} <span className="text-xs text-slate-400">({t.branch})</span>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

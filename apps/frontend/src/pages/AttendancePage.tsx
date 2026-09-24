import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../services/AppDataContext.js';
import PageHeader from '../components/PageHeader.js';

/** Level 1 of the attendance module: every sitting with its marking progress. One click opens the marking screen. */
export default function AttendancePage() {
  const { exams, attendances } = useAppData();
  const byExam = useMemo(() => new Map(attendances.map((a) => [a.examId, a])), [attendances]);
  const sorted = useMemo(() => exams.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)), [exams]);

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Mark absentees and unfair-means cases per sitting, then print attendance sheets and answer-book memos"
        actions={
          <Link to="/attendance/reports" className="btn-secondary">
            Reports by branch
          </Link>
        }
      />
      <div className="p-6">
        {sorted.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">No exams yet. Import a datesheet on the Exams page first.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Sitting</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>On roll</th>
                  <th>Absent</th>
                  <th>UMC</th>
                  <th>Stray</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((exam) => {
                  const att = byExam.get(exam.id);
                  const entries = Object.values(att?.entries ?? {});
                  const count = (m: string) => entries.filter((e) => e.mark === m).length;
                  const seated = !!exam.activeAllocationId;
                  return (
                    <tr key={exam.id} className="hover:bg-slate-50">
                      <td className="font-medium">{exam.name}</td>
                      <td>{exam.date}</td>
                      <td>
                        {exam.startTime}–{exam.endTime}
                      </td>
                      <td>{exam.studentIds.length}</td>
                      <td className={count('absent') ? 'text-red-700 font-medium' : 'text-slate-400'}>{count('absent')}</td>
                      <td className={count('umc') ? 'text-amber-700 font-medium' : 'text-slate-400'}>{count('umc')}</td>
                      <td className={count('stray') ? 'text-violet-700 font-medium' : 'text-slate-400'}>{count('stray')}</td>
                      <td>
                        {att?.finalized ? (
                          <span className="text-emerald-700 font-medium">Finalized</span>
                        ) : !seated ? (
                          <span className="text-amber-700">No seating yet</span>
                        ) : entries.length ? (
                          <span className="text-slate-600">In progress</span>
                        ) : (
                          <span className="text-slate-400">Not started</span>
                        )}
                      </td>
                      <td className="text-right">
                        <Link to={`/attendance/${exam.id}`} className="btn-primary">
                          Mark
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

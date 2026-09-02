import { Link } from 'react-router-dom';
import { roomAvailableSeats } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import PageHeader from '../components/PageHeader.js';
import StatTile from '../components/StatTile.js';

export default function DashboardPage() {
  const { students, rooms, exams, loading } = useAppData();

  const activeStudents = students.filter((s) => s.active).length;
  const totalSeats = rooms.reduce((sum, r) => sum + roomAvailableSeats(r).length, 0);
  const enabledRooms = rooms.filter((r) => r.enabled).length;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of students, rooms, and exams" />
      <div className="p-6 space-y-6">
        {loading ? (
          <div className="text-sm text-slate-500">Loading local data...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Students" value={activeStudents} />
              <StatTile label="Available Seats" value={totalSeats} />
              <StatTile label="Rooms" value={`${enabledRooms}/${rooms.length}`} />
              <StatTile label="Exams" value={exams.length} />
            </div>

            <div className="card">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Exams</h2>
                <Link to="/exams/new" className="btn-primary">
                  New Exam
                </Link>
              </div>
              {exams.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No exams yet. Create one to start allocating seats.
                </div>
              ) : (
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Students</th>
                      <th>Rooms</th>
                      <th>Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exams.map((exam) => (
                      <tr key={exam.id} className="hover:bg-slate-50 cursor-pointer">
                        <td>
                          <Link to={`/exams/${exam.id}`} className="text-brand-700 font-medium hover:underline">
                            {exam.name}
                          </Link>
                        </td>
                        <td>{exam.date}</td>
                        <td>{exam.studentIds.length}</td>
                        <td>{exam.roomIds.length}</td>
                        <td>{exam.activeAllocationId ? 'Generated' : 'Not generated'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

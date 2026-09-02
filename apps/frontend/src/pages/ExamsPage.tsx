import { Link } from 'react-router-dom';
import { useAppData } from '../services/AppDataContext.js';
import { examRepository } from '../services/repositories.js';
import PageHeader from '../components/PageHeader.js';

export default function ExamsPage() {
  const { exams, refreshExams } = useAppData();

  async function remove(id: string) {
    if (!confirm('Delete this exam? This does not delete students or rooms.')) return;
    await examRepository.remove(id);
    await refreshExams();
  }

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle={`${exams.length} total`}
        actions={
          <Link to="/exams/new" className="btn-primary">
            New Exam
          </Link>
        }
      />
      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Time</th>
                <th>Students</th>
                <th>Rooms</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id} className="hover:bg-slate-50">
                  <td>
                    <Link to={`/exams/${exam.id}`} className="text-brand-700 font-medium hover:underline">
                      {exam.name}
                    </Link>
                  </td>
                  <td>{exam.date}</td>
                  <td>
                    {exam.startTime}–{exam.endTime}
                  </td>
                  <td>{exam.studentIds.length}</td>
                  <td>{exam.roomIds.length}</td>
                  <td>{exam.activeAllocationId ? 'Generated' : 'Not generated'}</td>
                  <td>
                    <button className="btn-ghost text-red-600" onClick={() => remove(exam.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {exams.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-8">
                    No exams yet.
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

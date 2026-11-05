import { Link } from 'react-router-dom';
import { roomAvailableSeats } from '../vendor/core/index.js';
import { useAppData } from '../services/AppDataContext.js';
import { useAuth } from '../services/AuthContext.js';
import PageHeader from '../components/PageHeader.js';
import StatTile from '../components/StatTile.js';
import Icon from '../components/Icon.js';

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? { day: '--', mon: iso, wk: '' } : { day: String(d.getDate()).padStart(2, '0'), mon: d.toLocaleString('en', { month: 'short' }), wk: d.toLocaleString('en', { weekday: 'short' }) };
};

/** A strip of little seats: filled ones are students, hollow ones are spare capacity. */
function SeatMeter({ filled, total }: { filled: number; total: number }) {
  const cells = 40;
  const lit = total === 0 ? 0 : Math.min(cells, Math.round((filled / total) * cells));
  return (
    <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[3px] max-w-md">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={`aspect-square rounded-[3px] ${i < lit ? (filled > total ? 'bg-pen-500' : 'bg-brand-800') : 'bg-slate-200'}`} style={{ animation: `pop .4s ${i * 8}ms both` }} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { students, rooms, exams, teachers, loading } = useAppData();
  const { user } = useAuth();

  const activeStudents = students.filter((s) => s.active).length;
  const totalSeats = rooms.reduce((sum, r) => sum + roomAvailableSeats(r).length, 0);
  const enabledRooms = rooms.filter((r) => r.enabled).length;
  const activeTeachers = teachers.filter((t) => t.active).length;
  const sorted = [...exams].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  const generated = exams.filter((e) => e.activeAllocationId).length;

  const steps = [
    { done: students.length > 0, label: 'Add students', to: '/students', note: 'Import an Excel sheet or paste a list' },
    { done: rooms.length > 0, label: 'Add rooms', to: '/rooms', note: 'Rows × seats, block broken desks' },
    { done: teachers.length > 0, label: 'Add invigilators', to: '/teachers', note: 'Needed for the duty roster' },
    { done: exams.length > 0, label: 'Create an exam', to: '/exams/new', note: 'Or import the whole date sheet' },
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={user ? `Hello, ${user.name.split(' ')[0]}` : 'Exam desk'}
        subtitle="Everything for the exam hall — who sits where, who watches, who turned up."
        actions={
          <Link to="/exams/new" className="btn-primary">
            <Icon name="plus" size={16} /> New exam
          </Link>
        }
      />
      <div className="p-4 sm:p-8 space-y-8">
        {loading ? (
          <div className="text-sm text-slate-500">Loading local data...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1">
              <StatTile label="Students" value={activeStudents} hint="active on roll" />
              <StatTile label="Seats" value={totalSeats} hint={`in ${enabledRooms} open rooms`} tone={activeStudents > totalSeats ? 'bad' : 'default'} />
              <StatTile label="Rooms" value={`${enabledRooms}/${rooms.length}`} hint="enabled" />
              <StatTile label="Invigilators" value={activeTeachers} hint="available" />
              <StatTile label="Exams" value={exams.length} hint={`${generated} seated`} tone={exams.length > 0 && generated === exams.length ? 'good' : 'default'} />
            </div>

            <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
              <section className="card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between tear">
                  <div>
                    <div className="eyebrow">Timetable</div>
                    <h2 className="text-xl font-semibold text-brand-900">Exam sittings</h2>
                  </div>
                  <Link to="/exams" className="btn-ghost">
                    View all <Icon name="arrow" size={14} />
                  </Link>
                </div>
                {exams.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-marker-200 text-brand-900 grid place-items-center">
                      <Icon name="exams" size={24} />
                    </div>
                    <div className="font-display text-lg text-brand-900">No sittings scheduled yet</div>
                    <p className="text-sm text-slate-500 mt-1">Create one to start allocating seats.</p>
                  </div>
                ) : (
                  <ul>
                    {sorted.slice(0, 8).map((exam) => {
                      const d = fmtDate(exam.date);
                      return (
                        <li key={exam.id}>
                          <Link to={`/exams/${exam.id}`} className="flex items-center gap-4 px-5 py-3.5 border-b border-dashed border-slate-300/80 last:border-0 hover:bg-marker-100/40 transition-colors">
                            <div className="w-14 shrink-0 rounded-xl bg-brand-900 text-paper text-center py-1.5 leading-none">
                              <div className="font-mono text-[9.5px] uppercase tracking-widest text-brand-200">{d.mon}</div>
                              <div className="font-display text-2xl font-semibold mt-0.5">{d.day}</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-brand-900 line-clamp-2 sm:truncate">{exam.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                {d.wk} · {exam.startTime}–{exam.endTime} · {exam.studentIds.length} students · {exam.roomIds.length} rooms
                              </div>
                            </div>
                            <span className={`badge shrink-0 ${exam.activeAllocationId ? 'bg-emerald-100 text-emerald-800' : 'bg-marker-200 text-brand-900'}`}>{exam.activeAllocationId ? 'Seated' : 'Needs seating'}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="space-y-6">
                <section className="card p-5">
                  <div className="eyebrow">Capacity</div>
                  <h2 className="text-xl font-semibold text-brand-900 mb-3">Seats vs students</h2>
                  <SeatMeter filled={activeStudents} total={totalSeats} />
                  <p className="text-xs text-slate-500 mt-3 font-mono">
                    {activeStudents} students · {totalSeats} seats {totalSeats > 0 && `· ${Math.round((activeStudents / totalSeats) * 100)}% full`}
                  </p>
                </section>

                <section className="card p-5">
                  <div className="eyebrow">{setupDone ? 'All set' : 'Getting started'}</div>
                  <h2 className="text-xl font-semibold text-brand-900 mb-3">Setup checklist</h2>
                  <ol className="space-y-2.5">
                    {steps.map((st, i) => (
                      <li key={st.label}>
                        <Link to={st.to} className="flex items-center gap-3 group">
                          <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-mono font-semibold border-2 ${st.done ? 'bg-brand-800 border-brand-800 text-paper' : 'border-slate-300 text-slate-500 group-hover:border-pen-500 group-hover:text-pen-600'}`}>{st.done ? '✓' : i + 1}</span>
                          <span className="min-w-0">
                            <span className={`block text-sm font-semibold ${st.done ? 'text-slate-400 line-through decoration-pen-500' : 'text-brand-900'}`}>{st.label}</span>
                            <span className="block text-xs text-slate-500 truncate">{st.note}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

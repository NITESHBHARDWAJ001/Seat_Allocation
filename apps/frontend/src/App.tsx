import { NavLink, Route, Routes } from 'react-router-dom';
import { useAppData } from './services/AppDataContext.js';
import DashboardPage from './pages/DashboardPage.js';
import StudentsPage from './pages/StudentsPage.js';
import RoomsPage from './pages/RoomsPage.js';
import RoomLayoutPage from './pages/RoomLayoutPage.js';
import ExamsPage from './pages/ExamsPage.js';
import ExamCreatePage from './pages/ExamCreatePage.js';
import ExamDetailPage from './pages/ExamDetailPage.js';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/students', label: 'Students' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/exams', label: 'Exams' },
];

export default function App() {
  const { error } = useAppData();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col no-print">
        <div className="px-4 py-4 border-b border-slate-200">
          <div className="font-semibold text-slate-900 text-sm leading-tight">Exam Room Allocator</div>
          <div className="text-xs text-slate-400 mt-0.5">College Administration</div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-2 no-print">{error}</div>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<RoomLayoutPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/new" element={<ExamCreatePage />} />
          <Route path="/exams/:examId" element={<ExamDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}

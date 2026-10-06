import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './services/AuthContext.js';
import { useSync } from './services/SyncContext.js';
import UsersPage from './pages/UsersPage.js';
import { useAppData } from './services/AppDataContext.js';
import DashboardPage from './pages/DashboardPage.js';
import StudentsPage from './pages/StudentsPage.js';
import RoomsPage from './pages/RoomsPage.js';
import RoomLayoutPage from './pages/RoomLayoutPage.js';
import TeachersPage from './pages/TeachersPage.js';
import ExamsPage from './pages/ExamsPage.js';
import ExamCreatePage from './pages/ExamCreatePage.js';
import ExamDetailPage from './pages/ExamDetailPage.js';
import DutyChartPage from './pages/DutyChartPage.js';
import DutyWindowsPage from './pages/DutyWindowsPage.js';
import AttendancePage from './pages/AttendancePage.js';
import AttendanceExamPage from './pages/AttendanceExamPage.js';
import AttendanceSheetsPage from './pages/AttendanceSheetsPage.js';
import AttendanceMemosPage from './pages/AttendanceMemosPage.js';
import AttendanceReportsPage from './pages/AttendanceReportsPage.js';
import HelpPage from './pages/HelpPage.js';
import SettingsPage from './pages/SettingsPage.js';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/students', label: 'Students' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/teachers', label: 'Teachers' },
  { to: '/exams', label: 'Exams' },
  { to: '/duty-chart', label: 'Duty Chart' },
  { to: '/duty-windows', label: 'Duty Windows' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/help', label: 'Help' },
  { to: '/settings', label: 'Settings' },
];

/**
 * What each signed-in role can open. (The server and the local repositories enforce the same rules on writes; this
 * keeps the menu and URLs honest so people only see what they can use.) Local-only mode has no roles: everything.
 */
const ROLE_PATHS: Record<string, string[]> = {
  org_admin: ['*', '/users'],
  exam_cell: ['*'],
  attendance_marker: ['/attendance', '/help', '/settings'],
  viewer: ['/', '/exams', '/duty-chart', '/attendance', '/help', '/settings'],
};

function pathAllowed(role: string | null, path: string): boolean {
  if (!role) return path !== '/users';
  const allowed = ROLE_PATHS[role] ?? [];
  if (allowed.includes('*') && path !== '/users') return true;
  return allowed.some((a) => a !== '*' && (path === a || path.startsWith(a + '/')));
}

function SyncFooter() {
  const { user, cloud, signOut } = useAuth();
  const sync = useSync();
  if (!cloud || !user) return null;
  const status = sync.syncing ? 'Syncing…' : sync.lastError ? 'Sync problem — will retry' : sync.pending ? `${sync.pending} change(s) waiting` : sync.lastSyncAt ? 'All changes saved' : 'Not synced yet';
  return (
    <div className="border-t border-slate-200 px-3 py-3 text-xs space-y-1">
      <div className="font-medium text-slate-800 truncate">{user.name}</div>
      <div className="text-slate-500 truncate">
        {user.orgName} · {user.role.replace('_', ' ')}
      </div>
      <div className={sync.lastError ? 'text-red-600' : 'text-slate-500'}>{status}</div>
      <div className="flex gap-3 pt-1">
        <button className="text-brand-700 hover:underline disabled:opacity-50" disabled={sync.syncing} onClick={() => void sync.syncNow()}>
          Sync now
        </button>
        <button className="text-slate-500 hover:underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { error } = useAppData();
  const { role, cloud } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]); // close the phone menu after choosing a page
  const visibleNav = navItems.filter((item) => pathAllowed(cloud ? role : null, item.to));
  const items: NavItem[] = cloud && role === 'org_admin' ? [...visibleNav.slice(0, -2), { to: '/users', label: 'Users' }, ...visibleNav.slice(-2)] : visibleNav;
  if (cloud && !pathAllowed(role, location.pathname || '/')) {
    return <Navigate to={items[0]?.to ?? '/settings'} replace />;
  }

  return (
    <div className="min-h-screen md:flex">
      {/* phone: slim top bar with the menu button (the sidebar becomes a slide-in drawer) */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-slate-200 px-3 py-2 no-print">
        <button aria-label="Open menu" className="p-2 -ml-1 rounded-md text-slate-700 hover:bg-slate-100" onClick={() => setMenuOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="font-semibold text-slate-900 text-sm truncate">Exam Room Allocator</div>
      </div>
      {menuOpen && <div className="md:hidden fixed inset-0 z-40 bg-slate-900/40 no-print" onClick={() => setMenuOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] transform transition-transform duration-200 md:static md:z-auto md:w-56 md:max-w-none md:translate-x-0 md:shrink-0 border-r border-slate-200 bg-white flex flex-col no-print ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-4 border-b border-slate-200 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900 text-sm leading-tight">Exam Room Allocator</div>
            <div className="text-xs text-slate-400 mt-0.5">College Administration</div>
          </div>
          <button aria-label="Close menu" className="md:hidden p-1 -mr-1 text-slate-500" onClick={() => setMenuOpen(false)}>
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2.5 md:py-2 text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <SyncFooter />
      </aside>
      <main className="flex-1 min-w-0">
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 sm:px-6 py-2 no-print">{error}</div>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<RoomLayoutPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/new" element={<ExamCreatePage />} />
          <Route path="/exams/:examId" element={<ExamDetailPage />} />
          <Route path="/duty-chart" element={<DutyChartPage />} />
          <Route path="/duty-windows" element={<DutyWindowsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/attendance/reports" element={<AttendanceReportsPage />} />
          <Route path="/attendance/:examId" element={<AttendanceExamPage />} />
          <Route path="/attendance/:examId/sheets" element={<AttendanceSheetsPage />} />
          <Route path="/attendance/:examId/memos" element={<AttendanceMemosPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

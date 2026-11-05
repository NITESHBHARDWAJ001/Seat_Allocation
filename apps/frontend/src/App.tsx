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
import Icon, { type IconName } from './components/Icon.js';
import Logo from './components/Logo.js';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', icon: 'dashboard', label: 'Dashboard', end: true },
  { to: '/students', icon: 'students', label: 'Students' },
  { to: '/rooms', icon: 'rooms', label: 'Rooms' },
  { to: '/teachers', icon: 'teachers', label: 'Teachers' },
  { to: '/exams', icon: 'exams', label: 'Exams' },
  { to: '/duty-chart', icon: 'duty', label: 'Duty Chart' },
  { to: '/duty-windows', icon: 'windows', label: 'Duty Windows' },
  { to: '/attendance', icon: 'attendance', label: 'Attendance' },
  { to: '/help', icon: 'help', label: 'Help' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
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
  const dot = sync.lastError ? 'bg-pen-400' : sync.syncing || sync.pending ? 'bg-marker-300 animate-pulse' : 'bg-emerald-400';
  return (
    <div className="m-3 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-3 text-xs space-y-1">
      <div className="font-semibold text-paper truncate">{user.name}</div>
      <div className="text-brand-200/70 truncate">
        {user.orgName} · {user.role.replace('_', ' ')}
      </div>
      <div className="flex items-center gap-1.5 text-brand-100/80 pt-0.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {status}
      </div>
      <div className="flex gap-3 pt-1.5">
        <button className="inline-flex items-center gap-1 text-marker-300 hover:underline disabled:opacity-50" disabled={sync.syncing} onClick={() => void sync.syncNow()}>
          <Icon name="sync" size={12} /> Sync now
        </button>
        <button className="inline-flex items-center gap-1 text-brand-200/80 hover:text-white" onClick={() => void signOut()}>
          <Icon name="logout" size={12} /> Sign out
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
  const items: NavItem[] = cloud && role === 'org_admin' ? [...visibleNav.slice(0, -2), { to: '/users', icon: 'users', label: 'Users' }, ...visibleNav.slice(-2)] : visibleNav;
  if (cloud && !pathAllowed(role, location.pathname || '/')) {
    return <Navigate to={items[0]?.to ?? '/settings'} replace />;
  }

  const tabs = items.filter((i) => ['/', '/students', '/exams', '/attendance'].includes(i.to)).slice(0, 4);

  return (
    <div className="min-h-screen md:flex">
      {/* phone: slim top bar (the sidebar becomes a slide-in drawer) */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-brand-900 text-paper px-4 py-2.5 no-print">
        <Logo light />
        <button aria-label="Open menu" className="p-2 -mr-2 rounded-lg text-paper hover:bg-white/10" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
      </div>
      {menuOpen && <div className="md:hidden fixed inset-0 z-40 bg-brand-950/60 backdrop-blur-[2px] no-print" onClick={() => setMenuOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 md:sticky md:top-0 md:h-screen md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:shrink-0 bg-brand-900 text-paper flex flex-col no-print ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.06) 1px, transparent 0)', backgroundSize: '18px 18px' }}
      >
        <div className="px-5 pt-6 pb-5 flex items-start justify-between gap-2">
          <Logo light />
          <button aria-label="Close menu" className="md:hidden p-1 -mr-1 text-brand-200 hover:text-white" onClick={() => setMenuOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <div className="mx-5 mb-3 border-t border-dashed border-white/15" />
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <SyncFooter />
        {!cloud && <div className="mx-5 mb-5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-200/50">Saved in this browser</div>}
      </aside>
      <main className="flex-1 min-w-0">
        {error && (
          <div className="bg-pen-50 border-b border-pen-200 text-pen-700 text-sm px-4 sm:px-8 py-2 no-print">{error}</div>
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
      {/* phone: thumb-reach tab bar for the four screens used all day */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-brand-900 text-brand-100/80 border-t border-white/10 grid no-print pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${isActive ? 'text-marker-300' : ''}`}>
            <Icon name={item.icon} size={20} />
            {item.label}
          </NavLink>
        ))}
        <button className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium" onClick={() => setMenuOpen(true)}>
          <Icon name="more" size={20} />
          More
        </button>
      </nav>
    </div>
  );
}

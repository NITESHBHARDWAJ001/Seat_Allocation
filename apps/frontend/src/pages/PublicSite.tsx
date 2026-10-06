import { useEffect, useState } from 'react';
import { getApiBase, getPublicConfig, registerOrganization, switchToLocalOnly } from '../services/auth.js';
import LoginPage from './LoginPage.js';

type View = 'landing' | 'login' | 'register';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

function Landing({ onSignIn, onRegister, canRegister }: { onSignIn: () => void; onRegister: () => void; canRegister: boolean }) {
  const features = [
    ['Seat plans that follow your rules', 'Branch and year mixing, strict roll-number continuity, fewest rooms, room priority - checked by an independent validator.'],
    ['Fair invigilation duty', 'Duties spread evenly over a whole sessional, only for occupied rooms, with a live duty chart.'],
    ['Attendance and answer-book memos', 'Mark absentees and unfair-means cases in one tap, print attendance sheets and the university memo.'],
    ['Fast and works offline', 'Everything runs in your browser first and syncs quietly in the background with your team.'],
  ];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <div className="font-semibold text-slate-900">Exam Room Allocator</div>
        <button className="btn-secondary" onClick={onSignIn}>
          Sign in
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 pb-16">
        <section className="py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">Exam rooms, seating, duties and attendance - sorted.</h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            A complete exam-day tool for colleges. Upload your students, rooms and date sheet, and get seat-by-seat plans, fair invigilation rosters, attendance sheets and the answer-book forwarding memo.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button className="btn-primary px-5 py-2.5" onClick={onSignIn}>
              Sign in
            </button>
            {canRegister && (
              <button className="btn-secondary px-5 py-2.5" onClick={onRegister}>
                Register your organization
              </button>
            )}
            <button className="btn-ghost px-5 py-2.5" onClick={switchToLocalOnly}>
              Try as a guest
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Guest mode needs no account: your data stays in this browser only. You can copy it into an organization later.</p>
        </section>
        <section className="grid sm:grid-cols-2 gap-4">
          {features.map(([title, text]) => (
            <div key={title} className="card p-5">
              <div className="font-medium text-slate-900">{title}</div>
              <div className="text-sm text-slate-600 mt-1">{text}</div>
            </div>
          ))}
        </section>
        <section className="mt-10 card p-5 text-sm text-slate-600">
          <div className="font-medium text-slate-900 mb-1">How organizations work</div>
          Register your college in a minute: you become its administrator and can add your exam cell, invigilators who mark attendance, and read-only viewers. Each organization's data is completely separate from every other.
        </section>
      </main>
    </div>
  );
}

function Register({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', adminName: '', adminLogin: '', password: '', again: '', contactEmail: '', contactPhone: '', address: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.again) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await registerOrganization(getApiBase(), {
        name: form.name,
        code: form.code,
        adminName: form.adminName,
        adminLogin: form.adminLogin,
        password: form.password,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        address: form.address || undefined,
      });
      // the session is now saved; the app gate takes over and opens the new organization
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const valid = form.name.trim() && /^[a-z0-9][a-z0-9-]{1,40}$/.test(form.code) && form.adminName.trim() && form.adminLogin.trim() && form.password.length >= 8 && form.again;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-lg p-6 space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">Register your organization</div>
          <div className="text-sm text-slate-500">It is active straight away and you become its administrator.</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Organization name *</span>
            <input
              className="input mt-1"
              value={form.name}
              placeholder="e.g. S.I.E.T., Nilokheri"
              onChange={(e) => set({ name: e.target.value, ...(codeTouched ? {} : { code: slugify(e.target.value) }) })}
              autoFocus
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Short code * (letters, digits, hyphens)</span>
            <input
              className="input mt-1 font-mono"
              value={form.code}
              onChange={(e) => {
                setCodeTouched(true);
                set({ code: e.target.value.toLowerCase() });
              }}
              autoCapitalize="none"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Your name *</span>
            <input className="input mt-1" value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Login (email or username) *</span>
            <input className="input mt-1" value={form.adminLogin} onChange={(e) => set({ adminLogin: e.target.value })} autoCapitalize="none" autoComplete="username" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Password * (8+ characters)</span>
            <input className="input mt-1" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Password again *</span>
            <input className="input mt-1" type="password" value={form.again} onChange={(e) => set({ again: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Contact email</span>
            <input className="input mt-1" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Contact phone</span>
            <input className="input mt-1" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Address</span>
            <input className="input mt-1" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={busy || !valid}>
          {busy ? 'Creating…' : 'Create organization'}
        </button>
        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" className="hover:underline" onClick={onBack}>
            ← Back
          </button>
          <button type="button" className="hover:underline" onClick={onSignIn}>
            Already registered? Sign in
          </button>
        </div>
      </form>
    </div>
  );
}

/** What a signed-out visitor sees in server mode: landing page, sign-in, or organization registration. */
export default function PublicSite() {
  const [view, setView] = useState<View>('landing');
  const [canRegister, setCanRegister] = useState(true);

  useEffect(() => {
    void getPublicConfig().then((c) => setCanRegister(c.registration));
  }, []);

  if (view === 'login') return <LoginPage onBack={() => setView('landing')} />;
  if (view === 'register' && canRegister) return <Register onBack={() => setView('landing')} onSignIn={() => setView('login')} />;
  return <Landing canRegister={canRegister} onSignIn={() => setView('login')} onRegister={() => setView('register')} />;
}

import { useEffect, useState } from 'react';
import { getApiBase, getPublicConfig, registerOrganization, switchToLocalOnly } from '../services/auth.js';
import LoginPage, { AuthShell } from './LoginPage.js';
import SeatArt from '../components/SeatArt.js';
import Logo from '../components/Logo.js';
import Icon from '../components/Icon.js';

type View = 'landing' | 'login' | 'register';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

function Landing({ onSignIn, onRegister, canRegister }: { onSignIn: () => void; onRegister: () => void; canRegister: boolean }) {
  const features: Array<[string, string, string, string]> = [
    ['01', 'Seat plans that follow your rules', 'Branch and year mixing, strict roll-number continuity, fewest rooms, room priority - checked by an independent validator.', 'bg-marker-200'],
    ['02', 'Fair invigilation duty', 'Duties spread evenly over a whole sessional, only for occupied rooms, with a live duty chart.', 'bg-pen-100'],
    ['03', 'Attendance and answer-book memos', 'Mark absentees and unfair-means cases in one tap, print attendance sheets and the university memo.', 'bg-brand-100'],
    ['04', 'Fast, and works offline', 'Everything runs in your browser first and syncs quietly in the background with your team.', 'bg-emerald-100'],
  ];
  return (
    <div className="min-h-screen">
      <header className="px-5 sm:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Logo />
        <button className="btn-secondary" onClick={onSignIn}>
          Sign in
        </button>
      </header>
      <main className="max-w-6xl mx-auto px-5 sm:px-8 pb-16">
        <section className="py-10 sm:py-16 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
          <div>
            <div className="eyebrow mb-4">For colleges &amp; exam cells</div>
            <h1 className="text-[40px] sm:text-6xl font-semibold text-brand-900 leading-[1.02] tracking-tight">
              Every student in the <span className="bg-[linear-gradient(transparent_60%,theme(colors.marker.300)_60%,theme(colors.marker.300)_92%,transparent_92%)]">right seat</span>. Every room watched.
            </h1>
            <p className="mt-5 text-slate-600 max-w-xl text-lg">Upload your students, rooms and date sheet. Get seat-by-seat plans, fair invigilation rosters, attendance sheets and the answer-book memo - ready to print.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn-primary px-6 py-3 text-base" onClick={onSignIn}>
                Sign in <Icon name="arrow" size={16} />
              </button>
              {canRegister && (
                <button className="btn-secondary px-6 py-3 text-base" onClick={onRegister}>
                  Register your organization
                </button>
              )}
              <button className="btn-ghost px-4 py-3 text-base" onClick={switchToLocalOnly}>
                Try as a guest
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500 max-w-md">Guest mode needs no account: your data stays in this browser only. You can copy it into an organization later.</p>
          </div>
          <div className="relative">
            <div className="rounded-3xl bg-brand-900 p-5 sm:p-7 shadow-[8px_8px_0_0_theme(colors.pen.500)] -rotate-1">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-brand-200/70 mb-4">
                <span>Room B-12 · Sitting 1</span>
                <span className="text-marker-300">0 clashes</span>
              </div>
              <SeatArt rows={6} cols={9} />
              <div className="mt-4 flex gap-4 font-mono text-[10px] uppercase tracking-widest text-brand-200/70">
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-paper" /> CSE</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-pen-500" /> ECE</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-marker-300" /> MECH</span>
              </div>
            </div>
          </div>
        </section>
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(([n, title, text, tint]) => (
            <div key={title} className="card p-5 flex flex-col">
              <span className={`w-9 h-9 rounded-lg grid place-items-center font-mono text-xs font-semibold text-brand-900 ${tint}`}>{n}</span>
              <div className="font-display text-lg font-semibold text-brand-900 mt-4 leading-snug">{title}</div>
              <div className="text-sm text-slate-600 mt-2">{text}</div>
            </div>
          ))}
        </section>
        <section className="mt-8 rounded-2xl bg-brand-900 text-paper p-6 sm:p-8 grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-8 items-center">
          <div className="font-display text-2xl font-semibold">How organizations work</div>
          <p className="text-sm text-brand-100/80">Register your college in a minute: you become its administrator and can add your exam cell, invigilators who mark attendance, and read-only viewers. Each organization&apos;s data is completely separate from every other.</p>
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
    <AuthShell wide>
      <form onSubmit={submit} className="w-full space-y-5">
        <div>
          <div className="eyebrow mb-2">New organization</div>
          <h1 className="text-3xl font-semibold text-brand-900 leading-tight">Register your college</h1>
          <div className="text-sm text-slate-500 mt-1">It is active straight away and you become its administrator.</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm sm:col-span-2">
            <span className="label">Organization name *</span>
            <input
              className="input"
              value={form.name}
              placeholder="e.g. S.I.E.T., Nilokheri"
              onChange={(e) => set({ name: e.target.value, ...(codeTouched ? {} : { code: slugify(e.target.value) }) })}
              autoFocus
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="label">Short code * (letters, digits, hyphens)</span>
            <input
              className="input font-mono"
              value={form.code}
              onChange={(e) => {
                setCodeTouched(true);
                set({ code: e.target.value.toLowerCase() });
              }}
              autoCapitalize="none"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Your name *</span>
            <input className="input" value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="label">Login (email or username) *</span>
            <input className="input" value={form.adminLogin} onChange={(e) => set({ adminLogin: e.target.value })} autoCapitalize="none" autoComplete="username" />
          </label>
          <label className="block text-sm">
            <span className="label">Password * (8+ characters)</span>
            <input className="input" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="block text-sm">
            <span className="label">Password again *</span>
            <input className="input" type="password" value={form.again} onChange={(e) => set({ again: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="block text-sm">
            <span className="label">Contact email</span>
            <input className="input" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="label">Contact phone</span>
            <input className="input" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="label">Address</span>
            <input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
        {error && <div className="text-sm text-pen-700 bg-pen-50 border border-pen-200 rounded-lg px-3 py-2">{error}</div>}
        <button className="btn-primary w-full py-2.5" disabled={busy || !valid}>
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
    </AuthShell>
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

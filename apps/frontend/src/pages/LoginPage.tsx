import { useState } from 'react';
import { getApiBase, login } from '../services/auth.js';
import SeatArt from '../components/SeatArt.js';
import Logo from '../components/Logo.js';

/** Sign-in to an organization on the server. "Local only" keeps the original no-login, this-browser-only mode. */
export default function LoginPage({ notice, onBack }: { notice?: string; onBack?: () => void }) {
  const server = getApiBase();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(server, loginName, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div>
          <div className="eyebrow mb-2">Welcome back</div>
          <h1 className="text-3xl font-semibold text-brand-900 leading-tight">Sign in to your organization</h1>
        </div>
        {notice && <div className="rounded-xl bg-marker-100 border border-marker-300 text-brand-900 text-sm p-3">{notice}</div>}
        {!server && (
          <div className="rounded-xl bg-pen-50 border border-pen-200 text-pen-700 text-sm p-3">
            This build has no server address. Set <span className="font-mono">VITE_API_BASE_URL</span> for the frontend and rebuild.
          </div>
        )}
        <label className="block">
          <span className="label">Email or username</span>
          <input className="input" value={loginName} onChange={(e) => setLoginName(e.target.value)} autoCapitalize="none" autoComplete="username" autoFocus />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="text-sm text-pen-700 bg-pen-50 border border-pen-200 rounded-lg px-3 py-2">{error}</div>}
        <button className="btn-primary w-full py-2.5" disabled={busy || !server.trim() || !loginName.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {onBack && (
          <button type="button" className="text-xs text-slate-500 hover:text-brand-900 w-full" onClick={onBack}>
            ← Back
          </button>
        )}
      </form>
    </AuthShell>
  );
}

/** Split screen used by sign-in and registration: an ink panel with the seating chart on the left, the form on the right. */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex flex-col justify-between bg-brand-900 text-paper p-12 relative overflow-hidden" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.07) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
        <Logo light />
        <div>
          <SeatArt rows={6} cols={9} className="max-w-md mb-10" />
          <h2 className="font-display text-4xl font-semibold leading-[1.1]">
            No two neighbours
            <br />
            from the <span className="text-marker-300 italic">same branch</span>.
          </h2>
          <p className="mt-4 text-brand-100/70 max-w-sm text-sm">Seat plans, invigilation duty and attendance for every sitting - rule-checked, printable, and fair.</p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-200/50">Deterministic · Validated · No AI guesswork</div>
      </aside>
      <div className="flex flex-col items-center justify-center p-5 sm:p-10 min-h-screen">
        <div className="lg:hidden mb-8 self-start">
          <Logo />
        </div>
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-sm'} flex justify-center`}>{children}</div>
      </div>
    </div>
  );
}

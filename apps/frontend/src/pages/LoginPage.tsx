import { useState } from 'react';
import { getApiBase, login } from '../services/auth.js';

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">Exam Room Allocator</div>
          <div className="text-sm text-slate-500">Sign in to your organization</div>
        </div>
        {notice && <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm p-2">{notice}</div>}
        {!server && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-2">
            This build has no server address. Set <span className="font-mono">VITE_API_BASE_URL</span> for the frontend and rebuild.
          </div>
        )}
        <label className="block text-sm">
          <span className="text-slate-600">Email or username</span>
          <input className="input mt-1" value={loginName} onChange={(e) => setLoginName(e.target.value)} autoCapitalize="none" autoComplete="username" autoFocus />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={busy || !server.trim() || !loginName.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {onBack && (
          <button type="button" className="text-xs text-slate-500 hover:underline w-full" onClick={onBack}>
            ← Back
          </button>
        )}
      </form>
    </div>
  );
}

import { useState } from 'react';
import { changePassword } from '../services/auth.js';
import { useAuth } from '../services/AuthContext.js';

/** Shown full-screen while a temporary password is in use, and reusable as a card from Settings. */
export function ChangePasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setAgain('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-slate-600">{forced ? 'Temporary password' : 'Current password'}</span>
        <input className="input mt-1" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">New password (at least 8 characters)</span>
        <input className="input mt-1" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">New password again</span>
        <input className="input mt-1" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </label>
      {error && <div className="text-sm text-red-700">{error}</div>}
      {done && !forced && <div className="text-sm text-emerald-700">Password changed.</div>}
      <button className="btn-primary" disabled={busy || !current || next.length < 8 || !again}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

export default function ChangePasswordPage() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">Choose a new password</div>
          <div className="text-sm text-slate-500">
            {user?.name}, you are using a temporary password. Set your own to continue.
          </div>
        </div>
        <ChangePasswordForm forced />
        <button className="text-xs text-slate-500 hover:underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

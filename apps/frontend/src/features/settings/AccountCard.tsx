import { useState } from 'react';
import { useAuth } from '../../services/AuthContext.js';
import { ChangePasswordForm } from '../../pages/ChangePasswordPage.js';
import { ROLE_LABELS } from '../../pages/UsersPage.js';

/** Who is signed in, their role, password change and sign out. */
export default function AccountCard() {
  const { user, signOut } = useAuth();
  const [changing, setChanging] = useState(false);
  if (!user) return null;
  return (
    <div className="card p-4 space-y-3">
      <div className="font-semibold text-slate-900">Account</div>
      <div className="text-sm text-slate-700 space-y-0.5">
        <div>
          {user.name} <span className="text-slate-400">({user.login})</span>
        </div>
        <div>
          {user.orgName} · {ROLE_LABELS[user.role] ?? user.role}
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setChanging((v) => !v)}>
          {changing ? 'Cancel' : 'Change password'}
        </button>
        <button className="btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {changing && (
        <div className="max-w-sm pt-2">
          <ChangePasswordForm onDone={() => setChanging(false)} />
        </div>
      )}
      <div className="text-xs text-slate-400">Signing out keeps this browser's copy of the organization's data. Sign in again to continue where you left off.</div>
    </div>
  );
}

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { setDbNamespace } from '../vendor/indexeddb-repositories/index.js';
import type { OrgRole } from '../vendor/allocation-engine/index.js';
import { getMode, getSession, logout as apiLogout, onSessionChange, setMode, switchToLocalOnly, type AppMode, type Session, type SessionUser } from './auth.js';
import { configureTracking } from './syncTracking.js';

interface AuthState {
  mode: AppMode;
  session: Session | null;
  user: SessionUser | null;
  /** true when the app is signed in to an organization (sync + roles apply) */
  cloud: boolean;
  role: SessionUser['role'] | null;
  signOut: () => Promise<void>;
  useServer: () => void;
  useLocalOnly: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Which local database belongs to this session: one per organization, one for the platform admin, the original one in local mode. */
function namespaceFor(mode: AppMode, session: Session | null): string | null {
  if (mode !== 'cloud' || !session) return null;
  return session.user.role === 'super_admin' ? 'platform' : session.user.orgId;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(getMode());
  const [session, setSession] = useState<Session | null>(getSession());

  useEffect(
    () =>
      onSessionChange(() => {
        setModeState(getMode());
        setSession(getSession());
      }),
    []
  );

  // Must be in place before any repository is used by the children, hence during render (idempotent).
  const namespace = namespaceFor(mode, session);
  setDbNamespace(namespace);
  const cloud = mode === 'cloud' && !!session && session.user.role !== 'super_admin';
  configureTracking({ enabled: cloud, role: cloud ? (session!.user.role as OrgRole) : null });

  const value = useMemo<AuthState>(
    () => ({
      mode,
      session,
      user: session?.user ?? null,
      cloud,
      role: session?.user.role ?? null,
      signOut: apiLogout,
      useServer: () => {
        setMode('cloud');
        setModeState('cloud');
      },
      useLocalOnly: switchToLocalOnly,
    }),
    [mode, session, cloud]
  );

  return <AuthContext.Provider value={{ ...value }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { namespaceFor };

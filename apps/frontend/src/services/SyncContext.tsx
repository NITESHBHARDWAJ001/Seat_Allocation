import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { retryDelayMs } from '../vendor/allocation-engine/index.js';
import { useAppData } from './AppDataContext.js';
import { useAuth } from './AuthContext.js';
import { SessionExpiredError } from './auth.js';
import { countPending, getSyncMeta, runSync, type SyncResult } from './syncEngine.js';

const K_INTERVAL = 'ea.syncIntervalMin';
export const DEFAULT_INTERVAL_MIN = 15;

function readInterval(): number {
  try {
    const v = localStorage.getItem(K_INTERVAL);
    if (v !== null && Number.isFinite(Number(v))) return Math.max(0, Number(v));
  } catch {
    /* default */
  }
  return DEFAULT_INTERVAL_MIN;
}

interface SyncState {
  enabled: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  lastResult: SyncResult | null;
  /** minutes between automatic syncs; 0 = only when you press Sync now */
  intervalMin: number;
  setIntervalMin: (m: number) => void;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

/**
 * Runs the background sync for the signed-in organization: shortly after opening, then every `intervalMin` minutes,
 * and again when the tab comes back into view or the connection returns. Failures back off (1, 2, 5, 10 minutes)
 * instead of hammering the server, and never interrupt the screen the user is working on.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { cloud, role } = useAuth();
  const { refreshAll } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [intervalMin, setIntervalState] = useState(readInterval());
  const inFlight = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshLocalStatus = useCallback(async () => {
    try {
      setPending(await countPending());
      setLastSyncAt((await getSyncMeta()).lastSyncAt);
    } catch {
      /* status is informational */
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!cloud || inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    try {
      const result = await runSync({ canPush: role !== 'viewer' });
      failures.current = 0;
      setLastError(null);
      setLastResult(result);
      if (result.changedLocal) await refreshAll();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        setLastError(err.message); // the auth gate takes the user to the sign-in screen
      } else {
        failures.current += 1;
        setLastError(err instanceof Error ? err.message : String(err));
        retryTimer.current = setTimeout(() => void syncNow(), retryDelayMs(failures.current));
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
      await refreshLocalStatus();
    }
  }, [cloud, role, refreshAll, refreshLocalStatus]);

  useEffect(() => {
    if (!cloud) return;
    void refreshLocalStatus();
    const first = setTimeout(() => void syncNow(), 1500);
    const status = setInterval(() => void refreshLocalStatus(), 5000);
    const periodic = intervalMin > 0 ? setInterval(() => void syncNow(), intervalMin * 60_000) : null;
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    const onOnline = () => void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(status);
      if (periodic) clearInterval(periodic);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [cloud, intervalMin, syncNow, refreshLocalStatus]);

  const value = useMemo<SyncState>(
    () => ({
      enabled: cloud,
      syncing,
      pending,
      lastSyncAt,
      lastError,
      lastResult,
      intervalMin,
      setIntervalMin: (m: number) => {
        try {
          localStorage.setItem(K_INTERVAL, String(m));
        } catch {
          /* keep in memory */
        }
        setIntervalState(m);
      },
      syncNow,
    }),
    [cloud, syncing, pending, lastSyncAt, lastError, lastResult, intervalMin, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

/**
 * Server session handling. The app has two modes:
 *  - local : no server, no login - exactly the original behaviour (everything in this browser).
 *  - cloud : signed in to an organization on the backend; the browser copy is still what the app works on,
 *            and a background sync keeps it in step with the server.
 * The session lives in localStorage so the app opens straight into the last account, also when offline.
 */

export type Role = 'super_admin' | 'org_admin' | 'exam_cell' | 'attendance_marker' | 'viewer';

export interface SessionUser {
  id: string;
  login: string;
  name: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  mustChangePassword: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const K_MODE = 'ea.mode';
const K_SESSION = 'ea.session';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the app still works for this page load */
  }
};

/** "https://host/" or "https://host/api" -> "https://host" */
export function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

const envBase = (): string => normalizeBase((import.meta as any).env?.VITE_API_BASE_URL ?? '');

/** Used only by "npm run dev" when VITE_API_BASE_URL is not set, so local development works out of the box. */
const DEV_DEFAULT_BASE = 'http://localhost:4000';

/**
 * The backend address. It comes from the environment (VITE_API_BASE_URL) and nowhere else - users are never asked for
 * it. In a production build with no value configured this is empty and the sign-in screen says so.
 */
export function getApiBase(): string {
  return envBase() || ((import.meta as any).env?.DEV ? DEV_DEFAULT_BASE : '');
}

export type AppMode = 'local' | 'cloud';
export function getMode(): AppMode {
  const stored = read(K_MODE);
  if (stored === 'local' || stored === 'cloud') return stored;
  return envBase() ? 'cloud' : 'local';
}
export const setMode = (mode: AppMode): void => write(K_MODE, mode);

export function getSession(): Session | null {
  const raw = read(K_SESSION);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
export const saveSession = (s: Session): void => write(K_SESSION, JSON.stringify(s));
export const clearSession = (): void => write(K_SESSION, null);

type Listener = () => void;
const listeners = new Set<Listener>();
export const onSessionChange = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

/** Thrown when the refresh token is no longer valid: the user has to sign in again (local data is kept). */
export class SessionExpiredError extends ApiError {
  constructor() {
    super('Your session has expired. Sign in again.', 401, 'session_expired');
  }
}

async function rawFetch(base: string, path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  return fetch(`${base}/api${path}`, { ...init, headers });
}

async function parse<T>(res: Response): Promise<T> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(body?.error ?? `Server error (${res.status})`, res.status, body?.code);
  return body as T;
}

let refreshing: Promise<Session> | null = null;

async function refreshSession(): Promise<Session> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const current = getSession();
    const base = getApiBase();
    if (!current || !base) throw new SessionExpiredError();
    const res = await rawFetch(base, '/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) });
    if (res.status === 401 || res.status === 403) {
      clearSession();
      notify();
      throw new SessionExpiredError();
    }
    const body = await parse<{ accessToken: string; refreshToken: string; user: SessionUser }>(res);
    const next: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user };
    saveSession(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Authenticated call to the backend. Refreshes the access token once on expiry and retries. */
export async function apiFetch<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = getApiBase();
  let session = getSession();
  if (!base || !session) throw new ApiError('Not signed in.', 401, 'not_signed_in');
  const send = (token: string) => rawFetch(base, path, { method: init.method ?? 'GET', body: init.body === undefined ? undefined : JSON.stringify(init.body), token });
  let res = await send(session.accessToken);
  if (res.status === 401) {
    session = await refreshSession();
    res = await send(session.accessToken);
  }
  return parse<T>(res);
}

export async function login(base: string, loginName: string, password: string): Promise<Session> {
  const cleanBase = normalizeBase(base);
  if (!cleanBase) throw new ApiError('The server address is not configured (VITE_API_BASE_URL).', 400);
  let res: Response;
  try {
    res = await rawFetch(cleanBase, '/auth/login', { method: 'POST', body: JSON.stringify({ login: loginName, password }) });
  } catch {
    throw new ApiError('Cannot reach the server. Check the address and your connection.', 0, 'network');
  }
  const body = await parse<{ accessToken: string; refreshToken: string; user: SessionUser }>(res);
  const session: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user };
  setMode('cloud');
  saveSession(session);
  notify();
  return session;
}

export interface RegisterInput {
  name: string;
  code: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  adminName: string;
  adminLogin: string;
  password: string;
}

/** Public: is self-registration open on this server? Defaults to true if the server cannot be reached. */
export async function getPublicConfig(base: string = getApiBase()): Promise<{ registration: boolean }> {
  try {
    const res = await rawFetch(normalizeBase(base), '/public/config');
    return res.ok ? await res.json() : { registration: true };
  } catch {
    return { registration: true };
  }
}

/** Public: registers an organization (active at once) and signs its first admin in. */
export async function registerOrganization(base: string, input: RegisterInput): Promise<Session> {
  const cleanBase = normalizeBase(base);
  if (!cleanBase) throw new ApiError('The server address is not configured.', 400);
  let res: Response;
  try {
    res = await rawFetch(cleanBase, '/public/register', { method: 'POST', body: JSON.stringify(input) });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'network');
  }
  await parse(res);
  return login(cleanBase, input.adminLogin, input.password);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<Session> {
  const body = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  const previous = getSession()!;
  const next: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, user: { ...previous.user, mustChangePassword: false } };
  saveSession(next);
  notify();
  return next;
}

export async function logout(): Promise<void> {
  const session = getSession();
  const base = getApiBase();
  if (session && base) await rawFetch(base, '/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) }).catch(() => undefined);
  clearSession();
  notify();
}

export function switchToLocalOnly(): void {
  setMode('local');
  notify();
}

export function canManageUsers(role: Role | undefined): boolean {
  return role === 'org_admin';
}

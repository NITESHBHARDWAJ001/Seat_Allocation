import type { NextFunction, Request, Response } from 'express';
import { query, tbl } from './db.js';
import type { Role } from './schema.js';
import { verifyAccessToken } from './security.js';

export interface AuthUser {
  id: string;
  login: string;
  name: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  mustChangePassword: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Verifies the bearer token, then re-checks the user and organization in the database on every request, so
 * disabling a user or suspending an organization takes effect immediately instead of when the token expires.
 * The organization always comes from here, never from anything the client sends.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Not signed in.' });
    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: 'Session expired. Sign in again.', code: 'token_expired' });
    }
    const { rows } = await query(
      `select u.id, u.login, u.name, u.role, u.org_id, u.active, u.must_change_password, o.name as org_name, o.status as org_status
         from ${tbl('users')} u left join ${tbl('organizations')} o on o.id = u.org_id
        where u.id = $1`,
      [claims.sub]
    );
    const u = rows[0];
    if (!u || !u.active) return res.status(401).json({ error: 'This account is disabled.', code: 'disabled' });
    if (u.org_id && u.org_status !== 'active') return res.status(403).json({ error: 'This organization is suspended.', code: 'org_suspended' });
    req.user = { id: u.id, login: u.login, name: u.name, role: u.role, orgId: u.org_id, orgName: u.org_name, mustChangePassword: u.must_change_password };
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    next();
  };

/** Blocks everything except changing the password while a temporary password is still in use. */
export function blockUntilPasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) return res.status(403).json({ error: 'Change your temporary password first.', code: 'must_change_password' });
  next();
}

export async function audit(actor: AuthUser | null, action: string, opts: { orgId?: string | null; target?: string; details?: unknown } = {}): Promise<void> {
  await query(`insert into ${tbl('audit_log')} (actor_id, actor_login, org_id, action, target, details) values ($1,$2,$3,$4,$5,$6)`, [
    actor?.id ?? null,
    actor?.login ?? null,
    opts.orgId ?? actor?.orgId ?? null,
    action,
    opts.target ?? null,
    opts.details ? JSON.stringify(opts.details) : null,
  ]);
}

/** Only ever a user of the caller's own organization (or a 404-style miss) - never another tenant's. */
export async function findOrgUser(orgId: string, userId: string) {
  const { rows } = await query(`select id, login, name, role, active, org_id from ${tbl('users')} where id = $1 and org_id = $2`, [userId, orgId]);
  return rows[0] as { id: string; login: string; name: string; role: Role; active: boolean; org_id: string } | undefined;
}

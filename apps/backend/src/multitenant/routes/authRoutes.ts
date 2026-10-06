import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { audit, requireAuth } from '../auth.js';
import { query, tbl, withTransaction } from '../db.js';
import { hashPassword, hashRefreshToken, newRefreshToken, signAccessToken, validateNewPassword, verifyPassword } from '../security.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: Number(process.env.LOGIN_RATE_LIMIT ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

const normLogin = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

async function issueTokens(user: { id: string; org_id: string | null; role: any }) {
  const refresh = newRefreshToken();
  await query(`insert into ${tbl('refresh_tokens')} (user_id, token_hash, expires_at) values ($1,$2,$3)`, [user.id, refresh.hash, refresh.expiresAt]);
  return {
    accessToken: signAccessToken({ sub: user.id, org: user.org_id, role: user.role }),
    refreshToken: refresh.token,
  };
}

const publicUser = (u: any) => ({
  id: u.id,
  login: u.login,
  name: u.name,
  role: u.role,
  orgId: u.org_id,
  orgName: u.org_name ?? null,
  mustChangePassword: u.must_change_password,
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const login = normLogin(req.body?.login);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!login || !password) return res.status(400).json({ error: 'Enter your email / username and password.' });
  const { rows } = await query(
    `select u.*, o.name as org_name, o.status as org_status from ${tbl('users')} u left join ${tbl('organizations')} o on o.id = u.org_id where u.login = $1`,
    [login]
  );
  const u = rows[0];
  // Same message for unknown user and wrong password so logins cannot be enumerated.
  if (!u || !u.active || !(await verifyPassword(password, u.password_hash))) return res.status(401).json({ error: 'Wrong login or password.' });
  if (u.org_id && u.org_status !== 'active') return res.status(403).json({ error: 'This organization is suspended. Contact the platform administrator.' });
  await query(`update ${tbl('users')} set last_login_at = now() where id = $1`, [u.id]);
  res.json({ ...(await issueTokens(u)), user: publicUser(u) });
});

authRouter.post('/refresh', async (req, res) => {
  const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (!token) return res.status(400).json({ error: 'refreshToken required' });
  const hash = hashRefreshToken(token);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select rt.id as rt_id, rt.expires_at, rt.revoked, u.*, o.name as org_name, o.status as org_status
         from ${tbl('refresh_tokens')} rt join ${tbl('users')} u on u.id = rt.user_id left join ${tbl('organizations')} o on o.id = u.org_id
        where rt.token_hash = $1 for update of rt`,
      [hash]
    );
    const r = rows[0];
    if (!r || r.revoked || new Date(r.expires_at) < new Date() || !r.active) return null;
    if (r.org_id && r.org_status !== 'active') return null;
    await client.query(`update ${tbl('refresh_tokens')} set revoked = true where id = $1`, [r.rt_id]); // rotate: one use only
    return r;
  });
  if (!result) return res.status(401).json({ error: 'Session expired. Sign in again.', code: 'refresh_invalid' });
  res.json({ ...(await issueTokens(result)), user: publicUser(result) });
});

authRouter.post('/logout', async (req, res) => {
  const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (token) await query(`update ${tbl('refresh_tokens')} set revoked = true where token_hash = $1`, [hashRefreshToken(token)]);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const problem = validateNewPassword(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  const { rows } = await query(`select password_hash from ${tbl('users')} where id = $1`, [req.user!.id]);
  if (!rows[0] || !(await verifyPassword(String(currentPassword ?? ''), rows[0].password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a different password.' });
  await query(`update ${tbl('users')} set password_hash = $1, must_change_password = false where id = $2`, [await hashPassword(newPassword), req.user!.id]);
  await query(`update ${tbl('refresh_tokens')} set revoked = true where user_id = $1`, [req.user!.id]); // sign out other devices
  await audit(req.user!, 'password_changed');
  res.json({ ...(await issueTokens({ id: req.user!.id, org_id: req.user!.orgId, role: req.user!.role })), ok: true });
});

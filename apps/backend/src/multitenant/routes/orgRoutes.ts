import { Router } from 'express';
import { audit, blockUntilPasswordChanged, findOrgUser, requireAuth, requireRole } from '../auth.js';
import { query, tbl } from '../db.js';
import { generateTempPassword, hashPassword, validateNewPassword } from '../security.js';
import { ORG_ROLES } from '../schema.js';

/** Everything an organization admin can do, always confined to their own organization (org id comes from the token). */
export const orgRouter = Router();
orgRouter.use(requireAuth, requireRole('org_admin', 'exam_cell', 'attendance_marker', 'viewer'), blockUntilPasswordChanged);

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const normLogin = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const isRole = (v: unknown): v is (typeof ORG_ROLES)[number] => typeof v === 'string' && (ORG_ROLES as string[]).includes(v);

const userOut = (u: any) => ({ id: u.id, login: u.login, name: u.name, role: u.role, active: u.active, lastLoginAt: u.last_login_at ?? null, createdAt: u.created_at });

orgRouter.get('/', async (req, res) => {
  const { rows } = await query(`select id, name, code, contact_name, contact_email, contact_phone, address, status from ${tbl('organizations')} where id = $1`, [req.user!.orgId]);
  const o = rows[0];
  res.json({ id: o.id, name: o.name, code: o.code, contactName: o.contact_name, contactEmail: o.contact_email, contactPhone: o.contact_phone, address: o.address, status: o.status });
});

orgRouter.patch('/', requireRole('org_admin'), async (req, res) => {
  const b = req.body ?? {};
  const name = b.name !== undefined ? str(b.name) : undefined;
  if (name === null) return res.status(400).json({ error: 'Name cannot be empty.' });
  await query(
    `update ${tbl('organizations')} set name = coalesce($1, name), contact_name = coalesce($2, contact_name), contact_email = coalesce($3, contact_email),
            contact_phone = coalesce($4, contact_phone), address = coalesce($5, address) where id = $6`,
    [name ?? null, str(b.contactName), str(b.contactEmail), str(b.contactPhone), str(b.address, 400), req.user!.orgId]
  );
  await audit(req.user!, 'org_details_updated');
  res.json({ ok: true });
});

// -------------------------------------------------------------------------------------------- users (org admin)
orgRouter.get('/users', requireRole('org_admin'), async (req, res) => {
  const { rows } = await query(`select id, login, name, role, active, last_login_at, created_at from ${tbl('users')} where org_id = $1 order by created_at`, [req.user!.orgId]);
  res.json(rows.map(userOut));
});

orgRouter.post('/users', requireRole('org_admin'), async (req, res) => {
  const b = req.body ?? {};
  const login = normLogin(b.login);
  const name = str(b.name);
  if (!login || !name) return res.status(400).json({ error: 'Name and login (email or username) are required.' });
  if (!isRole(b.role)) return res.status(400).json({ error: `Role must be one of: ${ORG_ROLES.join(', ')}.` });
  let temp = typeof b.password === 'string' && b.password ? b.password : null;
  if (temp) {
    const problem = validateNewPassword(temp);
    if (problem) return res.status(400).json({ error: problem });
  } else temp = generateTempPassword();
  try {
    const { rows } = await query(
      `insert into ${tbl('users')} (org_id, login, name, role, password_hash, must_change_password) values ($1,$2,$3,$4,$5,true) returning id, login, name, role, active, last_login_at, created_at`,
      [req.user!.orgId, login, name, b.role, await hashPassword(temp)]
    );
    await audit(req.user!, 'user_created', { target: login, details: { role: b.role } });
    res.status(201).json({ user: userOut(rows[0]), temporaryPassword: temp });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'That login is already used.' });
    throw err;
  }
});

/** Keeps at least one active org admin so an organization can never lock itself out. */
async function otherActiveAdmins(orgId: string, exceptUserId: string): Promise<number> {
  const { rows } = await query(`select count(*)::int as n from ${tbl('users')} where org_id = $1 and role = 'org_admin' and active and id <> $2`, [orgId, exceptUserId]);
  return rows[0].n;
}

orgRouter.patch('/users/:id', requireRole('org_admin'), async (req, res) => {
  const target = await findOrgUser(req.user!.orgId!, String(req.params.id));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const b = req.body ?? {};
  const demotes = target.role === 'org_admin' && ((b.role !== undefined && b.role !== 'org_admin') || b.active === false);
  if (demotes && (await otherActiveAdmins(req.user!.orgId!, target.id)) === 0) return res.status(400).json({ error: 'An organization needs at least one active admin.' });
  if (target.id === req.user!.id && (b.active === false || (b.role !== undefined && b.role !== target.role))) return res.status(400).json({ error: 'You cannot change your own role or disable yourself.' });
  if (b.role !== undefined && !isRole(b.role)) return res.status(400).json({ error: `Role must be one of: ${ORG_ROLES.join(', ')}.` });
  const name = b.name !== undefined ? str(b.name) : undefined;
  if (name === null) return res.status(400).json({ error: 'Name cannot be empty.' });
  const { rows } = await query(
    `update ${tbl('users')} set name = coalesce($1, name), role = coalesce($2, role), active = coalesce($3, active) where id = $4 and org_id = $5
      returning id, login, name, role, active, last_login_at, created_at`,
    [name ?? null, b.role ?? null, typeof b.active === 'boolean' ? b.active : null, target.id, req.user!.orgId]
  );
  if (b.active === false) await query(`update ${tbl('refresh_tokens')} set revoked = true where user_id = $1`, [target.id]);
  await audit(req.user!, 'user_updated', { target: target.login, details: { role: b.role, active: b.active } });
  res.json(userOut(rows[0]));
});

orgRouter.post('/users/:id/reset-password', requireRole('org_admin'), async (req, res) => {
  const target = await findOrgUser(req.user!.orgId!, String(req.params.id));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const temp = generateTempPassword();
  await query(`update ${tbl('users')} set password_hash = $1, must_change_password = true where id = $2`, [await hashPassword(temp), target.id]);
  await query(`update ${tbl('refresh_tokens')} set revoked = true where user_id = $1`, [target.id]);
  await audit(req.user!, 'user_password_reset', { target: target.login });
  res.json({ login: target.login, temporaryPassword: temp });
});

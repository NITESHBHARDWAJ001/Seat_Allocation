import { Router } from 'express';
import { audit, blockUntilPasswordChanged, requireAuth, requireRole } from '../auth.js';
import { query, tbl, withTransaction } from '../db.js';
import { generateTempPassword, hashPassword, validateNewPassword } from '../security.js';

/**
 * Platform administrator only. Deliberately exposes ORGANIZATION METADATA - who is registered, contact details,
 * user names / roles / status, and usage counts - and never any organization's students, exams, seating or attendance.
 */
export const platformRouter = Router();
platformRouter.use(requireAuth, requireRole('super_admin'), blockUntilPasswordChanged);

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const normLogin = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

const ORG_SUMMARY_SQL = `
  select o.id, o.name, o.code, o.contact_name, o.contact_email, o.contact_phone, o.address, o.status, o.created_at,
         (select count(*) from ${tbl('users')} u where u.org_id = o.id) as user_count,
         (select count(*) from ${tbl('records')} r where r.org_id = o.id and r.entity = 'students' and not r.deleted) as student_count,
         (select count(*) from ${tbl('records')} r where r.org_id = o.id and r.entity = 'exams' and not r.deleted) as exam_count,
         (select max(r.updated_at) from ${tbl('records')} r where r.org_id = o.id) as last_sync_at,
         (select max(u.last_login_at) from ${tbl('users')} u where u.org_id = o.id) as last_login_at
    from ${tbl('organizations')} o`;

const orgOut = (r: any) => ({
  id: r.id,
  name: r.name,
  code: r.code,
  contactName: r.contact_name,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  address: r.address,
  status: r.status,
  createdAt: r.created_at,
  userCount: Number(r.user_count ?? 0),
  studentCount: Number(r.student_count ?? 0),
  examCount: Number(r.exam_count ?? 0),
  lastSyncAt: r.last_sync_at ?? null,
  lastLoginAt: r.last_login_at ?? null,
});

platformRouter.get('/orgs', async (_req, res) => {
  const { rows } = await query(`${ORG_SUMMARY_SQL} order by o.created_at desc`);
  res.json(rows.map(orgOut));
});

platformRouter.post('/orgs', async (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name);
  const code = (str(b.code, 41) ?? '').toLowerCase();
  const adminLogin = normLogin(b.adminLogin);
  const adminName = str(b.adminName);
  if (!name) return res.status(400).json({ error: 'Organization name is required.' });
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Code must be 2-41 characters: lowercase letters, digits and hyphens.' });
  if (!adminLogin || !adminName) return res.status(400).json({ error: 'The first organization admin needs a name and a login (email or username).' });
  let temp = typeof b.adminPassword === 'string' && b.adminPassword ? b.adminPassword : null;
  if (temp) {
    const problem = validateNewPassword(temp);
    if (problem) return res.status(400).json({ error: problem });
  } else temp = generateTempPassword();

  try {
    const created = await withTransaction(async (client) => {
      const org = (
        await client.query(
          `insert into ${tbl('organizations')} (name, code, contact_name, contact_email, contact_phone, address) values ($1,$2,$3,$4,$5,$6) returning id`,
          [name, code, str(b.contactName), str(b.contactEmail), str(b.contactPhone), str(b.address, 400)]
        )
      ).rows[0];
      await client.query(`insert into ${tbl('users')} (org_id, login, name, role, password_hash, must_change_password) values ($1,$2,$3,'org_admin',$4,true)`, [
        org.id,
        adminLogin,
        adminName,
        await hashPassword(temp!),
      ]);
      return org.id as string;
    });
    await audit(req.user!, 'org_created', { orgId: created, target: name });
    const { rows } = await query(`${ORG_SUMMARY_SQL} where o.id = $1`, [created]);
    res.status(201).json({ organization: orgOut(rows[0]), adminLogin, temporaryPassword: temp });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: err.constraint?.includes('login') || String(err.detail).includes('login') ? 'That login is already used.' : 'That organization code is already used.' });
    throw err;
  }
});

platformRouter.get('/orgs/:id', async (req, res) => {
  const { rows } = await query(`${ORG_SUMMARY_SQL} where o.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Organization not found.' });
  const users = await query(`select id, login, name, role, active, last_login_at, created_at from ${tbl('users')} where org_id = $1 order by created_at`, [req.params.id]);
  res.json({
    organization: orgOut(rows[0]),
    users: users.rows.map((u) => ({ id: u.id, login: u.login, name: u.name, role: u.role, active: u.active, lastLoginAt: u.last_login_at, createdAt: u.created_at })),
  });
});

platformRouter.patch('/orgs/:id', async (req, res) => {
  const b = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.name !== undefined) {
    const n = str(b.name);
    if (!n) return res.status(400).json({ error: 'Name cannot be empty.' });
    add('name', n);
  }
  if (b.contactName !== undefined) add('contact_name', str(b.contactName));
  if (b.contactEmail !== undefined) add('contact_email', str(b.contactEmail));
  if (b.contactPhone !== undefined) add('contact_phone', str(b.contactPhone));
  if (b.address !== undefined) add('address', str(b.address, 400));
  if (b.status !== undefined) {
    if (b.status !== 'active' && b.status !== 'suspended') return res.status(400).json({ error: 'status must be active or suspended.' });
    add('status', b.status);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rowCount } = await query(`update ${tbl('organizations')} set ${sets.join(', ')} where id = $${vals.length}`, vals);
  if (!rowCount) return res.status(404).json({ error: 'Organization not found.' });
  await audit(req.user!, b.status ? `org_${b.status}` : 'org_updated', { orgId: req.params.id, details: Object.keys(b) });
  const { rows } = await query(`${ORG_SUMMARY_SQL} where o.id = $1`, [req.params.id]);
  res.json(orgOut(rows[0]));
});

/** Recovery path when an organization has lost access: gives one of ITS org admins a new temporary password. */
platformRouter.post('/orgs/:id/reset-admin-password', async (req, res) => {
  const userId = str(req.body?.userId);
  if (!userId) return res.status(400).json({ error: 'userId required.' });
  const { rows } = await query(`select id, login from ${tbl('users')} where id = $1 and org_id = $2 and role = 'org_admin'`, [userId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'That organization admin was not found.' });
  const temp = generateTempPassword();
  await query(`update ${tbl('users')} set password_hash = $1, must_change_password = true, active = true where id = $2`, [await hashPassword(temp), userId]);
  await query(`update ${tbl('refresh_tokens')} set revoked = true where user_id = $1`, [userId]);
  await audit(req.user!, 'org_admin_password_reset', { orgId: req.params.id, target: rows[0].login });
  res.json({ login: rows[0].login, temporaryPassword: temp });
});

platformRouter.get('/audit', async (req, res) => {
  const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : null;
  const { rows } = await query(
    `select a.id, a.at, a.actor_login, a.org_id, o.name as org_name, a.action, a.target
       from ${tbl('audit_log')} a left join ${tbl('organizations')} o on o.id = a.org_id
      where ($1::uuid is null or a.org_id = $1) order by a.id desc limit 200`,
    [orgId]
  );
  res.json(rows.map((r) => ({ id: r.id, at: r.at, actor: r.actor_login, orgId: r.org_id, orgName: r.org_name, action: r.action, target: r.target })));
});

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { audit } from '../auth.js';
import { tbl, withTransaction } from '../db.js';
import { hashPassword, validateNewPassword } from '../security.js';

/**
 * Open (no login) endpoints for the public page. Anyone can register an organization: it is active immediately and
 * its first administrator is the person who registered, with the password they chose. Set PUBLIC_REGISTRATION=off to
 * close registration and let only the platform admin create organizations.
 */
export const publicRouter = Router();

export const registrationOpen = (): boolean => (process.env.PUBLIC_REGISTRATION ?? 'on').toLowerCase() !== 'off';

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: Number(process.env.REGISTER_RATE_LIMIT ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this connection. Try again later.' },
});

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const normLogin = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

publicRouter.get('/config', (_req, res) => {
  res.json({ registration: registrationOpen() });
});

publicRouter.post('/register', registerLimiter, async (req, res) => {
  if (!registrationOpen()) return res.status(403).json({ error: 'Registration is closed. Ask the platform administrator to create your organization.' });
  const b = req.body ?? {};
  const name = str(b.name);
  const code = (str(b.code, 41) ?? '').toLowerCase();
  const adminName = str(b.adminName);
  const adminLogin = normLogin(b.adminLogin);
  if (!name) return res.status(400).json({ error: 'Organization name is required.' });
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Short code must be 2-41 characters: lowercase letters, digits and hyphens.' });
  if (!adminName || !adminLogin) return res.status(400).json({ error: 'Your name and a login (email or username) are required.' });
  const problem = validateNewPassword(b.password);
  if (problem) return res.status(400).json({ error: problem });

  try {
    const orgId = await withTransaction(async (client) => {
      const org = (
        await client.query(
          `insert into ${tbl('organizations')} (name, code, contact_name, contact_email, contact_phone, address) values ($1,$2,$3,$4,$5,$6) returning id`,
          [name, code, str(b.contactName) ?? adminName, str(b.contactEmail), str(b.contactPhone), str(b.address, 400)]
        )
      ).rows[0];
      // the registrant chose this password themselves, so no forced change
      await client.query(`insert into ${tbl('users')} (org_id, login, name, role, password_hash, must_change_password) values ($1,$2,$3,'org_admin',$4,false)`, [
        org.id,
        adminLogin,
        adminName,
        await hashPassword(b.password),
      ]);
      return org.id as string;
    });
    await audit(null, 'org_registered', { orgId, target: name, details: { code } });
    res.status(201).json({ ok: true, organizationId: orgId });
  } catch (err: any) {
    if (err?.code === '23505') {
      const detail = `${err.constraint ?? ''} ${err.detail ?? ''}`;
      return res.status(409).json({ error: detail.includes('login') ? 'That login is already used. Choose another email or username.' : 'That short code is already taken. Choose another.' });
    }
    throw err;
  }
});

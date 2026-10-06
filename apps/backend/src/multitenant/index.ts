import type { Express } from 'express';
import { authRouter } from './routes/authRoutes.js';
import { platformRouter } from './routes/platformRoutes.js';
import { orgRouter } from './routes/orgRoutes.js';
import { syncRouter } from './routes/syncRoutes.js';
import { publicRouter } from './routes/publicRoutes.js';
import { query, tbl } from './db.js';
import { migrate } from './schema.js';
import { assertSecurityConfig, hashPassword } from './security.js';

/** Mounts the multi-organization API (DATA_BACKEND=postgres) on the Express app. */
export async function mountMultiTenant(app: Express): Promise<void> {
  assertSecurityConfig();
  await migrate();
  await ensureSuperAdmin();
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/sync', syncRouter);
}

/**
 * First-run bootstrap: if no platform admin exists yet, create one from SUPER_ADMIN_LOGIN / SUPER_ADMIN_PASSWORD.
 * The account must change that password at first sign-in. After that the env vars are no longer needed.
 */
async function ensureSuperAdmin(): Promise<void> {
  const { rows } = await query(`select 1 from ${tbl('users')} where role = 'super_admin' limit 1`);
  if (rows.length) return;
  const login = process.env.SUPER_ADMIN_LOGIN?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!login || !password || password.length < 8) {
    console.warn('[platform] No platform admin exists. Set SUPER_ADMIN_LOGIN and SUPER_ADMIN_PASSWORD (8+ chars) and restart to create one.');
    return;
  }
  await query(`insert into ${tbl('users')} (org_id, login, name, role, password_hash, must_change_password) values (null, $1, 'Platform Admin', 'super_admin', $2, true)`, [login, await hashPassword(password)]);
  console.log(`[platform] Created platform admin "${login}" (must change password at first sign-in).`);
}

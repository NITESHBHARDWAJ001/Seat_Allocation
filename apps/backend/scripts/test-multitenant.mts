/**
 * End-to-end test of the multi-organization backend against a real Postgres.
 *   DATABASE_URL=... npx tsx scripts/test-multitenant.mts
 * Uses a throw-away schema (exam_alloc_test) which is dropped at the end - it never touches the real "exam_alloc" data.
 */
import { spawn } from 'node:child_process';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required');
const SCHEMA = 'exam_alloc_test';
const PORT = 4791;
const BASE = `http://localhost:${PORT}/api`;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}`, detail ?? '');
  }
}

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

const server = spawn('npx', ['tsx', 'src/index.ts'], {
  shell: true,
  env: {
    ...process.env,
    DATA_BACKEND: 'postgres',
    DB_SCHEMA: SCHEMA,
    PORT: String(PORT),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    SUPER_ADMIN_LOGIN: 'platform@test',
    SUPER_ADMIN_PASSWORD: 'PlatformPass1',
    LOGIN_RATE_LIMIT: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function cleanup() {
  server.kill();
  spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`drop schema if exists "${SCHEMA}" cascade`);
  await client.end();
}

try {
  // start from a clean slate
  const pre = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pre.connect();
  await pre.query(`drop schema if exists "${SCHEMA}" cascade`);
  await pre.end();

  await waitForHealth();

  // ---------------------------------------------------------------- platform admin bootstrap and login
  let r = await call('POST', '/auth/login', { body: { login: 'platform@test', password: 'wrong' } });
  check('wrong password rejected', r.status === 401);
  r = await call('POST', '/auth/login', { body: { login: 'PLATFORM@test ', password: 'PlatformPass1' } });
  check('platform admin logs in (login is case/space-insensitive)', r.status === 200 && r.json.user.role === 'super_admin', r.json);
  let platformToken: string = r.json.accessToken;
  check('bootstrap password must be changed', r.json.user.mustChangePassword === true);
  r = await call('GET', '/platform/orgs', { token: platformToken });
  check('platform API blocked until password changed', r.status === 403 && r.json.code === 'must_change_password', r.json);
  r = await call('POST', '/auth/change-password', { token: platformToken, body: { currentPassword: 'PlatformPass1', newPassword: 'short' } });
  check('weak new password rejected', r.status === 400);
  r = await call('POST', '/auth/change-password', { token: platformToken, body: { currentPassword: 'PlatformPass1', newPassword: 'PlatformNew99' } });
  check('platform admin changes password', r.status === 200 && r.json.accessToken, r.json);
  platformToken = r.json.accessToken;

  // ---------------------------------------------------------------- create two organizations
  r = await call('POST', '/platform/orgs', { token: platformToken, body: { name: 'SIET Nilokheri', code: 'siet', contactEmail: 'office@siet.test', adminName: 'SIET Admin', adminLogin: 'admin@siet' } });
  check('org A created', r.status === 201 && r.json.temporaryPassword, r.json);
  const orgA = r.json.organization.id as string;
  const tempA = r.json.temporaryPassword as string;
  r = await call('POST', '/platform/orgs', { token: platformToken, body: { name: 'Other College', code: 'other', adminName: 'Other Admin', adminLogin: 'admin@other', adminPassword: 'OtherAdmin123' } });
  check('org B created', r.status === 201, r.json);
  const orgB = r.json.organization.id as string;
  r = await call('POST', '/platform/orgs', { token: platformToken, body: { name: 'Dup', code: 'siet', adminName: 'x', adminLogin: 'x@x' } });
  check('duplicate org code rejected', r.status === 409, r.json);
  r = await call('POST', '/platform/orgs', { token: platformToken, body: { name: 'Dup2', code: 'dup2', adminName: 'x', adminLogin: 'admin@siet' } });
  check('duplicate admin login rejected', r.status === 409, r.json);
  r = await call('POST', '/platform/orgs', { token: platformToken, body: { name: 'Bad', code: 'Bad Code!', adminName: 'x', adminLogin: 'b@b' } });
  check('invalid org code rejected', r.status === 400);

  // ---------------------------------------------------------------- org admin
  r = await call('POST', '/auth/login', { body: { login: 'admin@siet', password: tempA } });
  check('org admin logs in with temporary password', r.status === 200 && r.json.user.mustChangePassword, r.json);
  let adminA: string = r.json.accessToken;
  r = await call('GET', '/org/users', { token: adminA });
  check('org API blocked until password changed', r.status === 403);
  r = await call('POST', '/auth/change-password', { token: adminA, body: { currentPassword: tempA, newPassword: 'SietAdmin2026' } });
  adminA = r.json.accessToken;
  check('org admin changed password', r.status === 200);

  const mk = async (token: string, login: string, role: string) => {
    const x = await call('POST', '/org/users', { token, body: { login, name: login, role, password: 'TempPass123' } });
    return x;
  };
  r = await mk(adminA, 'cell@siet', 'exam_cell');
  check('org admin creates exam_cell user', r.status === 201, r.json);
  r = await mk(adminA, 'marker@siet', 'attendance_marker');
  check('org admin creates attendance_marker', r.status === 201);
  const markerId = r.json.user.id as string;
  r = await mk(adminA, 'viewer@siet', 'viewer');
  check('org admin creates viewer', r.status === 201);
  r = await mk(adminA, 'x@siet', 'super_admin');
  check('cannot create a super_admin from an org', r.status === 400);
  r = await mk(adminA, 'cell@siet', 'viewer');
  check('duplicate user login rejected', r.status === 409);

  const login = async (l: string, p = 'TempPass123') => {
    const x = await call('POST', '/auth/login', { body: { login: l, password: p } });
    const c = await call('POST', '/auth/change-password', { token: x.json.accessToken, body: { currentPassword: p, newPassword: 'NewPass12345' } });
    return c.json.accessToken as string;
  };
  const cell = await login('cell@siet');
  const marker = await login('marker@siet');
  const viewer = await login('viewer@siet');
  r = await call('POST', '/auth/login', { body: { login: 'admin@other', password: 'OtherAdmin123' } });
  const c2 = await call('POST', '/auth/change-password', { token: r.json.accessToken, body: { currentPassword: 'OtherAdmin123', newPassword: 'OtherAdmin456' } });
  const adminB: string = c2.json.accessToken;

  // ---------------------------------------------------------------- permission matrix
  r = await call('GET', '/org/users', { token: cell });
  check('exam_cell cannot list users', r.status === 403);
  r = await call('GET', '/platform/orgs', { token: adminA });
  check('org admin cannot reach platform API', r.status === 403);
  r = await call('GET', '/org/users', { token: platformToken });
  check('platform admin has no org data API', r.status === 403);

  const stu = (i: number) => ({ entity: 'students', id: `s${i}`, data: { id: `s${i}`, rollNumber: `R${i}`, name: `Student ${i}` } });
  r = await call('POST', '/sync/push', { token: cell, body: { changes: [stu(1), stu(2), { entity: 'exams', id: 'e1', data: { id: 'e1', name: 'Exam' } }] } });
  check('exam_cell can push students + exams', r.status === 200 && r.json.applied === 3 && r.json.rejected.length === 0, r.json);
  r = await call('POST', '/sync/push', { token: marker, body: { changes: [stu(3), { entity: 'attendanceMark', id: 'e1:R1', data: { rollNumber: 'R1', mark: 'absent' } }] } });
  check('attendance_marker: attendance accepted, students rejected', r.json.applied === 1 && r.json.rejected.length === 1 && r.json.rejected[0].id === 's3', r.json);
  r = await call('POST', '/sync/push', { token: viewer, body: { changes: [stu(4)] } });
  check('viewer cannot push', r.status === 403);
  r = await call('POST', '/sync/push', { token: adminA, body: { changes: [{ entity: 'bogus', id: 'x', data: {} }, { entity: 'students', id: 'bad', data: [1] }] } });
  check('unknown entity / non-object data rejected', r.json.applied === 0 && r.json.rejected.length === 2, r.json);
  r = await call('POST', '/sync/push', { token: adminA, body: { changes: Array.from({ length: 201 }, (_, i) => stu(i + 100)) } });
  check('more than 200 changes per push refused', r.status === 413);

  // ---------------------------------------------------------------- pull: cursor, pagination, viewer can read
  r = await call('GET', '/sync/pull?since=0&limit=2', { token: viewer });
  check('viewer can pull', r.status === 200 && r.json.records.length === 2 && r.json.hasMore === true, r.json);
  let cursor = r.json.next as string;
  let seen = r.json.records.map((x: any) => `${x.entity}:${x.id}`);
  while (r.json.hasMore) {
    r = await call('GET', `/sync/pull?since=${cursor}&limit=2`, { token: viewer });
    seen = seen.concat(r.json.records.map((x: any) => `${x.entity}:${x.id}`));
    cursor = r.json.next;
  }
  check('paging by cursor returns every record exactly once', seen.length === 4 && new Set(seen).size === 4, seen);
  r = await call('GET', `/sync/pull?since=${cursor}`, { token: viewer });
  check('nothing new after the cursor', r.json.records.length === 0 && r.json.next === cursor && r.json.hasMore === false, r.json);

  // update + delete show up as changes after the cursor
  await call('POST', '/sync/push', { token: cell, body: { changes: [{ entity: 'students', id: 's1', data: { id: 's1', name: 'Renamed' } }, { entity: 'students', id: 's2', data: null }] } });
  r = await call('GET', `/sync/pull?since=${cursor}`, { token: viewer });
  const byId = Object.fromEntries(r.json.records.map((x: any) => [x.id, x]));
  check('update is pulled', byId.s1?.data?.name === 'Renamed', r.json);
  check('delete is pulled as a tombstone', byId.s2?.deleted === true && byId.s2?.data === null, r.json);
  r = await call('GET', '/sync/pull?since=0&entities=attendanceMark', { token: viewer });
  check('entity filter works', r.json.records.length === 1 && r.json.records[0].entity === 'attendanceMark');

  // many records, small pages: order must be numeric (a text sort would put seq 10 before 9 and skip rows)
  const many = Array.from({ length: 130 }, (_, i) => ({ entity: 'students', id: `bulk${i}`, data: { id: `bulk${i}`, n: i } }));
  r = await call('POST', '/sync/push', { token: cell, body: { changes: many } });
  check('130 records pushed in one batch (single statement)', r.status === 200 && r.json.applied === 130, r.json);
  let cur2 = '0';
  const got: string[] = [];
  const seqs: number[] = [];
  for (;;) {
    r = await call('GET', `/sync/pull?since=${cur2}&limit=40&entities=students`, { token: viewer });
    for (const x of r.json.records) {
      got.push(x.id);
      seqs.push(Number(x.seq));
    }
    cur2 = r.json.next;
    if (!r.json.hasMore) break;
  }
  check('paging 130+ records in pages of 40 returns each exactly once', new Set(got.filter((x) => x.startsWith('bulk'))).size === 130, got.length);
  check('records arrive in numeric change order', seqs.every((v, i) => i === 0 || v > seqs[i - 1]!), seqs.slice(0, 12));
  await call('POST', '/sync/push', { token: cell, body: { changes: many.slice(0, 3).map((m) => ({ ...m, data: null })).concat([{ entity: 'students', id: 'dupe', data: { a: 1 } }, { entity: 'students', id: 'dupe', data: { a: 2 } }]) } });
  r = await call('GET', `/sync/pull?since=0&entities=students`, { token: viewer });
  const dupe = r.json.records.filter((x: any) => x.id === 'dupe');
  check('same record twice in one batch keeps the last version', dupe.length === 1 && dupe[0].data.a === 2, dupe);
  check('deleted records in a batch become tombstones', r.json.records.filter((x: any) => ['bulk0', 'bulk1', 'bulk2'].includes(x.id)).every((x: any) => x.deleted === true));

  // a browser does not get its own uploads back, but its cursor still moves forward
  r = await call('POST', '/sync/push', { token: cell, body: { deviceId: 'dev-A', changes: [{ entity: 'rooms', id: 'r-dev', data: { id: 'r-dev' } }] } });
  const beforeCursor = r.json.cursor as string;
  r = await call('GET', `/sync/pull?since=${(Number(beforeCursor) - 1).toString()}&device=dev-A`, { token: cell });
  check('own device does not receive its own upload', r.json.records.length === 0 && r.json.next === beforeCursor, r.json);
  r = await call('GET', `/sync/pull?since=${(Number(beforeCursor) - 1).toString()}&device=dev-B`, { token: cell });
  check('another device does receive it', r.json.records.length === 1 && r.json.records[0].id === 'r-dev', r.json);

  // ---------------------------------------------------------------- tenant isolation
  r = await call('GET', '/sync/pull?since=0', { token: adminB });
  check('org B sees none of org A data', r.status === 200 && r.json.records.length === 0, r.json);
  await call('POST', '/sync/push', { token: adminB, body: { changes: [{ entity: 'students', id: 's1', data: { id: 's1', name: 'B student' } }] } });
  r = await call('GET', '/sync/pull?since=0&entities=students', { token: cell });
  const s1 = r.json.records.find((x: any) => x.id === 's1');
  check('same record id in two orgs stays separate', s1?.data?.name === 'Renamed', s1);
  r = await call('PATCH', `/org/users/${markerId}`, { token: adminB, body: { active: false } });
  check('org admin cannot edit another org user', r.status === 404, r.json);
  r = await call('POST', `/org/users/${markerId}/reset-password`, { token: adminB });
  check('org admin cannot reset another org user password', r.status === 404);

  // ---------------------------------------------------------------- platform sees metadata only
  r = await call('GET', '/platform/orgs', { token: platformToken });
  const a = r.json.find((o: any) => o.id === orgA);
  check('platform list shows counts', a && a.userCount === 4 && a.studentCount >= 1 && a.examCount === 1, a);
  check('platform list exposes no records', !JSON.stringify(r.json).includes('Student 1') && !JSON.stringify(r.json).includes('Renamed'));
  r = await call('GET', `/platform/orgs/${orgA}`, { token: platformToken });
  check('platform org detail lists users (no password hashes)', r.json.users.length === 4 && !JSON.stringify(r.json).includes('scrypt'), r.json);

  // ---------------------------------------------------------------- user management rules
  r = await call('GET', '/org/users', { token: adminA });
  const adminUser = r.json.find((u: any) => u.login === 'admin@siet');
  r = await call('PATCH', `/org/users/${adminUser.id}`, { token: adminA, body: { role: 'viewer' } });
  check('admin cannot demote / disable themselves', r.status === 400, r.json);
  r = await call('PATCH', `/org/users/${markerId}`, { token: adminA, body: { role: 'exam_cell' } });
  check('org admin changes a role', r.status === 200 && r.json.role === 'exam_cell', r.json);
  r = await call('PATCH', `/org/users/${markerId}`, { token: adminA, body: { active: false } });
  check('org admin disables a user', r.status === 200 && r.json.active === false);
  r = await call('GET', '/sync/pull?since=0', { token: marker });
  check('disabled user is cut off immediately (token still valid)', r.status === 401, r.json);
  r = await call('POST', '/auth/login', { body: { login: 'marker@siet', password: 'NewPass12345' } });
  check('disabled user cannot log in', r.status === 401);
  r = await call('POST', `/org/users/${markerId}/reset-password`, { token: adminA });
  check('org admin resets a password (temporary, must change)', r.status === 200 && r.json.temporaryPassword);
  const lastAdmin = adminUser.id;
  r = await call('POST', '/org/users', { token: adminA, body: { login: 'admin2@siet', name: 'Second Admin', role: 'org_admin', password: 'SecondAdmin1' } });
  const admin2Id = r.json.user.id;
  const a2 = await call('POST', '/auth/login', { body: { login: 'admin2@siet', password: 'SecondAdmin1' } });
  const a2t = (await call('POST', '/auth/change-password', { token: a2.json.accessToken, body: { currentPassword: 'SecondAdmin1', newPassword: 'SecondAdmin2' } })).json.accessToken;
  r = await call('PATCH', `/org/users/${lastAdmin}`, { token: a2t, body: { active: false } });
  check('second admin can disable the first', r.status === 200);
  r = await call('PATCH', `/org/users/${admin2Id}`, { token: a2t, body: { active: false } });
  check('cannot disable self / last active admin', r.status === 400, r.json);

  // ---------------------------------------------------------------- refresh tokens
  r = await call('POST', '/auth/login', { body: { login: 'cell@siet', password: 'NewPass12345' } });
  const rt1 = r.json.refreshToken as string;
  r = await call('POST', '/auth/refresh', { body: { refreshToken: rt1 } });
  check('refresh token gives a new session', r.status === 200 && r.json.accessToken && r.json.refreshToken !== rt1, r.json);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: rt1 } });
  check('refresh token is single-use', r.status === 401);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: 'garbage' } });
  check('garbage refresh token rejected', r.status === 401);

  // ---------------------------------------------------------------- suspend organization
  r = await call('PATCH', `/platform/orgs/${orgB}`, { token: platformToken, body: { status: 'suspended' } });
  check('platform admin suspends an org', r.status === 200 && r.json.status === 'suspended');
  r = await call('GET', '/sync/pull?since=0', { token: adminB });
  check('suspended org is cut off immediately', r.status === 403 && r.json.code === 'org_suspended', r.json);
  r = await call('POST', '/auth/login', { body: { login: 'admin@other', password: 'OtherAdmin456' } });
  check('suspended org cannot log in', r.status === 403);
  await call('PATCH', `/platform/orgs/${orgB}`, { token: platformToken, body: { status: 'active' } });
  r = await call('GET', '/sync/pull?since=0', { token: adminB });
  check('reactivated org works again', r.status === 200);

  // ---------------------------------------------------------------- platform recovery + audit
  r = await call('POST', `/platform/orgs/${orgA}/reset-admin-password`, { token: platformToken, body: { userId: adminUser.id } });
  check('platform admin can reset an org admin password', r.status === 200 && r.json.temporaryPassword, r.json);
  r = await call('GET', '/platform/audit', { token: platformToken });
  const actions = new Set(r.json.map((x: any) => x.action));
  check('audit log records key actions', ['org_created', 'user_created', 'org_suspended', 'org_active', 'user_updated', 'org_admin_password_reset'].every((x) => actions.has(x)), [...actions]);

  // ---------------------------------------------------------------- public registration (no approval)
  r = await call('GET', '/public/config');
  check('public config says registration is open', r.status === 200 && r.json.registration === true, r.json);
  r = await call('POST', '/public/register', { body: { name: 'Self Reg College', code: 'selfreg', adminName: 'Reg Admin', adminLogin: 'reg@selfreg', password: 'MyOwnPass99', contactEmail: 'x@y.z' } });
  check('anyone can register an organization', r.status === 201 && r.json.ok, r.json);
  r = await call('POST', '/auth/login', { body: { login: 'reg@selfreg', password: 'MyOwnPass99' } });
  check('registrant signs in at once, as org admin, no forced password change', r.status === 200 && r.json.user.role === 'org_admin' && r.json.user.mustChangePassword === false, r.json);
  const regAdmin = r.json.accessToken as string;
  r = await call('POST', '/sync/push', { token: regAdmin, body: { changes: [{ entity: 'students', id: 'z1', data: { id: 'z1' } }] } });
  check('new organization can sync straight away', r.status === 200 && r.json.applied === 1, r.json);
  r = await call('GET', '/sync/pull?since=0&entities=students', { token: regAdmin });
  check('new organization sees only its own data', r.json.records.length === 1, r.json);
  r = await call('POST', '/public/register', { body: { name: 'Again', code: 'selfreg', adminName: 'x', adminLogin: 'other@x', password: 'MyOwnPass99' } });
  check('duplicate short code refused', r.status === 409, r.json);
  r = await call('POST', '/public/register', { body: { name: 'Again', code: 'again', adminName: 'x', adminLogin: 'REG@selfreg', password: 'MyOwnPass99' } });
  check('duplicate login refused (case-insensitive)', r.status === 409, r.json);
  r = await call('POST', '/public/register', { body: { name: 'Weak', code: 'weak', adminName: 'x', adminLogin: 'w@w', password: 'short' } });
  check('weak password refused', r.status === 400);
  r = await call('POST', '/public/register', { body: { name: 'Bad', code: 'Bad Code', adminName: 'x', adminLogin: 'b@b', password: 'MyOwnPass99' } });
  check('bad short code refused', r.status === 400);
  r = await call('GET', '/platform/orgs', { token: platformToken });
  check('platform admin sees the self-registered organization', r.json.some((o: any) => o.code === 'selfreg'), r.json.map((o: any) => o.code));

  // ---------------------------------------------------------------- no auth / bad token
  r = await call('GET', '/sync/pull');
  check('no token -> 401', r.status === 401);
  r = await call('GET', '/sync/pull', { token: 'not.a.jwt' });
  check('bad token -> 401', r.status === 401);
} catch (err) {
  failures.push(`exception: ${err instanceof Error ? err.message : err}`);
  console.log(err);
  console.log('--- server log ---\n' + serverLog.slice(-1500));
} finally {
  await cleanup();
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failed:', failures);
  process.exit(1);
}
process.exit(0);

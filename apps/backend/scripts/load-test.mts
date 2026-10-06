/**
 * Load test of the multi-organization backend against a real Postgres.
 *   DATABASE_URL=... [PG_POOL_MAX=5] npx tsx scripts/load-test.mts
 * Starts its own server on a throw-away schema (exam_alloc_load, dropped at the end), registers several organizations,
 * seeds realistic data (700 students, 14 rooms, 9 exams per organization) and measures throughput and latency of:
 *   health (no database) | authenticated call (1 query) | login (password hashing) | pull | push | a mixed workload
 * at rising concurrency. It never touches the real "exam_alloc" schema.
 */
import { spawn } from 'node:child_process';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required');
const SCHEMA = 'exam_alloc_load';
const PORT = 4792;
const BASE = `http://localhost:${PORT}/api`;
const POOL = process.env.PG_POOL_MAX ?? '5';
const ORGS = Number(process.env.LOAD_ORGS ?? 6);
const STEP_SECONDS = Number(process.env.LOAD_STEP_SECONDS ?? 8);
const LEVELS = (process.env.LOAD_LEVELS ?? '1,5,10,20,40').split(',').map(Number);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Org {
  token: string;
  cursorEnd: string;
  code: string;
}

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

interface StepResult {
  level: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: number;
  total: number;
}

/** Runs `fn` from `level` parallel workers for `seconds`, back to back. */
async function step(level: number, seconds: number, fn: (worker: number) => Promise<boolean>): Promise<StepResult> {
  const latencies: number[] = [];
  let errors = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: level }, async (_, w) => {
      while (Date.now() < end) {
        const t0 = performance.now();
        let ok = false;
        try {
          ok = await fn(w);
        } catch {
          ok = false;
        }
        const dt = performance.now() - t0;
        if (ok) latencies.push(dt);
        else errors++;
      }
    })
  );
  latencies.sort((a, b) => a - b);
  return {
    level,
    rps: latencies.length / seconds,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies[latencies.length - 1] ?? 0,
    errors,
    total: latencies.length + errors,
  };
}

function table(title: string, rows: StepResult[]) {
  console.log(`\n${title}`);
  console.log('  users   req/s    p50 ms   p95 ms   p99 ms   max ms   errors');
  for (const r of rows) {
    console.log(
      `  ${String(r.level).padStart(5)}  ${r.rps.toFixed(1).padStart(6)}  ${r.p50.toFixed(0).padStart(7)}  ${r.p95.toFixed(0).padStart(7)}  ${r.p99.toFixed(0).padStart(7)}  ${r.max.toFixed(0).padStart(7)}  ${String(r.errors).padStart(3)}/${r.total}`
    );
  }
}

const server = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
  env: {
    ...process.env,
    DATA_BACKEND: 'postgres',
    DB_SCHEMA: SCHEMA,
    PORT: String(PORT),
    PG_POOL_MAX: POOL,
    JWT_SECRET: 'load-secret-load-secret-load-secret-123456',
    SUPER_ADMIN_LOGIN: 'platform@load',
    SUPER_ADMIN_PASSWORD: 'PlatformLoad1',
    LOGIN_RATE_LIMIT: '1000000',
    REGISTER_RATE_LIMIT: '1000000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function cleanup() {
  server.kill();
  if (server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  await sleep(1500);
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const size = await client.query(`select coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint as bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind in ('r','i')`, [SCHEMA]);
  console.log(`\nData written during the test: ${(Number(size.rows[0].bytes) / 1024 / 1024).toFixed(1)} MB (tables + indexes)`);
  await client.query(`drop schema if exists "${SCHEMA}" cascade`);
  await client.end();
}

try {
  const pre = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pre.connect();
  await pre.query(`drop schema if exists "${SCHEMA}" cascade`);
  // round-trip time from this machine to the database (the server here pays this on every query)
  const rtts: number[] = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    await pre.query('select 1');
    rtts.push(performance.now() - t0);
  }
  await pre.end();
  rtts.sort((a, b) => a - b);
  console.log(`Pool size: ${POOL} connections | organizations: ${ORGS} | ${STEP_SECONDS}s per step`);
  console.log(`Round trip from this computer to the database: median ${rtts[7]!.toFixed(0)} ms (every query the server runs pays this)`);

  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE + '/health')).ok) break;
    } catch {
      /* not up */
    }
    await sleep(500);
  }

  // ---------------------------------------------------------------- set up organizations with realistic data
  const orgs: Org[] = [];
  const setupStart = Date.now();
  for (let i = 0; i < ORGS; i++) {
    const code = `load${i}`;
    let r = await call('POST', '/public/register', { body: { name: `Load College ${i}`, code, adminName: 'Admin', adminLogin: `admin@${code}`, password: 'LoadTest12345' } });
    if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.json));
    r = await call('POST', '/auth/login', { body: { login: `admin@${code}`, password: 'LoadTest12345' } });
    const token = r.json.accessToken as string;
    const changes: any[] = [];
    for (let s = 0; s < 700; s++) changes.push({ entity: 'students', id: `stu-${s}`, data: { id: `stu-${s}`, rollNumber: `202530${1000 + s}`, name: `Student Number ${s}`, branch: ['CSE', 'ECE', 'ME', 'CIVIL', 'ELEC.', 'AI&ML'][s % 6], year: 2, section: 'A', semester: 3, batch: '2025', active: true } });
    for (let k = 0; k < 14; k++) changes.push({ entity: 'rooms', id: `room-${k}`, data: { id: `room-${k}`, name: `LH${k}`, rows: 10, seats: Array.from({ length: 60 }, (_, q) => ({ id: `room-${k}-${q}`, row: Math.floor(q / 6) + 1, col: (q % 6) + 1 })) } });
    for (let k = 0; k < 9; k++) changes.push({ entity: 'exams', id: `exam-${k}`, data: { id: `exam-${k}`, name: `Sitting ${k}`, studentIds: Array.from({ length: 300 }, (_, q) => `stu-${q}`) } });
    for (let k = 0; k < 9; k++) changes.push({ entity: 'allocations', id: `alloc-${k}`, data: { id: `alloc-${k}`, examId: `exam-${k}`, assignments: Array.from({ length: 300 }, (_, q) => ({ studentId: `stu-${q}`, seatId: `room-${q % 14}-${q}`, roomId: `room-${q % 14}` })) } });
    for (let b = 0; b < changes.length; b += 200) {
      r = await call('POST', '/sync/push', { token, body: { deviceId: 'seed', changes: changes.slice(b, b + 200) } });
      if (r.status !== 200) throw new Error('seed push failed ' + JSON.stringify(r.json));
    }
    r = await call('GET', '/sync/status', { token });
    orgs.push({ token, cursorEnd: r.json.cursor, code });
  }
  console.log(`Seeded ${ORGS} organizations x (700 students, 14 rooms, 9 exams, 9 seating plans) in ${((Date.now() - setupStart) / 1000).toFixed(1)}s`);

  const pick = (w: number) => orgs[w % orgs.length]!;

  // ---------------------------------------------------------------- 1. no database
  const health: StepResult[] = [];
  for (const level of LEVELS) health.push(await step(level, Math.min(STEP_SECONDS, 5), async () => (await fetch(BASE + '/health')).ok));
  table('1. Health check (no database - the server itself)', health);

  // ---------------------------------------------------------------- 2. one authenticated call
  const me: StepResult[] = [];
  for (const level of LEVELS) me.push(await step(level, STEP_SECONDS, async (w) => (await call('GET', '/auth/me', { token: pick(w).token })).status === 200));
  table('2. Authenticated call (1 database query: is this user still allowed)', me);

  // ---------------------------------------------------------------- 3. quiet sync poll (the common case)
  const poll: StepResult[] = [];
  for (const level of LEVELS) poll.push(await step(level, STEP_SECONDS, async (w) => (await call('GET', `/sync/pull?since=${pick(w).cursorEnd}&limit=300&device=x`, { token: pick(w).token })).status === 200));
  table('3. Quiet sync (pull with nothing new) - what every user does every N minutes', poll);

  // ---------------------------------------------------------------- 4. heavy first pull
  const first: StepResult[] = [];
  for (const level of LEVELS.filter((l) => l <= 20)) first.push(await step(level, STEP_SECONDS, async (w) => (await call('GET', '/sync/pull?since=0&limit=300&device=x', { token: pick(w).token })).status === 200));
  table('4. First-time download page (300 records, ~350 KB) - a new device joining', first);

  // ---------------------------------------------------------------- 5. small push (attendance marking)
  let counter = 0;
  const push: StepResult[] = [];
  for (const level of LEVELS) {
    push.push(
      await step(level, STEP_SECONDS, async (w) => {
        const n = counter++;
        const changes = Array.from({ length: 10 }, (_, q) => ({ entity: 'attendanceMark', id: `exam-1:R${w}-${n}-${q}`, data: { rollNumber: `R${w}-${n}-${q}`, mark: 'absent', markedAt: new Date().toISOString() } }));
        return (await call('POST', '/sync/push', { token: pick(w).token, body: { deviceId: `d${w}`, changes } })).status === 200;
      })
    );
  }
  table('5. Push of 10 attendance marks (users marking absentees)', push);

  // ---------------------------------------------------------------- 6. big push
  const big: StepResult[] = [];
  let bc = 0;
  for (const level of LEVELS.filter((l) => l <= 10)) {
    big.push(
      await step(level, STEP_SECONDS, async (w) => {
        const n = bc++;
        const changes = Array.from({ length: 200 }, (_, q) => ({ entity: 'students', id: `bulk-${w}-${n}-${q}`, data: { id: `bulk-${w}-${n}-${q}`, rollNumber: `B${n}${q}`, name: 'Bulk student', branch: 'CSE', year: 1, section: 'A', active: true } }));
        return (await call('POST', '/sync/push', { token: pick(w).token, body: { deviceId: `d${w}`, changes } })).status === 200;
      })
    );
  }
  table('6. Push of 200 records (importing a student list)', big);

  // ---------------------------------------------------------------- 7. login (password hashing uses CPU)
  const logins: StepResult[] = [];
  for (const level of LEVELS.filter((l) => l <= 20)) logins.push(await step(level, Math.min(STEP_SECONDS, 6), async (w) => (await call('POST', '/auth/login', { body: { login: `admin@${pick(w).code}`, password: 'LoadTest12345' } })).status === 200));
  table('7. Sign-in (scrypt password check + token creation)', logins);

  // ---------------------------------------------------------------- what this means
  const bestPoll = Math.max(...poll.map((r) => r.rps));
  const bestPush = Math.max(...push.map((r) => r.rps));
  console.log('\nCapacity estimate from the numbers above');
  console.log(`  Best quiet-sync rate: ${bestPoll.toFixed(1)}/s -> about ${Math.round((bestPoll * 900) / 1)} signed-in users if each syncs once every 15 minutes.`);
  console.log(`  Best small-push rate: ${bestPush.toFixed(1)}/s -> about ${Math.round(bestPush)} attendance-marking pushes per second.`);
  console.log(`  Peak errors at any step: ${Math.max(...[...health, ...me, ...poll, ...push].map((r) => r.errors))}`);
} catch (err) {
  console.log('LOAD TEST FAILED:', err);
  console.log('--- server log ---\n' + serverLog.slice(-1500));
  process.exitCode = 1;
} finally {
  await cleanup();
}
process.exit(process.exitCode ?? 0);

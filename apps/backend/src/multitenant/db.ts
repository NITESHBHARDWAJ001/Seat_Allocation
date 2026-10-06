import pg from 'pg';

/**
 * Multi-tenant Postgres access (DATA_BACKEND=postgres). Every table lives in one schema (DB_SCHEMA, default
 * "exam_alloc") so it never collides with anything else in the database, and tests can use a throw-away schema.
 */
const schema = process.env.DB_SCHEMA ?? 'exam_alloc';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`DB_SCHEMA "${schema}" is not a safe identifier`);

export const SCHEMA = schema;
/** Fully qualified table name, e.g. tbl('users') -> "exam_alloc".users */
export const tbl = (name: string): string => `"${schema}".${name}`;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required when DATA_BACKEND=postgres');
    pool = new pg.Pool({
      connectionString,
      // Supabase (and most managed Postgres) require TLS; set PGSSL=disable only for a local database.
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    pool.on('error', (err) => console.error('[pg pool]', err.message));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Runs `fn` inside a transaction; rolls back on any error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}

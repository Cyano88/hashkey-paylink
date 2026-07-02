import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function requirePool() {
  if (!pool) throw new Error('Render durable Postgres storage is not configured. Add DATABASE_URL on Render.')
  return pool
}

async function ensureSchema() {
  schemaReady ??= requirePool().query(`
    create table if not exists render_durable_kv (
      store_key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    );
  `).then(() => undefined)
  await schemaReady
}

export function hasRenderDurableStore() {
  return Boolean(pool)
}

export async function readDurableJson<T>(key: string): Promise<T | undefined> {
  if (!pool) return undefined
  await ensureSchema()
  const result = await pool.query('select value from render_durable_kv where store_key = $1 limit 1', [key])
  return result.rows[0]?.value as T | undefined
}

export async function writeDurableJson(key: string, value: unknown): Promise<void> {
  await ensureSchema()
  await requirePool().query(
    `insert into render_durable_kv (store_key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (store_key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()

function parsedDatabaseUrl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl)
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new Error()
    return parsed
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  }
}

export function renderDurableStoreSslConfig(
  databaseUrl: string,
  env: Partial<Pick<NodeJS.ProcessEnv, 'DATABASE_CA_CERT' | 'RENDER_POSTGRES_CA_CERT'>> = process.env,
): false | { rejectUnauthorized: true; ca?: string } {
  const hostname = parsedDatabaseUrl(databaseUrl).hostname.toLowerCase()
  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.internal')
    || !hostname.includes('.')
  ) {
    return false
  }
  const ca = String(env.DATABASE_CA_CERT ?? env.RENDER_POSTGRES_CA_CERT ?? '')
    .trim()
    .replace(/\\n/g, '\n')
  return ca
    ? { rejectUnauthorized: true, ca }
    : { rejectUnauthorized: true }
}

export function renderDurableStoreConnectionConfig(
  databaseUrl: string,
  env: Partial<Pick<NodeJS.ProcessEnv, 'DATABASE_CA_CERT' | 'RENDER_POSTGRES_CA_CERT'>> = process.env,
) {
  const parsed = parsedDatabaseUrl(databaseUrl)
  const ssl = renderDurableStoreSslConfig(databaseUrl, env)
  if (ssl !== false) {
    // node-postgres lets SSL query parameters replace the explicit `ssl`
    // object. Remove them so a Render URL containing `sslmode=require`
    // cannot silently disable certificate verification.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      parsed.searchParams.delete(key)
    }
  }
  return { connectionString: parsed.toString(), ssl }
}

const pool = DATABASE_URL
  ? new Pool(renderDurableStoreConnectionConfig(DATABASE_URL))
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

export async function mutateDurableJson<T>(key: string, mutate: (current: T | undefined) => T | Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await requirePool().connect()
  try {
    await client.query('begin')
    // Ensure the key exists before locking it. SELECT ... FOR UPDATE cannot lock
    // an absent row, so concurrent first writes could otherwise overwrite one another.
    await client.query(
      `insert into render_durable_kv (store_key, value, updated_at)
        values ($1, 'null'::jsonb, now())
        on conflict (store_key) do nothing`,
      [key],
    )
    const result = await client.query('select value from render_durable_kv where store_key = $1 for update', [key])
    const current = (result.rows[0]?.value ?? undefined) as T | undefined
    const next = await mutate(current)
    await client.query(
      `insert into render_durable_kv (store_key, value, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (store_key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(next)],
    )
    await client.query('commit')
    return next
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

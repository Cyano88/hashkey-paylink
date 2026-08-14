import assert from 'node:assert/strict'
import pg from 'pg'

const url = String(process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim()
if (!url) {
  console.log('Pocket backup verification skipped: DATABASE_URL is not configured in this environment.')
  process.exit(0)
}
const pool = new pg.Pool({ connectionString: url, ssl: url.includes('.internal') ? false : { rejectUnauthorized: true } })
try {
  const [kv, ledger] = await Promise.all([
    pool.query('select count(*)::int as count, max(updated_at) as latest from render_durable_kv'),
    pool.query('select count(*)::int as count, max(recorded_at)::bigint as latest from pocket_money_ledger'),
  ])
  assert.ok(kv.rows[0].count >= 1, 'Durable KV backup contains no stores.')
  assert.ok(ledger.rows[0].count >= 0)
  console.log(JSON.stringify({ ok: true, durableStores: kv.rows[0].count, durableLatest: kv.rows[0].latest, ledgerEvents: ledger.rows[0].count, ledgerLatest: ledger.rows[0].latest }))
} finally {
  await pool.end()
}

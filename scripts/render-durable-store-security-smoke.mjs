import assert from 'node:assert/strict'
import {
  renderDurableStoreConnectionConfig,
  renderDurableStoreSslConfig,
} from '../api/render-durable-store.ts'

assert.equal(
  renderDurableStoreSslConfig('postgresql://user:pass@localhost:5432/hashpaylink'),
  false,
)
assert.equal(
  renderDurableStoreSslConfig('postgresql://user:pass@dpg-private:5432/hashpaylink'),
  false,
)
assert.equal(
  renderDurableStoreSslConfig('postgresql://user:pass@database.internal:5432/hashpaylink'),
  false,
)
assert.deepEqual(
  renderDurableStoreSslConfig('postgresql://user:pass@external-postgres.render.com:5432/hashpaylink'),
  { rejectUnauthorized: true },
)
assert.deepEqual(
  renderDurableStoreSslConfig(
    'postgresql://user:pass@external-postgres.render.com:5432/hashpaylink',
    { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----' },
  ),
  {
    rejectUnauthorized: true,
    ca: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
  },
)
const sanitizedExternal = renderDurableStoreConnectionConfig(
  'postgresql://user:pass@external-postgres.render.com:5432/hashpaylink?sslmode=require',
)
assert.deepEqual(sanitizedExternal.ssl, { rejectUnauthorized: true })
assert.equal(new URL(sanitizedExternal.connectionString).searchParams.has('sslmode'), false)
assert.throws(
  () => renderDurableStoreSslConfig('not-a-postgres-url'),
  /valid PostgreSQL URL/,
)
assert.throws(
  () => renderDurableStoreSslConfig('https://external-postgres.render.com/hashpaylink'),
  /valid PostgreSQL URL/,
)

console.log('Render durable store TLS security smoke checks passed.')

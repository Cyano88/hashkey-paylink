import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPocketTransactionOperationsHandler } from '../api/pocket/transaction-operations.ts'

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this },
    json(value) { this.payload = value; return this },
  }
}

const now = 1_800_000
const unresolved = [{
  id: 'pei_1', ownerId: 'did:privy:operator-customer-12345', idempotencyKey: 'private-key', requestHash: 'private-hash',
  kind: 'bank_payout', state: 'processing', asset: 'USDC', amount: '2.5',
  sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bank',
  resourceId: 'paycrest_1', providerReference: 'provider_1', transactionHash: '0xabc', failureCode: '',
  metadata: { accountNumber: 'must-not-leak' }, createdAt: 100_000, updatedAt: 600_000,
}]
let verified = 0
let reconciled = 0
const handler = createPocketTransactionOperationsHandler({
  verifyAdmin: async () => { verified += 1; return { userId: 'admin', email: 'admin@example.com' } },
  listUnresolved: async limit => { assert.equal(limit, 500); return unresolved },
  reconcile: async () => {
    reconciled += 1
    return { ok: false, processed: 1, reconciled: 0, unchanged: 0, review: 0, errors: 1, stale: 1, alerted: false, results: [] }
  },
  now: () => now,
})

const getRes = response()
await handler({ method: 'GET', headers: {} }, getRes)
assert.equal(getRes.statusCode, 200)
assert.equal(getRes.payload.ok, true)
assert.equal(getRes.payload.summary.unresolved, 1)
assert.equal(getRes.payload.summary.processing, 1)
assert.equal(getRes.payload.executions[0].ageMs, 1_200_000)
assert.equal(getRes.payload.executions[0].pendingForMs, 1_700_000)
assert.match(getRes.payload.executions[0].owner, /\.\.\./)
assert.equal('metadata' in getRes.payload.executions[0], false)
assert.equal('idempotencyKey' in getRes.payload.executions[0], false)
assert.equal('requestHash' in getRes.payload.executions[0], false)

const postRes = response()
await handler({ method: 'POST', headers: {}, body: { action: 'reconcile' } }, postRes)
assert.equal(postRes.statusCode, 200)
assert.equal(postRes.payload.ok, true)
assert.equal(postRes.payload.reconciliation.ok, false)
assert.equal(reconciled, 1)

const invalidRes = response()
await handler({ method: 'POST', headers: {}, body: { action: 'mark-paid' } }, invalidRes)
assert.equal(invalidRes.statusCode, 400)
assert.equal(reconciled, 1)

const methodRes = response()
await handler({ method: 'DELETE', headers: {} }, methodRes)
assert.equal(methodRes.statusCode, 405)
assert.equal(verified, 3)

const forbidden = createPocketTransactionOperationsHandler({
  verifyAdmin: async () => { throw Object.assign(new Error('Restricted.'), { status: 403 }) },
})
const forbiddenRes = response()
await forbidden({ method: 'GET', headers: {} }, forbiddenRes)
assert.equal(forbiddenRes.statusCode, 403)
assert.equal(forbiddenRes.payload.error, 'Restricted.')

const operationsSource = await readFile(new URL('../src/pages/DeveloperOperationsPage.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.equal((operationsSource.match(/> Sign out<\/button>/g) || []).length, 1)
assert.match(operationsSource, /surface === 'transactions'/)
assert.match(appSource, /admin\/transactions/)
assert.match(serverSource, /\/api\/admin\/pocket\/transactions/)

console.log('Pocket transaction operations smoke test passed.')

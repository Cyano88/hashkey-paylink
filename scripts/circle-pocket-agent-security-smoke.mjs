import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storeDir = await mkdtemp(join(tmpdir(), 'circle-pocket-agent-security-'))
delete process.env.DATABASE_URL
delete process.env.POSTGRES_URL
process.env.TELEGRAM_REQUEST_STORE = join(storeDir, 'requests.json')
process.env.CIRCLE_POCKET_ACTION_STORE = join(storeDir, 'actions.json')
process.env.CIRCLE_POCKET_ACTION_STORE_KEY = `circle-pocket-actions-smoke-${Date.now()}`

const [{ default: askHandler }, { default: requestHandler }, { claimCirclePocketAction, recordCirclePocketAction }] = await Promise.all([
  import('../api/agent-ask.ts'),
  import('../api/telegram-request.ts'),
  import('../api/circle-pocket-action-journal.ts'),
])

async function call(handler, { method = 'POST', headers = {}, query = {}, body = {} } = {}) {
  let statusCode = 200
  let payload
  await handler({ method, headers, query, body, protocol: 'http' }, {
    status(code) { statusCode = code; return this },
    json(value) { payload = value; return this },
    setHeader() { return this },
  })
  return { statusCode, payload }
}

const missingAskIdentity = await call(askHandler, {
  body: { payer: 'spoofed', question: 'What is USDC?', accessMode: 'helper-free' },
})
assert.equal(missingAskIdentity.statusCode, 401)

const missingCreateIdentity = await call(requestHandler, {
  headers: { 'idempotency-key': 'circle-pocket-test-key-0001' },
  body: {
    wallet: '0x1111111111111111111111111111111111111111',
    network: 'base',
    label: 'Invoice',
    target: 'Payer',
    amount: '5',
  },
})
assert.equal(missingCreateIdentity.statusCode, 401)

const headers = {
  'x-helper-session': 'a'.repeat(64),
  'idempotency-key': 'circle-pocket-test-key-0001',
}
const body = {
  wallet: '0x1111111111111111111111111111111111111111',
  network: 'base',
  label: 'Invoice',
  target: 'Payer',
  amount: '5',
}
const first = await call(requestHandler, { headers, body })
const replay = await call(requestHandler, { headers, body })
assert.equal(first.statusCode, 200)
assert.equal(replay.statusCode, 200)
assert.equal(first.payload.request.id, replay.payload.request.id)
assert.equal(replay.payload.replayed, true)
assert.equal('ownerId' in first.payload.request, false)
assert.equal('idempotencyKey' in first.payload.request, false)

const actionInput = {
  ownerId: 'journal-owner-1',
  idempotencyKey: 'pocket:x402-activate:journal-request-0001',
  action: 'x402.gateway.activate',
  metadata: { network: 'base', amount: '0.5' },
}
const concurrentClaims = await Promise.all([
  claimCirclePocketAction(actionInput),
  claimCirclePocketAction(actionInput),
])
assert.equal(concurrentClaims.filter(result => result.claimed).length, 1)
assert.equal(concurrentClaims[0].record.id, concurrentClaims[1].record.id)
await recordCirclePocketAction({ ...actionInput, status: 'completed' })
const completedReplay = await claimCirclePocketAction(actionInput)
assert.equal(completedReplay.claimed, false)
assert.equal(completedReplay.record.status, 'completed')

const marketplaceLock = {
  ownerId: 'journal-owner-marketplace',
  action: 'marketplace.service.purchase',
  metadata: { resource: 'https://service.example/one-tap' },
  dedupe: {
    metadataKey: 'resource',
    metadataValue: 'https://service.example/one-tap',
    statuses: ['started', 'submitted'],
    startedAfter: Date.now() - 60_000,
  },
}
const competingMarketplaceClaims = await Promise.all([
  claimCirclePocketAction({ ...marketplaceLock, idempotencyKey: 'pocket:marketplace:concurrent-0001' }),
  claimCirclePocketAction({ ...marketplaceLock, idempotencyKey: 'pocket:marketplace:concurrent-0002' }),
])
assert.equal(competingMarketplaceClaims.filter(result => result.claimed).length, 1)
assert.equal(competingMarketplaceClaims[0].record.id, competingMarketplaceClaims[1].record.id)

console.log('circle pocket agent security smoke ok')

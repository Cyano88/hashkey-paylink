import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash, sign } from 'node:crypto'
import { verifyBridgeSandboxSignature } from '../api/pocket/bridge-sandbox-signature.ts'
import { bridgeSandboxAllowed, bridgeSandboxFlowStatus, createBridgeSandboxService } from '../api/pocket/bridge-sandbox-service.ts'

test('Bridge double-hashed signatures reject tampering, replay, future timestamps and single hashing', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const now = Date.now(), raw = Buffer.from('{"event_id":"test"}')
  const payload = Buffer.concat([Buffer.from(now + '.'), raw])
  const signature = sign('RSA-SHA256', createHash('sha256').update(payload).digest(), privateKey).toString('base64')
  const header = `t=${now},v0=${signature}`
  assert(verifyBridgeSandboxSignature(raw, header, pem, now))
  assert(!verifyBridgeSandboxSignature(Buffer.from('{}'), header, pem, now))
  assert(!verifyBridgeSandboxSignature(raw, header, pem, now + 600001))
  assert(!verifyBridgeSandboxSignature(raw, header, pem, now - 600001))
  assert(!verifyBridgeSandboxSignature(raw, `t=${now},v0=${sign('RSA-SHA256', payload, privateKey).toString('base64')}`, pem, now))
  assert(!verifyBridgeSandboxSignature(raw, header + ',v0=bad', pem, now))
})
test('sandbox is opt-in and restricted by verified account email', () => {
  const user = { userId: 'u', email: 'tester@example.com' }
  assert(!bridgeSandboxAllowed(user, {}))
  assert(!bridgeSandboxAllowed(user, { POCKET_BRIDGE_SANDBOX_ENABLED: 'true', POCKET_BRIDGE_SANDBOX_EMAILS: 'other@example.com' }))
  assert(bridgeSandboxAllowed(user, { POCKET_BRIDGE_SANDBOX_ENABLED: 'true', POCKET_BRIDGE_SANDBOX_EMAILS: 'Tester@example.com' }))
})
test('pending and unknown states are not success; completion cannot regress but returns remain visible', () => {
  assert.equal(bridgeSandboxFlowStatus([{ state: 'funds_received' }]), 'funds_received')
  assert.equal(bridgeSandboxFlowStatus([{ state: 'unknown' }]), 'not_started')
  assert.equal(bridgeSandboxFlowStatus([{ state: 'funds_received' }], 'payment_processed'), 'payment_processed')
  assert.equal(bridgeSandboxFlowStatus([{ state: 'returned' }], 'payment_processed'), 'returned')
})
test('durable requests resume, owners isolate, duplicate webhooks reconcile once and never trust event status', async () => {
  const db = new Map(), writes = [], reads = []
  let historyState = 'funds_received', uncertain = true
  const service = createBridgeSandboxService({
    read: async key => structuredClone(db.get(key)),
    mutate: async (key, fn) => { const next = await fn(structuredClone(db.get(key))); db.set(key, next); return structuredClone(next) },
    lock: async (_key, fn) => fn(),
    request: async (path, method, body, key) => {
      if (method === 'POST') {
        writes.push({ path, key })
        if (path === '/customers') return { id: 'customer-one' }
        if (path.endsWith('/virtual_accounts')) return { id: 'virtual-one' }
        if (path.endsWith('/simulate_deposit') && uncertain) { uncertain = false; throw Error('connection lost') }
        return { success: true }
      }
      reads.push(path)
      if (path.endsWith('/history')) return { data: [{ type: historyState }] }
      return { status: 'active', has_accepted_terms_of_service: true, endorsements: [{ name: 'base', status: 'approved' }] }
    },
  })
  await assert.rejects(service.run('owner-one', 'deposit'), /connection lost/)
  assert.equal((await service.run('owner-one', 'deposit')).deposit.status, 'funds_received')
  const simulations = writes.filter(w => w.path.endsWith('/simulate_deposit'))
  assert.equal(simulations.length, 2); assert.equal(simulations[0].key, simulations[1].key)
  const before = writes.length; await service.run('owner-one', 'deposit'); assert.equal(writes.length, before)
  assert.equal((await service.run('other-owner')).ready, false)
  const event = { event_id: 'event-one', event_category: 'virtual_account.activity', event_object_id: 'activity-one', event_object: { id: 'activity-one', customer_id: 'customer-one', type: 'payment_processed', amount: '9999999' } }
  await service.receiveEvent(event)
  assert.equal((await service.run('owner-one')).deposit.status, 'funds_received')
  const readCount = reads.length; await service.receiveEvent(event); assert.equal(reads.length, readCount)
  historyState = 'payment_processed'; await service.receiveEvent({ ...event, event_id: 'event-two' })
  assert.equal((await service.run('owner-one')).deposit.status, 'payment_processed')
})

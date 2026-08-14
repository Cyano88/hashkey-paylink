import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPocketPaylinkRepository } from '../api/pocket/paylink-store.ts'
import { createPocketPaylinksHandler } from '../api/pocket/paylinks.ts'

const root = await mkdtemp(join(tmpdir(), 'pocket-paylinks-'))
const repository = createPocketPaylinkRepository({ durable: false, isRender: false, storePath: join(root, 'links.json'), now: () => 1_765_000_000_000 })
const eventId = 'collection_shys_wedding_01'
const paymentUrl = `https://app.hashpaylink.com/pay?n=base&a=1&e=0x1111111111111111111111111111111111111111&m=Shys+wedding&v=1&id=${eventId}`

function responseRecorder() {
  return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

async function request(handler, method, body = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers: {} }, res)
  return res
}

try {
  const handler = createPocketPaylinksHandler({
    verifyUser: async () => ({ userId: 'did:privy:owner-1', email: 'owner@example.com' }),
    repository,
    listPayments: async ids => ids.includes(eventId) ? [{ eventId, txHash: '0xpaid', payer: 'Ada', memo: 'Ada', amount: '1', chain: 'base', ts: 123 }] : [],
  })
  const created = await request(handler, 'POST', { eventId, title: "Shy's wedding", paymentUrl })
  assert.equal(created.statusCode, 201)
  assert.equal(created.body.link.title, "Shy's wedding")
  assert.equal(JSON.stringify(created.body).includes('did:privy'), false)

  const listed = await request(handler, 'GET')
  assert.equal(listed.statusCode, 200)
  assert.equal(listed.body.links.length, 1)
  assert.equal(listed.body.payments[0].payer, 'Ada')
  assert.equal(JSON.stringify(listed.body).includes('owner@example.com'), false)

  const untrusted = await request(handler, 'POST', {
    eventId: 'collection_untrusted_host_01',
    title: 'Untrusted',
    paymentUrl: 'https://example.com/pay?v=1&id=collection_untrusted_host_01',
  })
  assert.equal(untrusted.statusCode, 400)

  const foreign = createPocketPaylinksHandler({
    verifyUser: async () => ({ userId: 'did:privy:owner-2' }),
    repository,
    listPayments: async () => [],
  })
  const conflict = await request(foreign, 'POST', { eventId, title: 'Hijack', paymentUrl })
  assert.equal(conflict.statusCode, 409)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('Pocket Collections adapter smoke test passed.')

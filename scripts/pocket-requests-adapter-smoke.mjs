import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPocketRequestRepository } from '../api/pocket/request-store.ts'
import { createPocketRequestsHandler } from '../api/pocket/requests.ts'

const root = await mkdtemp(join(tmpdir(), 'pocket-requests-'))
const repository = createPocketRequestRepository({ durable: false, isRender: false, storePath: join(root, 'requests.json'), now: (() => { let value = 100; return () => ++value })() })
const profiles = {
  async ensure(identity) { return { profile: identity.userId === 'sender' ? { privyUserId: 'sender', pocketId: '11111111', resolvedName: 'Ada Sender' } : { privyUserId: 'recipient', pocketId: '22222222', resolvedName: 'Grace Recipient' }, unchanged: true } },
  async getByPocketId(id) { return id === '22222222' ? { privyUserId: 'recipient', pocketId: '22222222' } : id === '11111111' ? { privyUserId: 'sender', pocketId: '11111111' } : undefined },
}
const response = () => ({ statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
async function call(handler, method, body = {}) { const res = response(); await handler({ method, body, headers: {} }, res); return res }
const identity = { current: 'sender' }
const eventId = 'request_event_0001'
const paymentUrl = 'https://pocket.hashpaylink.com/pay?v=1&id=' + eventId + '&n=base&e=0x1111111111111111111111111111111111111111&a=5'

try {
  const handler = createPocketRequestsHandler({
    verifyUser: async () => ({ userId: identity.current, email: identity.current + '@example.com' }),
    profiles,
    repository,
    listPayments: async ids => ids.includes(eventId) && identity.current === 'sender' ? [] : [],
    readWallet: async key => key === 'recipient:base' ? { privyUserId: 'recipient', chain: 'base', circleWalletId: 'wallet-1', circleWalletAddress: '0x2222222222222222222222222222222222222222', circleBlockchain: 'ETH', updatedAt: 1 } : null,
  })
  const resolved = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '22222222', network: 'base' })
  assert.equal(resolved.statusCode, 200, JSON.stringify(resolved.body))
  assert.equal(resolved.body.recipient.address, '0x2222222222222222222222222222222222222222')
  assert.equal(resolved.body.recipient.name, 'Pocket 22222222')
  const self = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '11111111', network: 'base' })
  assert.equal(self.statusCode, 400)
  const unopened = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '22222222', network: 'solana' })
  assert.equal(unopened.statusCode, 409)
  const created = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId, title: 'Dinner', amount: '5', network: 'base', paymentUrl })
  assert.equal(created.statusCode, 201, JSON.stringify(created.body))
  assert.equal(created.body.request.direction, 'outgoing')
  assert.equal(JSON.stringify(created.body).includes('recipient@example.com'), false)
  const replay = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId, title: 'Dinner', amount: '5', network: 'base', paymentUrl })
  assert.equal(replay.statusCode, 200)

  identity.current = 'recipient'
  const incoming = await call(handler, 'GET')
  assert.equal(incoming.body.requests[0].direction, 'incoming')
  assert.equal(incoming.body.requests[0].status, 'pending')
  const accepted = await call(handler, 'POST', { action: 'accept', id: incoming.body.requests[0].id })
  assert.equal(accepted.body.request.status, 'accepted')

  identity.current = 'sender'
  const senderView = await call(handler, 'GET')
  assert.equal(senderView.body.requests[0].status, 'accepted')
  const forbidden = await call(handler, 'POST', { action: 'decline', id: senderView.body.requests[0].id })
  assert.equal(forbidden.statusCode, 403)
  const missing = await call(handler, 'POST', { action: 'create', recipientPocketId: '99999999', eventId: 'request_event_0002', title: 'Missing', amount: '1', network: 'base', paymentUrl: paymentUrl.replace(eventId, 'request_event_0002') })
  assert.equal(missing.statusCode, 404)
  const external = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId: 'request_event_0003', title: 'External', amount: '1', network: 'base', paymentUrl: 'https://evil.example/pay?v=1&id=request_event_0003&a=1' })
  assert.equal(external.statusCode, 400)
} finally {
  await rm(root, { recursive: true, force: true })
}
console.log('Pocket targeted requests adapter smoke tests passed.')

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPocketRequestRepository } from '../api/pocket/request-store.ts'
import { createPocketRequestsHandler } from '../api/pocket/requests.ts'

const root = await mkdtemp(join(tmpdir(), 'pocket-requests-'))
const repository = createPocketRequestRepository({ durable: false, isRender: false, storePath: join(root, 'requests.json'), now: (() => { let value = 100; return () => ++value })() })
const profiles = {
  async ensure(identity) { return { profile: identity.userId === 'sender' ? { privyUserId: 'sender', pocketId: '11111111', resolvedName: 'Ada Sender', nameStatus: 'bank_resolved', email: 'ada@example.com' } : { privyUserId: 'recipient', pocketId: '22222222', resolvedName: '', nameStatus: 'unverified', email: 'grace@example.com' }, unchanged: true } },
  async getByPocketId(id) { return id === '22222222' ? { privyUserId: 'recipient', pocketId: '22222222', resolvedName: '', nameStatus: 'unverified', email: 'grace@example.com' } : id === '11111111' ? { privyUserId: 'sender', pocketId: '11111111', resolvedName: 'Ada Sender', nameStatus: 'bank_resolved', email: 'ada@example.com' } : undefined },
}
const response = () => ({ statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
async function call(handler, method, body = {}) { const res = response(); await handler({ method, body, headers: {} }, res); return res }
const identity = { current: 'sender' }
const eventId = 'request_event_0001'
const txHash = '0x' + 'a'.repeat(64)

try {
  const handler = createPocketRequestsHandler({
    verifyUser: async () => ({ userId: identity.current, email: identity.current + '@example.com' }),
    profiles,
    repository,
    listPayments: async ids => ids.includes(eventId) && identity.current === 'sender' ? [] : [],
    readWallet: async key => key === 'recipient:base'
      ? { privyUserId: 'recipient', chain: 'base', circleWalletId: 'wallet-2', circleWalletAddress: '0x2222222222222222222222222222222222222222', circleBlockchain: 'ETH', updatedAt: 1 }
      : key === 'sender:base'
        ? { privyUserId: 'sender', chain: 'base', circleWalletId: 'wallet-1', circleWalletAddress: '0x1111111111111111111111111111111111111111', circleBlockchain: 'ETH', updatedAt: 1 }
        : null,
    verifyEvm: async input => { assert.equal(input.payer, '0x2222222222222222222222222222222222222222'); assert.equal(input.recipient, '0x1111111111111111111111111111111111111111'); assert.equal(input.minAmount, '5'); return { transactionHash: input.txHash } },
  })
  const requestUser = await call(handler, 'POST', { action: 'resolve-request-user', pocketId: '22222222' })
  assert.equal(requestUser.statusCode, 200, JSON.stringify(requestUser.body))
  assert.equal(requestUser.body.user.displayName, 'gr...ce@example.com')
  assert.equal(requestUser.body.user.verified, false)
  const resolved = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '22222222', network: 'base' })
  assert.equal(resolved.statusCode, 200, JSON.stringify(resolved.body))
  assert.equal(resolved.body.recipient.address, '0x2222222222222222222222222222222222222222')
  assert.equal(resolved.body.recipient.name, 'gr...ce@example.com')
  const self = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '11111111', network: 'base' })
  assert.equal(self.statusCode, 400)
  const unopened = await call(handler, 'POST', { action: 'resolve-recipient', pocketId: '22222222', network: 'solana' })
  assert.equal(unopened.statusCode, 409)
  const created = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId, title: 'Dinner', amount: '5', network: 'base' })
  assert.equal(created.statusCode, 201, JSON.stringify(created.body))
  assert.equal(created.body.request.direction, 'outgoing')
  assert.equal(created.body.request.paymentPath, `/home/send?request=preq_${eventId}`)
  assert.equal(JSON.stringify(created.body).includes('paymentUrl'), false)
  assert.equal(JSON.stringify(created.body).includes('recipient@example.com'), false)
  const replay = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId, title: 'Dinner', amount: '5', network: 'base' })
  assert.equal(replay.statusCode, 200)

  identity.current = 'recipient'
  const incoming = await call(handler, 'GET')
  assert.equal(incoming.body.unreadCount, 1)
  assert.equal(incoming.body.requests[0].direction, 'incoming')
  assert.equal(incoming.body.requests[0].status, 'pending')
  const accepted = await call(handler, 'POST', { action: 'accept', id: incoming.body.requests[0].id })
  assert.equal(accepted.body.request.status, 'accepted')
  const completed = await call(handler, 'POST', { action: 'complete', id: incoming.body.requests[0].id, transactionHash: txHash })
  assert.equal(completed.statusCode, 200, JSON.stringify(completed.body))
  assert.equal(completed.body.request.status, 'paid')
  assert.equal(completed.body.request.transactionHash, txHash)
  identity.current = 'sender'
  const second = await call(handler, 'POST', { action: 'create', recipientPocketId: '22222222', eventId: 'request_event_0002', title: 'Tickets', amount: '5', network: 'base' })
  assert.equal(second.statusCode, 201, JSON.stringify(second.body))
  identity.current = 'recipient'
  await call(handler, 'POST', { action: 'accept', id: second.body.request.id })
  const reused = await call(handler, 'POST', { action: 'complete', id: second.body.request.id, transactionHash: txHash })
  assert.equal(reused.statusCode, 409)
  const marked = await call(handler, 'POST', { action: 'mark-read' })
  assert.equal(marked.statusCode, 200)

  identity.current = 'sender'
  const senderView = await call(handler, 'GET')
  const paidRequest = senderView.body.requests.find(item => item.eventId === eventId)
  assert.equal(paidRequest.status, 'paid')
  const forbidden = await call(handler, 'POST', { action: 'decline', id: paidRequest.id })
  assert.equal(forbidden.statusCode, 403)
  const missing = await call(handler, 'POST', { action: 'create', recipientPocketId: '99999999', eventId: 'request_event_0004', title: 'Missing', amount: '1', network: 'base' })
  assert.equal(missing.statusCode, 404)
} finally {
  await rm(root, { recursive: true, force: true })
}
console.log('Pocket targeted requests adapter smoke tests passed.')

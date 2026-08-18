import assert from 'node:assert/strict'
import { runPocketMoneyPushWorker } from '../api/pocket/money-push-worker.ts'

const now = 2_000_000
const incomingHash = `0x${'1'.repeat(64)}`
const outgoingHash = `0x${'2'.repeat(64)}`
const internalHash = `0x${'3'.repeat(64)}`
const requestHash = `0x${'4'.repeat(64)}`
const bridgeHash = `0x${'5'.repeat(64)}`
const oldHash = `0x${'6'.repeat(64)}`
const acceptedHash = `0x${'7'.repeat(64)}`
const row = (overrides) => ({
  id: overrides.txHash,
  txHash: overrides.txHash,
  title: 'USDC moved',
  amount: '1',
  currency: 'USDC',
  chain: 'base',
  ts: now - 1_000,
  source: overrides.direction === 'in' ? 'wallet-deposit' : 'wallet-withdrawal',
  paycrestStatus: 'confirmed',
  direction: overrides.direction,
  ...overrides,
})
const pushes = []
const paidRequests = []
const result = await runPocketMoneyPushWorker({
  configured: () => true,
  listOwners: async () => ['owner-1'],
  readActivity: async () => [
    row({ txHash: incomingHash, direction: 'in', payer: '0xexternal' }),
    row({ txHash: outgoingHash, direction: 'out', recipient: '0xrecipient' }),
    row({ txHash: internalHash, direction: 'out', recipient: '0xownwallet' }),
    row({ txHash: requestHash, direction: 'out', recipient: '0xrequester' }),
    row({ txHash: bridgeHash, direction: 'out', recipient: '0xbridge' }),
    row({ txHash: oldHash, direction: 'in', payer: '0xold', ts: now - 11 * 60_000 }),
    row({ txHash: acceptedHash, direction: 'out', recipient: '0xrequester', amount: '3' }),
  ],
  readWallets: async () => [{ network: 'base', walletAddress: '0xownwallet' }],
  listActions: async () => [{ action: 'wallet.bridge', resourceId: bridgeHash, metadata: {}, ownerId: 'owner-1' }],
  listRequests: async () => [
    { id: 'paid-request', status: 'paid', transactionHash: requestHash },
    { id: 'accepted-request', status: 'accepted', recipientId: 'owner-1', senderId: 'requester-1', senderAddress: '0xrequester', amount: '3', updatedAt: now - 2_000 },
  ],
  markRequestPaid: async (ownerId, requestId, txHash) => {
    paidRequests.push({ ownerId, requestId, txHash })
    return { id: requestId, senderId: 'requester-1', recipientId: ownerId, amount: '3' }
  },
  sendPush: async (ownerId, eventId, input) => { pushes.push({ ownerId, eventId, input }) },
  now: () => now,
})

assert.deepEqual(result, { ok: true, owners: 1, notifications: 4, errors: 0 })
assert.deepEqual(paidRequests, [{ ownerId: 'owner-1', requestId: 'accepted-request', txHash: acceptedHash }])
assert.equal(pushes.length, 4)
assert.deepEqual(pushes.map(item => item.input.title).sort(), ['Payment received', 'Payment sent', 'USDC received', 'USDC sent'])
assert.ok(pushes.every(item => item.input.path === '/activity'))
assert.ok(pushes.every(item => item.input.tag.startsWith('pocket-')))
assert.ok(pushes.some(item => item.eventId.includes(incomingHash)))
assert.ok(pushes.some(item => item.eventId.includes(outgoingHash)))
assert.equal(pushes.some(item => item.eventId.includes(acceptedHash)), false, 'accepted request transfer must not also produce a generic push')
const olderHash = `0x${'8'.repeat(64)}`
const olderPushes = []
const olderMarks = []
const olderResult = await runPocketMoneyPushWorker({
  configured: () => true,
  listOwners: async () => ['owner-old'],
  readActivity: async () => [],
  readWallets: async () => [{ network: 'base', walletAddress: '0xpayer' }],
  listActions: async () => [],
  listRequests: async () => [{ id: 'older-request', status: 'accepted', recipientId: 'owner-old', senderId: 'requester-old', senderAddress: '0x1111111111111111111111111111111111111111', amount: '2', network: 'base', updatedAt: now - 60 * 60_000 }],
  markRequestPaid: async (ownerId, requestId, txHash) => {
    olderMarks.push({ ownerId, requestId, txHash })
    return { id: requestId, senderId: 'requester-old', recipientId: ownerId, amount: '2' }
  },
  findEvm: async input => { assert.equal(input.exactAmount, true); assert.equal(input.lookbackBlocks, 43_200n); assert.equal(input.chunkSize, 3_600n); return { txHash: olderHash } },
  findSolana: async () => null,
  sendPush: async (ownerId, eventId, input) => { olderPushes.push({ ownerId, eventId, input }) },
  now: () => now,
})
assert.deepEqual(olderResult, { ok: true, owners: 1, notifications: 2, errors: 0 })
assert.deepEqual(olderMarks, [{ ownerId: 'owner-old', requestId: 'older-request', txHash: olderHash }])
assert.deepEqual(olderPushes.map(item => item.input.title).sort(), ['Payment received', 'Payment sent'])
console.log('Pocket money push worker smoke tests passed: recent and older accepted payments reconcile to Paid while confirmed external sends and receipts notify without duplicates.')
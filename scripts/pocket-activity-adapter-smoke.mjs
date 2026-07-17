import assert from 'node:assert/strict'
import { createPocketActivityHandler } from '../api/pocket/activity.ts'
import { isPocketActivityReadData } from '../src/pocket/lib/pocketSchemas.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function request(handler, method = 'GET') {
  const res = responseRecorder()
  await handler({ method, headers: {} }, res)
  return res
}

const ownerIds = []
const handler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readHistory: async ownerId => {
    ownerIds.push(ownerId)
    return {
      payments: [
        {
          eventId: 'ngpos-merchant-1',
          txHash: '0xolder',
          chain: 'base',
          payer: 'Circle wallet payer',
          memo: 'Retail POS payment',
          amount: '2.5',
          ts: 1_720_000_000_000,
          source: 'ngpos',
          merchantId: 'merchant-1',
          internalOwnerId: 'must-not-leak',
        },
        {
          eventId: 'ngpos-merchant-2',
          txHash: 'paycrest_intent-2',
          chain: 'base',
          payer: 'Circle wallet payer',
          memo: 'Bank receive payment',
          amount: '3.75',
          ts: 1_730_000_000_000,
          source: 'bank-receive',
          settlementType: 'INSTANT_FIAT',
          amountNgn: '6000',
          paycrestStatus: 'settled',
          bankName: 'Must not leak separately',
        },
      ],
    }
  },
  readActions: async () => [{
    id: 'marketplace-action-1',
    ownerId: 'privy-user-1',
    idempotencyKey: 'pocket:marketplace:activity-0001',
    action: 'marketplace.service.purchase',
    status: 'failed',
    metadata: { provider: 'AIsa API', amount: '0.008', network: 'base', resource: 'https://service.example/ticker' },
    createdAt: 1_740_000_000_000,
    updatedAt: 1_740_000_000_000,
  }],
})

const wrongMethod = await request(handler, 'POST')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const loaded = await request(handler)
assert.equal(loaded.statusCode, 200)
assert.equal(loaded.body.ok, true)
assert.equal(isPocketActivityReadData(loaded.body), true)
assert.deepEqual(ownerIds, ['privy-user-1'])
assert.deepEqual(loaded.body.payments.map(row => row.txHash), ['pocket-action:marketplace-action-1', 'paycrest_intent-2', '0xolder'])
assert.equal(loaded.body.payments[0].source, 'app-pay')
assert.equal(loaded.body.payments[0].paycrestStatus, 'needs review')
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('ada@example.com'), false)
assert.equal(serialized.includes('must-not-leak'), false)
assert.equal(serialized.includes('Must not leak separately'), false)

const unauthorizedHandler = createPocketActivityHandler({
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
  readHistory: async () => ({ payments: [] }),
  readActions: async () => [],
})
const unauthorized = await request(unauthorizedHandler)
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readHistory: async () => { throw Object.assign(new Error('Activity store unavailable.'), { status: 503 }) },
  readActions: async () => [],
})
const unavailable = await request(unavailableHandler)
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

const invalidRowHandler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readHistory: async () => ({ payments: [{ eventId: 'broken' }] }),
  readActions: async () => [],
})
const invalidRow = await request(invalidRowHandler)
assert.equal(invalidRow.statusCode, 503)
assert.equal(invalidRow.body.error.code, 'PROVIDER_UNAVAILABLE')

console.log('Circle Pocket activity adapter smoke tests passed.')

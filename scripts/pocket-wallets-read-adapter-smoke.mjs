import assert from 'node:assert/strict'
import { createPocketWalletsHandler } from '../api/pocket/wallets/index.ts'
import { isPocketWalletsReadData } from '../src/pocket/lib/pocketSchemas.ts'

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

const readKeys = []
const handler = createPocketWalletsHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readLink: async key => {
    readKeys.push(key)
    if (key.endsWith(':arbitrum') || key.endsWith(':arc')) return null
    const chain = key.endsWith(':solana') ? 'solana' : 'base'
    return {
      privyUserId: 'privy-user-1',
      email: 'ada@example.com',
      chain,
      purpose: 'payment',
      circleWalletId: `${chain}-wallet-id`,
      circleWalletAddress: `${chain}-wallet-address`,
      circleBlockchain: chain === 'solana' ? 'SOL' : 'BASE',
      updatedAt: 1_800_000_000_001,
    }
  },
})

const wrongMethod = await request(handler, 'POST')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const loaded = await request(handler)
assert.equal(loaded.statusCode, 200)
assert.equal(loaded.body.ok, true)
assert.equal(isPocketWalletsReadData(loaded.body), true)
assert.deepEqual(readKeys, [
  'privy-user-1:base',
  'privy-user-1:arbitrum',
  'privy-user-1:arc',
  'privy-user-1:solana',
])
assert.deepEqual(loaded.body.wallets.base, {
  network: 'base',
  wallet: {
    id: 'base-wallet-id',
    address: 'base-wallet-address',
    blockchain: 'BASE',
  },
  updatedAt: 1_800_000_000_001,
})
assert.equal(loaded.body.wallets.arbitrum, undefined)
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('ada@example.com'), false)
assert.equal(serialized.includes('purpose'), false)

const unauthorizedHandler = createPocketWalletsHandler({
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
  readLink: async () => null,
})
const unauthorized = await request(unauthorizedHandler)
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketWalletsHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readLink: async () => { throw Object.assign(new Error('Durable wallet storage unavailable.'), { status: 503 }) },
})
const unavailable = await request(unavailableHandler)
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

console.log('Circle Pocket wallets read adapter smoke tests passed.')

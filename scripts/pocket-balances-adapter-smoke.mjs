import assert from 'node:assert/strict'
import { createPocketBalancesHandler } from '../api/pocket/balances.ts'
import { isPocketBalancesReadData } from '../src/pocket/lib/pocketSchemas.ts'

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
const balanceCalls = []
const handler = createPocketBalancesHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readLink: async key => {
    readKeys.push(key)
    if (key.endsWith(':arbitrum')) return null
    const chain = key.split(':').at(-1)
    return {
      privyUserId: 'privy-user-1',
      email: 'ada@example.com',
      chain,
      purpose: 'payment',
      circleWalletId: `${chain}-wallet-id`,
      circleWalletAddress: `${chain}-wallet-address`,
      circleBlockchain: chain === 'solana' ? 'SOL' : chain.toUpperCase(),
      updatedAt: 1_800_000_000_001,
    }
  },
  readBalance: async (network, address) => {
    balanceCalls.push({ network, address })
    if (network === 'arc') throw new Error('Arc RPC unavailable')
    return network === 'base' ? 2.5 : 3.25
  },
})

const wrongMethod = await request(handler, 'POST')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const loaded = await request(handler)
assert.equal(loaded.statusCode, 200)
assert.equal(loaded.body.ok, true)
assert.equal(isPocketBalancesReadData(loaded.body), true)
assert.deepEqual(readKeys, [
  'privy-user-1:base',
  'privy-user-1:arbitrum',
  'privy-user-1:arc',
  'privy-user-1:solana',
])
assert.deepEqual(balanceCalls, [
  { network: 'base', address: 'base-wallet-address' },
  { network: 'arc', address: 'arc-wallet-address' },
  { network: 'solana', address: 'solana-wallet-address' },
])
assert.deepEqual(loaded.body.rows, [
  { key: 'base', label: 'Base', balance: 2.5, status: 'ok' },
  { key: 'arbitrum', label: 'Arbitrum', balance: 0, status: 'ok' },
  { key: 'arc', label: 'Arc', balance: 0, status: 'error', error: 'Arc balance is temporarily unavailable.' },
  { key: 'solana', label: 'Solana', balance: 3.25, status: 'ok' },
])
assert.equal(loaded.body.total, 5.75)
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('wallet-address'), false)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('ada@example.com'), false)

const testnetBalanceHandler = createPocketBalancesHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readLink: async key => {
    const chain = key.split(':').at(-1)
    return {
      privyUserId: 'privy-user-1',
      chain,
      purpose: 'payment',
      circleWalletId: `${chain}-wallet-id`,
      circleWalletAddress: `${chain}-wallet-address`,
      circleBlockchain: chain === 'solana' ? 'SOL' : chain.toUpperCase(),
      updatedAt: 1_800_000_000_001,
    }
  },
  readBalance: async network => network === 'arc' ? 66 : 1,
})
const testnetBalance = await request(testnetBalanceHandler)
assert.equal(testnetBalance.body.rows.find(row => row.key === 'arc').balance, 66)
assert.equal(testnetBalance.body.total, 3)
assert.equal(isPocketBalancesReadData(testnetBalance.body), true)

const invalidTestnetTotal = structuredClone(testnetBalance.body)
invalidTestnetTotal.total += invalidTestnetTotal.rows.find(row => row.key === 'arc').balance
assert.equal(isPocketBalancesReadData(invalidTestnetTotal), false)

const unauthorizedHandler = createPocketBalancesHandler({
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
  readLink: async () => null,
  readBalance: async () => 0,
})
const unauthorized = await request(unauthorizedHandler)
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketBalancesHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readLink: async () => { throw Object.assign(new Error('Durable wallet storage unavailable.'), { status: 503 }) },
  readBalance: async () => 0,
})
const unavailable = await request(unavailableHandler)
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

console.log('Circle Pocket balances adapter smoke tests passed.')

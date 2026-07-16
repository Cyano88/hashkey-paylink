import assert from 'node:assert/strict'
import { createPocketX402Handler } from '../api/pocket/x402.ts'
import { readPocketX402Snapshot } from '../src/pocket/api/pocketX402Client.ts'
import { pocketX402WalletSlug } from '../src/pocket/lib/pocketX402Identity.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, { method = 'GET', query = {} } = {}) {
  const res = responseRecorder()
  await handler({ method, query, headers: {} }, res)
  return res
}

assert.equal(pocketX402WalletSlug(' Ada@Example.com '), pocketX402WalletSlug('ada@example.com'))
assert.match(pocketX402WalletSlug('ada@example.com'), /^wallet-[a-z0-9]+$/)

const calls = []
const handler = createPocketX402Handler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'Ada@Example.com' }),
  readSnapshot: async input => {
    calls.push(input)
    return {
      found: true,
      walletAddress: '0x1111111111111111111111111111111111111111',
      connected: true,
      network: input.network,
      walletBalance: '12.5',
      walletBalanceChecked: true,
      gatewayBalance: '4',
      gatewayBalanceChecked: true,
      updatedAt: 1_800_000_000_001,
    }
  },
})

const wrongMethod = await request(handler, { method: 'POST' })
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const invalidNetwork = await request(handler, { query: { network: 'polygon' } })
assert.equal(invalidNetwork.statusCode, 400)
assert.equal(invalidNetwork.body.error.code, 'VALIDATION_FAILED')

const loaded = await request(handler, { query: { network: 'arc' } })
assert.equal(loaded.statusCode, 200)
assert.equal(loaded.body.ok, true)
assert.equal(loaded.body.snapshot.network, 'arc')
assert.deepEqual(calls, [{ agentSlug: pocketX402WalletSlug('ada@example.com'), network: 'arc' }])
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('Ada@Example.com'), false)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('agentSlug'), false)

const missingEmailHandler = createPocketX402Handler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: '' }),
  readSnapshot: async () => { throw new Error('must not run') },
})
const missingEmail = await request(missingEmailHandler)
assert.equal(missingEmail.statusCode, 403)
assert.equal(missingEmail.body.error.code, 'FORBIDDEN')

const unavailableHandler = createPocketX402Handler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readSnapshot: async () => { throw Object.assign(new Error('C:\\secret\\circle session raw output'), { status: 503 }) },
})
const unavailable = await request(unavailableHandler)
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(JSON.stringify(unavailable.body).includes('secret'), false)

let fetchedUrl = ''
let fetchedAuthorization = ''
const clientSnapshot = await readPocketX402Snapshot({
  accessToken: 'privy-token',
  network: 'base',
  fetcher: async (url, init) => {
    fetchedUrl = String(url)
    fetchedAuthorization = init.headers.authorization
    return new Response(JSON.stringify({ ok: true, snapshot: {
      found: false,
      connected: false,
      network: 'base',
      walletBalanceChecked: false,
      gatewayBalanceChecked: false,
    } }), { status: 200, headers: { 'content-type': 'application/json' } })
  },
})
assert.equal(fetchedUrl, '/api/pocket/x402?network=base')
assert.equal(fetchedAuthorization, 'Bearer privy-token')
assert.equal(clientSnapshot.found, false)

console.log('Circle Pocket x402 adapter smoke tests passed.')

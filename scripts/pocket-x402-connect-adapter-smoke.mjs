import assert from 'node:assert/strict'
import { createPocketX402ConnectHandler } from '../api/pocket/x402-connect.ts'
import {
  connectPocketX402Wallet,
  PocketX402ConnectionError,
} from '../src/pocket/api/pocketX402Client.ts'
import { pocketX402WalletSlug } from '../src/pocket/lib/pocketX402Identity.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, { method = 'POST', body = {} } = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers: {} }, res)
  return res
}

const calls = []
const handler = createPocketX402ConnectHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'Ada@Example.com' }),
  connect: async input => {
    calls.push(input)
    return input.action === 'init'
      ? { status: 'otp_sent', network: input.network, message: 'OTP sent by Circle.' }
      : { status: 'connected', network: input.network, walletAddress: '0x1111111111111111111111111111111111111111' }
  },
})

const wrongMethod = await request(handler, { method: 'GET' })
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const clientIdentity = await request(handler, { body: { action: 'init', network: 'base', email: 'attacker@example.com' } })
assert.equal(clientIdentity.statusCode, 400)
assert.equal(clientIdentity.body.error.code, 'VALIDATION_FAILED')

const invalidNetwork = await request(handler, { body: { action: 'init', network: 'polygon' } })
assert.equal(invalidNetwork.statusCode, 400)

const initialized = await request(handler, { body: { action: 'init', network: 'base' } })
assert.equal(initialized.statusCode, 200)
assert.deepEqual(initialized.body, { ok: true, status: 'otp_sent', network: 'base', message: 'OTP sent by Circle.' })
assert.deepEqual(calls[0], {
  action: 'init',
  agentSlug: pocketX402WalletSlug('ada@example.com'),
  email: 'ada@example.com',
  network: 'base',
})

const completed = await request(handler, { body: {
  action: 'complete',
  network: 'arc',
  otp: '123456',
  expectedWallet: '0x2222222222222222222222222222222222222222',
} })
assert.equal(completed.statusCode, 200)
assert.equal(completed.body.status, 'connected')
assert.deepEqual(calls[1], {
  action: 'complete',
  agentSlug: pocketX402WalletSlug('ada@example.com'),
  email: 'ada@example.com',
  network: 'arc',
  otp: '123456',
  expectedWallet: '0x2222222222222222222222222222222222222222',
})
assert.equal(JSON.stringify(completed.body).includes('ada@example.com'), false)
assert.equal(JSON.stringify(completed.body).includes('agentSlug'), false)

const choicesHandler = createPocketX402ConnectHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  connect: async () => { throw Object.assign(new Error('Circle found multiple wallets.'), {
    status: 409,
    code: 'multiple_agent_wallets',
    walletChoices: [
      { address: '0x3333333333333333333333333333333333333333', balance: '4.5' },
      { address: 'not-an-address', balanceError: 'C:\\secret\\raw provider output' },
    ],
  }) },
})
const choices = await request(choicesHandler, { body: { action: 'complete', network: 'base', otp: '123456' } })
assert.equal(choices.statusCode, 409)
assert.equal(choices.body.error.code, 'VERSION_CONFLICT')
assert.equal(choices.body.reason, 'multiple_agent_wallets')
assert.deepEqual(choices.body.walletChoices, [{ address: '0x3333333333333333333333333333333333333333', balance: '4.5' }])
assert.equal(JSON.stringify(choices.body).includes('secret'), false)

const unavailableHandler = createPocketX402ConnectHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  connect: async () => { throw Object.assign(new Error('C:\\secret\\circle raw output'), { status: 503, code: 'circle_provider_unavailable' }) },
})
const unavailable = await request(unavailableHandler, { body: { action: 'init', network: 'base' } })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(JSON.stringify(unavailable.body).includes('secret'), false)

let fetchInit
const clientResult = await connectPocketX402Wallet({
  accessToken: 'privy-token',
  action: 'complete',
  network: 'base',
  otp: '654321',
  fetcher: async (_url, init) => {
    fetchInit = init
    return new Response(JSON.stringify({
      ok: true,
      status: 'connected',
      network: 'base',
      walletAddress: '0x4444444444444444444444444444444444444444',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  },
})
assert.equal(clientResult.status, 'connected')
assert.equal(fetchInit.headers.authorization, 'Bearer privy-token')
assert.equal(fetchInit.headers['idempotency-key'], undefined)
assert.deepEqual(JSON.parse(fetchInit.body), { action: 'complete', network: 'base', otp: '654321' })

await assert.rejects(
  connectPocketX402Wallet({
    accessToken: 'privy-token',
    action: 'complete',
    network: 'base',
    otp: '123456',
    fetcher: async () => new Response(JSON.stringify({
      ok: false,
      error: { code: 'VERSION_CONFLICT', message: 'Choose a wallet.', retryable: false },
      reason: 'multiple_agent_wallets',
      walletChoices: [{ address: '0x5555555555555555555555555555555555555555', balance: '2' }],
    }), { status: 409, headers: { 'content-type': 'application/json' } }),
  }),
  error => error instanceof PocketX402ConnectionError
    && error.reason === 'multiple_agent_wallets'
    && error.walletChoices.length === 1,
)

console.log('Circle Pocket x402 connection adapter smoke tests passed.')

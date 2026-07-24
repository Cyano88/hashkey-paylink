import assert from 'node:assert/strict'
import { createPocketX402ActivateHandler } from '../api/pocket/x402-activate.ts'
import {
  activatePocketX402Gateway,
  PocketX402ActivationError,
} from '../src/pocket/api/pocketX402Client.ts'
import { pocketX402WalletSlug } from '../src/pocket/lib/pocketX402Identity.ts'
import {
  classifyCircleGatewayDepositFailure,
  circleCliInvocation,
  gatewayActivationTarget,
  gatewayBalanceReached,
  parseCircleGatewayBalanceResponse,
} from '../api/agent-wallet.ts'

assert.equal(gatewayActivationTarget('0', '0.5'), '0.5')
assert.equal(gatewayActivationTarget('0.5', '0.5'), '1')
assert.equal(gatewayActivationTarget('1.250001', '0.5'), '1.750001')
assert.equal(gatewayActivationTarget('invalid', '0.5'), null)
assert.equal(gatewayBalanceReached('0.5', '1'), false)
assert.equal(gatewayBalanceReached('1', '1'), true)
assert.equal(gatewayBalanceReached('1.000001', '1'), true)
assert.equal(classifyCircleGatewayDepositFailure(Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })), 'provider_timeout')
assert.equal(classifyCircleGatewayDepositFailure(new Error('insufficient balance')), 'insufficient_wallet_balance')
assert.equal(classifyCircleGatewayDepositFailure(new Error('unsupported chain ARC-TESTNET')), 'unsupported_chain')
assert.equal(classifyCircleGatewayDepositFailure(Object.assign(new Error('spawn circle ENOENT'), { code: 'ENOENT' })), 'cli_unavailable')
assert.equal(classifyCircleGatewayDepositFailure(new Error('HTTP 400 bad request')), 'provider_rejected')
assert.equal(classifyCircleGatewayDepositFailure(new Error('Circle CLI requires Node.js version 20.18.2')), 'runtime_incompatible')
assert.equal(classifyCircleGatewayDepositFailure(new Error('Accept the Circle CLI terms before continuing')), 'terms_not_accepted')
assert.equal(classifyCircleGatewayDepositFailure(new Error('TypeError: fetch failed ECONNRESET')), 'provider_network_error')

const cliInvocation = circleCliInvocation(['gateway', 'balance'])
assert.equal(cliInvocation.executable, process.execPath)
assert.match(cliInvocation.args[0], /@circle-fin[\\/]cli[\\/]dist[\\/]index\.js$/)
assert.deepEqual(cliInvocation.args.slice(1), ['gateway', 'balance'])
assert.equal(parseCircleGatewayBalanceResponse({
  token: 'USDC',
  balances: [{ depositor: '0x1111111111111111111111111111111111111111', balance: '0.500001' }],
}, '0x1111111111111111111111111111111111111111'), '0.500001')
assert.equal(parseCircleGatewayBalanceResponse({
  token: 'USDC',
  balances: [{ depositor: '0x2222222222222222222222222222222222222222', balance: '1' }],
}, '0x1111111111111111111111111111111111111111'), undefined)

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, { method = 'POST', body = {}, key = 'pocket:x402-activate:test-request-0001' } = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers: { 'idempotency-key': key } }, res)
  return res
}

function actionRecord(overrides = {}) {
  return {
    id: 'action-request-1',
    ownerId: 'privy-user-1',
    idempotencyKey: 'pocket:x402-activate:test-request-0001',
    action: 'x402.gateway.activate',
    status: 'started',
    metadata: { network: 'base', amount: '0.5' },
    createdAt: 1_800_000_000_001,
    updatedAt: 1_800_000_000_001,
    ...overrides,
  }
}

const claims = []
const activations = []
const records = []
const handler = createPocketX402ActivateHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'Ada@Example.com' }),
  claim: async input => {
    claims.push(input)
    return { claimed: true, record: actionRecord({ idempotencyKey: input.idempotencyKey, metadata: input.metadata }) }
  },
  activate: async input => {
    activations.push(input)
    return {
      status: 'available',
      amount: input.amount,
      network: input.network,
      walletAddress: '0x1111111111111111111111111111111111111111',
      gatewayBalance: '0.5',
      startingGatewayBalance: '0',
      targetGatewayBalance: '0.5',
    }
  },
  record: async input => {
    records.push(input)
    return actionRecord({ status: input.status, metadata: input.metadata })
  },
  requestId: () => 'validation-request-1',
})

const missingKey = await request(handler, { body: { network: 'base', amount: '0.5' }, key: '' })
assert.equal(missingKey.statusCode, 400)
assert.equal(missingKey.body.error.field, 'idempotencyKey')

for (const amount of ['0.499999', '5.000001', '6', '0.5000001']) {
  const invalid = await request(handler, { body: { network: 'base', amount } })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.body.error.field, 'activation')
}

const activated = await request(handler, { body: { network: 'base', amount: '0.5' } })
assert.equal(activated.statusCode, 200)
assert.equal(activated.body.status, 'completed')
assert.deepEqual(activated.body.data, {
  activationStatus: 'available',
  amount: '0.5',
  network: 'base',
  walletAddress: '0x1111111111111111111111111111111111111111',
  gatewayBalance: '0.5',
  startingGatewayBalance: '0',
  targetGatewayBalance: '0.5',
  replayed: false,
})
assert.deepEqual(claims, [{
  ownerId: 'privy-user-1',
  idempotencyKey: 'pocket:x402-activate:test-request-0001',
  action: 'x402.gateway.activate',
  metadata: { network: 'base', amount: '0.5' },
}])
assert.deepEqual(activations, [{
  agentSlug: pocketX402WalletSlug('ada@example.com'),
  email: 'ada@example.com',
  network: 'base',
  amount: '0.5',
}])
assert.equal(records[0].status, 'completed')
assert.equal(JSON.stringify(activated.body).includes('ada@example.com'), false)
assert.equal(JSON.stringify(activated.body).includes('agentSlug'), false)

let replayActivationCalls = 0
const replayHandler = createPocketX402ActivateHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  claim: async () => ({ claimed: false, record: actionRecord({
    status: 'completed',
    metadata: {
      network: 'base',
      amount: '0.5',
      activationStatus: 'available',
      walletAddress: '0x2222222222222222222222222222222222222222',
      gatewayBalance: '1.25',
    },
  }) }),
  activate: async () => { replayActivationCalls += 1; throw new Error('must not run') },
  record: async () => { throw new Error('must not run') },
})
const replay = await request(replayHandler, { body: { network: 'base', amount: '0.5' } })
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.data.replayed, true)
assert.equal(replayActivationCalls, 0)

const inProgressHandler = createPocketX402ActivateHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  claim: async () => ({ claimed: false, record: actionRecord() }),
  activate: async () => { throw new Error('must not run') },
  record: async () => { throw new Error('must not run') },
})
const inProgress = await request(inProgressHandler, { body: { network: 'base', amount: '0.5' } })
assert.equal(inProgress.statusCode, 202)
assert.equal(inProgress.body.status, 'processing')
assert.equal('data' in inProgress.body, false)

const conflict = await request(replayHandler, { body: { network: 'arc', amount: '0.5' } })
assert.equal(conflict.statusCode, 409)
assert.equal(conflict.body.error.code, 'DUPLICATE_REQUEST')

const providerRecords = []
const providerHandler = createPocketX402ActivateHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  claim: async input => ({ claimed: true, record: actionRecord({ metadata: input.metadata }) }),
  activate: async () => { throw Object.assign(new Error('C:\\secret\\raw Circle output'), { status: 503, code: 'circle_provider_unavailable' }) },
  record: async input => { providerRecords.push(input); return actionRecord({ status: input.status, metadata: input.metadata }) },
})
const providerFailure = await request(providerHandler, { body: { network: 'arc', amount: '1' } })
assert.equal(providerFailure.statusCode, 503)
assert.equal(providerFailure.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(JSON.stringify(providerFailure.body).includes('secret'), false)
assert.equal(providerRecords[0].status, 'failed')

const ownershipHandler = createPocketX402ActivateHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  claim: async input => ({ claimed: true, record: actionRecord({ metadata: input.metadata }) }),
  activate: async () => { throw Object.assign(new Error('This Circle email does not control the selected agent wallet. Reconnect the wallet.'), { status: 409, code: 'wallet_ownership_mismatch' }) },
  record: async input => actionRecord({ status: input.status, metadata: input.metadata }),
})
const ownershipFailure = await request(ownershipHandler, {
  body: { network: 'arc', amount: '0.5' },
  key: 'pocket:x402-activate:ownership-request-0001',
})
assert.equal(ownershipFailure.statusCode, 409)
assert.equal(ownershipFailure.body.error.code, 'VERSION_CONFLICT')
assert.equal(ownershipFailure.body.reason, 'wallet_ownership_mismatch')

let fetchCall
const clientResult = await activatePocketX402Gateway({
  accessToken: 'privy-token',
  network: 'arc',
  amount: '1',
  idempotencyKey: 'pocket:x402-activate:client-request-0001',
  fetcher: async (url, init) => {
    fetchCall = { url, init }
    return new Response(JSON.stringify({
      ok: true,
      requestId: 'action-request-2',
      idempotencyKey: 'pocket:x402-activate:client-request-0001',
      status: 'processing',
      data: {
        activationStatus: 'pending',
        amount: '1',
        network: 'arc',
        walletAddress: '0x3333333333333333333333333333333333333333',
        gatewayBalance: '0',
        replayed: false,
      },
    }), { status: 202, headers: { 'content-type': 'application/json' } })
  },
})
assert.equal(fetchCall.url, '/api/pocket/x402/activate')
assert.equal(fetchCall.init.headers.authorization, 'Bearer privy-token')
assert.equal(fetchCall.init.headers['idempotency-key'], 'pocket:x402-activate:client-request-0001')
assert.deepEqual(JSON.parse(fetchCall.init.body), { network: 'arc', amount: '1' })
assert.equal(clientResult.data.activationStatus, 'pending')

await assert.rejects(
  activatePocketX402Gateway({
    accessToken: 'privy-token',
    network: 'arc',
    amount: '0.5',
    idempotencyKey: 'pocket:x402-activate:ownership-client-0001',
    fetcher: async () => new Response(JSON.stringify({
      ok: false,
      status: 'failed',
      reason: 'wallet_ownership_mismatch',
      error: {
        code: 'VERSION_CONFLICT',
        message: 'This Circle email does not control the selected agent wallet. Reconnect the wallet.',
        retryable: false,
      },
    }), { status: 409, headers: { 'content-type': 'application/json' } }),
  }),
  error => error instanceof PocketX402ActivationError
    && error.code === 'VERSION_CONFLICT'
    && error.reason === 'wallet_ownership_mismatch'
    && error.retryable === false,
)

console.log('Circle Pocket x402 activation adapter smoke tests passed.')

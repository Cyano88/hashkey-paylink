import assert from 'node:assert/strict'
import {
  arcAgreementOperatorPreflightConfig,
  runArcAgreementOperatorPreflight,
} from './lib/arc-agreement-operator-preflight.mjs'

const walletId = '9d1a0e42-8c5f-4a77-bc1c-592236e53dde'
const requestId = '64dfb137-b434-47b7-a72e-d83eea43b430'
const operatorAddress = '0x1111111111111111111111111111111111111111'
const apiKey = 'TEST_API_KEY_NOT_A_REAL_SECRET_123456'

function validEnvironment(overrides = {}) {
  return {
    CIRCLE_TEST_API_KEY: apiKey,
    ARC_AGREEMENT_OPERATOR_WALLET_ID: walletId,
    ARC_AGREEMENT_OPERATOR_ADDRESS: operatorAddress,
    ARC_AGREEMENT_OPERATOR_PREFLIGHT_TIMEOUT_MS: '5000',
    ...overrides,
  }
}

function validCircleResponse(overrides = {}) {
  return {
    data: {
      wallet: {
        id: walletId,
        address: operatorAddress,
        blockchain: 'ARC-TESTNET',
        custodyType: 'DEVELOPER',
        state: 'LIVE',
        accountType: 'SCA',
        ...overrides,
      },
    },
  }
}

let fetchCalls = 0
const fetchImpl = async (url, init) => {
  fetchCalls += 1
  assert.equal(url, `https://api.circle.com/v1/w3s/wallets/${walletId}`)
  assert.equal(init.method, 'GET')
  assert.equal(init.redirect, 'error')
  assert.equal(init.headers.authorization, `Bearer ${apiKey}`)
  assert.equal(init.headers['x-request-id'], requestId)
  assert.ok(init.signal instanceof AbortSignal)
  return new Response(JSON.stringify(validCircleResponse()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const result = await runArcAgreementOperatorPreflight({
  env: validEnvironment(),
  fetchImpl,
  requestId,
})
assert.equal(fetchCalls, 1)
assert.deepEqual(result, {
  ok: true,
  walletId: '9d1a0e42...3dde',
  operatorAddress,
  network: 'ARC-TESTNET',
  custodyType: 'DEVELOPER',
  state: 'LIVE',
  accountType: 'SCA',
})
const serialized = JSON.stringify(result)
assert.equal(serialized.includes(apiKey), false)
assert.equal(serialized.includes('authorization'), false)
assert.equal(serialized.includes(walletId), false)

let blockedFetchCalls = 0
const blockedFetch = async () => {
  blockedFetchCalls += 1
  throw new Error('The network must not be reached.')
}

await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ CIRCLE_TEST_API_KEY: '', CIRCLE_API_KEY: apiKey }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /CIRCLE_TEST_API_KEY is required/,
)
await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ ARC_AGREEMENT_OPERATOR_WALLET_ID: '' }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /ARC_AGREEMENT_OPERATOR_WALLET_ID is required/,
)
await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ ARC_AGREEMENT_OPERATOR_ADDRESS: '' }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /ARC_AGREEMENT_OPERATOR_ADDRESS is required/,
)
await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ ARC_AGREEMENT_OPERATOR_WALLET_ID: 'not-a-wallet-id' }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /ARC_AGREEMENT_OPERATOR_WALLET_ID is invalid/,
)
await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ ARC_AGREEMENT_OPERATOR_ADDRESS: 'not-an-address' }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /ARC_AGREEMENT_OPERATOR_ADDRESS is invalid/,
)
await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment({ ARC_AGREEMENT_OPERATOR_PREFLIGHT_TIMEOUT_MS: '999' }),
    fetchImpl: blockedFetch,
    requestId,
  }),
  /must be an integer from 1000 to 30000/,
)
assert.equal(blockedFetchCalls, 0)

await assert.rejects(
  () => runArcAgreementOperatorPreflight({
    env: validEnvironment(),
    fetchImpl: async () => new Response(JSON.stringify(validCircleResponse({
      address: '0x2222222222222222222222222222222222222222',
    })), { status: 200 }),
    requestId,
  }),
  /does not match the immutable agreement operator/,
)

assert.deepEqual(arcAgreementOperatorPreflightConfig(validEnvironment()), {
  apiKey,
  walletId,
  expectedOperator: operatorAddress,
  timeoutMs: 5000,
})

console.log('Arc Agreement operator preflight smoke checks passed.')

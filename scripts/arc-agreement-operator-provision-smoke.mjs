import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  provisionArcAgreementOperator,
  readArcAgreementOperatorProvisionConfig,
} from './lib/arc-agreement-operator-provision.mjs'

const apiKey = 'TEST_API_KEY:test-id:test-secret'
const entitySecret = '11'.repeat(32)
const walletSetIdempotencyKey = '0f4f3d9a-fb4c-4f4e-8f0d-79b5f83a2d75'
const walletIdempotencyKey = 'f8cf7713-b53c-4f40-a35f-40c01f6c378d'
const walletSetId = 'f2312f74-56d9-4c23-aad8-a6a5609058f8'
const walletId = 'ba3fb2a4-228f-4997-95c7-20a6bd346dae'
const walletAddress = '0x1111111111111111111111111111111111111111'
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })

function validEnvironment(overrides = {}) {
  return {
    CIRCLE_TEST_API_KEY: apiKey,
    CIRCLE_ENTITY_SECRET: entitySecret,
    ARC_AGREEMENT_OPERATOR_WALLET_SET_IDEMPOTENCY_KEY: walletSetIdempotencyKey,
    ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY: walletIdempotencyKey,
    ...overrides,
  }
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function successfulFetch(calls, walletOverrides = {}) {
  return async (url, init = {}) => {
    calls.push({ url, init })
    if (url.endsWith('/v1/w3s/config/entity/publicKey')) {
      return jsonResponse({ data: { publicKey: publicKeyPem } })
    }
    if (url.endsWith('/v1/w3s/developer/walletSets')) {
      return jsonResponse({ data: { walletSet: { id: walletSetId } } }, 201)
    }
    if (url.endsWith('/v1/w3s/developer/wallets')) {
      return jsonResponse({ data: { wallets: [{
        id: walletId,
        address: walletAddress,
        blockchain: 'ARC-TESTNET',
        custodyType: 'DEVELOPER',
        state: 'LIVE',
        walletSetId,
        accountType: 'EOA',
        ...walletOverrides,
      }] } }, 201)
    }
    throw new Error(`Unexpected URL: ${url}`)
  }
}

assert.throws(
  () => readArcAgreementOperatorProvisionConfig(validEnvironment({
    CIRCLE_TEST_API_KEY: 'LIVE_API_KEY:live-id:live-secret',
  })),
  /TEST_API_KEY/,
)
assert.throws(
  () => readArcAgreementOperatorProvisionConfig(validEnvironment({
    ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY: walletSetIdempotencyKey,
  })),
  /must be different/,
)

let calls = []
await assert.rejects(
  provisionArcAgreementOperator({
    env: validEnvironment(),
    confirmed: false,
    fetchImpl: successfulFetch(calls),
  }),
  /confirm-create-arc-testnet-operator/,
)
assert.equal(calls.length, 0)

calls = []
const wallet = await provisionArcAgreementOperator({
  env: validEnvironment(),
  confirmed: true,
  fetchImpl: successfulFetch(calls),
  requestId: () => randomUUID(),
})
assert.deepEqual(wallet, {
  walletSetId,
  walletId,
  address: walletAddress,
  blockchain: 'ARC-TESTNET',
  custodyType: 'DEVELOPER',
  state: 'LIVE',
  accountType: 'EOA',
})
assert.equal(calls.length, 4)
assert.deepEqual(calls.map(call => [new URL(call.url).pathname, call.init.method ?? 'GET']), [
  ['/v1/w3s/config/entity/publicKey', 'GET'],
  ['/v1/w3s/developer/walletSets', 'POST'],
  ['/v1/w3s/config/entity/publicKey', 'GET'],
  ['/v1/w3s/developer/wallets', 'POST'],
])
assert.ok(calls.every(call => call.init.headers.Authorization === `Bearer ${apiKey}`))

const walletSetBody = JSON.parse(calls[1].init.body)
const walletBody = JSON.parse(calls[3].init.body)
assert.equal(walletSetBody.name, 'Hash PayLink Arc Agreements')
assert.equal(walletSetBody.idempotencyKey, walletSetIdempotencyKey)
assert.deepEqual(walletBody.blockchains, ['ARC-TESTNET'])
assert.equal(walletBody.walletSetId, walletSetId)
assert.equal(walletBody.accountType, 'EOA')
assert.equal(walletBody.count, 1)
assert.deepEqual(walletBody.metadata, [{
  name: 'Hash PayLink Arc Agreements Operator',
  refId: 'hashpaylink-arc-agreements-operator',
}])
assert.notEqual(walletSetBody.entitySecretCiphertext, walletBody.entitySecretCiphertext)
assert.doesNotMatch(calls[1].init.body, new RegExp(entitySecret, 'i'))
assert.doesNotMatch(calls[3].init.body, new RegExp(entitySecret, 'i'))

await assert.rejects(
  provisionArcAgreementOperator({
    env: validEnvironment(),
    confirmed: true,
    fetchImpl: successfulFetch([], { blockchain: 'BASE' }),
  }),
  /ARC-TESTNET/,
)

const librarySource = readFileSync(new URL('./lib/arc-agreement-operator-provision.mjs', import.meta.url), 'utf8')
const commandSource = readFileSync(new URL('./arc-agreement-operator-provision.mjs', import.meta.url), 'utf8')
assert.doesNotMatch(librarySource, /POCKET_|CIRCLE_API_KEY\b|CIRCLE_CLI/)
assert.match(librarySource, /CIRCLE_TEST_API_KEY/)
assert.match(librarySource, /ARC-TESTNET/)
assert.match(commandSource, /--confirm-create-arc-testnet-operator/)

console.log('Arc Agreement operator provisioning smoke checks passed.')

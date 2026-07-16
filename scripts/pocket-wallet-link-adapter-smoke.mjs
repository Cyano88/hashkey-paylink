import assert from 'node:assert/strict'
import {
  applyCircleLinkDelete,
  applyCircleLinkSet,
} from '../api/privy-circle-link.ts'
import { createPocketWalletLinkHandler } from '../api/pocket/wallets/link.ts'
import { isPocketMutationResult } from '../src/pocket/lib/pocketSchemas.ts'

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

async function request(handler, method, body = undefined, headers = {}) {
  const res = responseRecorder()
  await handler({ method, headers, body }, res)
  return res
}

const store = { links: {} }
let timestamp = 1_800_000_000_000
const verifiedWalletInputs = []
const dependencies = {
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  verifyWallet: async input => { verifiedWalletInputs.push(input) },
  setLink: async (key, candidate, expectedUpdatedAt) => (
    applyCircleLinkSet(store, key, candidate, expectedUpdatedAt, () => ++timestamp)
  ),
  deleteLink: async (key, expectedUpdatedAt) => applyCircleLinkDelete(store, key, expectedUpdatedAt),
  requestId: () => 'wallet-link-request-test',
}
const handler = createPocketWalletLinkHandler(dependencies)
const firstKey = 'pocket:wallet-link:test-request-00000001'
const secondKey = 'pocket:wallet-link:test-request-00000002'
const walletOne = {
  id: 'circle-wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  blockchain: 'base',
}
const walletTwo = {
  id: 'circle-wallet-2',
  address: '0x2222222222222222222222222222222222222222',
  blockchain: 'BASE',
}

const wrongMethod = await request(handler, 'GET')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')
assert.equal(isPocketMutationResult(wrongMethod.body), true)

const missingKey = await request(handler, 'POST', {
  action: 'unlink', network: 'base',
})
assert.equal(missingKey.statusCode, 400)
assert.equal(missingKey.body.error.field, 'idempotencyKey')
assert.equal(isPocketMutationResult(missingKey.body), true)

const invalidBody = await request(handler, 'POST', {
  action: 'link', network: 'unsupported', circleUserToken: 'circle-token', wallet: walletOne,
}, { 'idempotency-key': firstKey })
assert.equal(invalidBody.statusCode, 400)
assert.equal(invalidBody.body.error.field, 'walletLink')

const linkBody = {
  action: 'link',
  network: 'base',
  circleUserToken: 'circle-user-token-secret',
  wallet: walletOne,
}
const firstLink = await request(handler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(firstLink.statusCode, 200)
assert.equal(isPocketMutationResult(firstLink.body), true)
assert.equal(firstLink.body.data.unchanged, false)
assert.equal(firstLink.body.data.link.network, 'base')
assert.equal(firstLink.body.data.link.wallet.blockchain, 'BASE')
assert.deepEqual(verifiedWalletInputs[0], {
  userToken: 'circle-user-token-secret',
  chain: 'base',
  wallet: { ...walletOne, blockchain: 'BASE' },
})
const serializedFirstLink = JSON.stringify(firstLink.body)
assert.equal(serializedFirstLink.includes('privy-user-1'), false)
assert.equal(serializedFirstLink.includes('ada@example.com'), false)
assert.equal(serializedFirstLink.includes('circle-user-token-secret'), false)

const identicalRetry = await request(handler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(identicalRetry.statusCode, 200)
assert.equal(identicalRetry.body.data.unchanged, true)
assert.equal(identicalRetry.body.data.link.updatedAt, firstLink.body.data.link.updatedAt)

const replacementWithoutVersion = await request(handler, 'POST', {
  ...linkBody, wallet: walletTwo,
}, { 'idempotency-key': secondKey })
assert.equal(replacementWithoutVersion.statusCode, 409)
assert.equal(replacementWithoutVersion.body.error.code, 'VERSION_CONFLICT')

const replacement = await request(handler, 'POST', {
  ...linkBody,
  wallet: walletTwo,
  expectedUpdatedAt: firstLink.body.data.link.updatedAt,
}, { 'idempotency-key': secondKey })
assert.equal(replacement.statusCode, 200)
assert.equal(replacement.body.data.unchanged, false)
assert.equal(replacement.body.data.link.wallet.id, 'circle-wallet-2')

const staleUnlink = await request(handler, 'POST', {
  action: 'unlink', network: 'base', expectedUpdatedAt: firstLink.body.data.link.updatedAt,
}, { 'idempotency-key': 'pocket:wallet-unlink:test-request-00000001' })
assert.equal(staleUnlink.statusCode, 409)

const unlink = await request(handler, 'POST', {
  action: 'unlink', network: 'base', expectedUpdatedAt: replacement.body.data.link.updatedAt,
}, { 'idempotency-key': 'pocket:wallet-unlink:test-request-00000002' })
assert.equal(unlink.statusCode, 200)
assert.deepEqual(unlink.body.data, { link: null, unchanged: false })

const repeatedUnlink = await request(handler, 'POST', {
  action: 'unlink', network: 'base', expectedUpdatedAt: replacement.body.data.link.updatedAt,
}, { 'idempotency-key': 'pocket:wallet-unlink:test-request-00000002' })
assert.equal(repeatedUnlink.statusCode, 200)
assert.deepEqual(repeatedUnlink.body.data, { link: null, unchanged: true })

const unauthorizedHandler = createPocketWalletLinkHandler({
  ...dependencies,
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
})
const unauthorized = await request(unauthorizedHandler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const forbiddenHandler = createPocketWalletLinkHandler({
  ...dependencies,
  verifyWallet: async () => { throw Object.assign(new Error('Circle wallet ownership could not be verified.'), { status: 403 }) },
})
const forbidden = await request(forbiddenHandler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(forbidden.statusCode, 403)
assert.equal(forbidden.body.error.code, 'FORBIDDEN')

const invalidCircleSessionHandler = createPocketWalletLinkHandler({
  ...dependencies,
  verifyWallet: async () => { throw Object.assign(new Error('Circle rejected its user token.'), { status: 401 }) },
})
const invalidCircleSession = await request(invalidCircleSessionHandler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(invalidCircleSession.statusCode, 403)
assert.equal(invalidCircleSession.body.error.code, 'FORBIDDEN')
assert.equal(invalidCircleSession.body.error.message, 'Circle wallet session could not verify this wallet.')

const unavailableHandler = createPocketWalletLinkHandler({
  ...dependencies,
  verifyWallet: async () => { throw new Error('network failed') },
})
const unavailable = await request(unavailableHandler, 'POST', linkBody, { 'idempotency-key': firstKey })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

console.log('Circle Pocket wallet-link adapter smoke tests passed.')

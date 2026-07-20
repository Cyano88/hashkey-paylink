import assert from 'node:assert/strict'
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import {
  createCircleDeveloperTreasuryClient,
  encryptCircleEntitySecret,
  readCircleTreasuryConfig,
} from '../api/circle-developer-treasury.ts'

const walletSetId = '38f57bc0-57f0-4f4d-afb8-48d7bb40a30c'
const walletId = '54f095b9-17bc-4189-b4a1-0513e956d739'
const walletSetIdempotencyKey = '980240be-d888-4d75-ad86-88531d9a36e7'
const walletIdempotencyKey = '3c85923c-f25e-41f9-bd98-e76207246608'
const address = '0x1111111111111111111111111111111111111111'
const entitySecret = 'ab'.repeat(32)
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const ciphertext = encryptCircleEntitySecret(entitySecret, publicKeyPem)
const decrypted = privateDecrypt({
  key: privateKey,
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256',
}, Buffer.from(ciphertext, 'base64'))
assert.equal(decrypted.toString('hex'), entitySecret)

const config = readCircleTreasuryConfig({
  CIRCLE_BASE_URL: 'https://api.circle.com',
  CIRCLE_API_KEY: 'TEST_API_KEY',
  CIRCLE_ENTITY_SECRET: entitySecret,
  POCKET_BILLS_TREASURY_WALLET_SET_ID: walletSetId,
  POCKET_BILLS_TREASURY_WALLET_ID: walletId,
  POCKET_BILLS_TREASURY_ADDRESS: address,
  POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY: walletSetIdempotencyKey,
  POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY: walletIdempotencyKey,
})
assert.equal(config.setupReady, true)
assert.equal(config.verificationReady, true)

const requests = []
const wallet = {
  id: walletId,
  address,
  blockchain: 'BASE',
  state: 'LIVE',
  walletSetId,
  accountType: 'SCA',
  name: 'Hash PayLink Bills Treasury',
}
const fetchImpl = async (url, init = {}) => {
  requests.push({ url: String(url), init })
  if (String(url).endsWith('/v1/w3s/config/entity/publicKey')) {
    return new Response(JSON.stringify({ data: { publicKey: publicKeyPem } }), { status: 200 })
  }
  if (String(url).endsWith('/v1/w3s/developer/walletSets')) {
    return new Response(JSON.stringify({ data: { walletSet: { id: walletSetId } } }), { status: 201 })
  }
  if (String(url).endsWith('/v1/w3s/developer/wallets')) {
    return new Response(JSON.stringify({ data: { wallets: [wallet] } }), { status: 201 })
  }
  if (String(url).endsWith(`/v1/w3s/wallets/${walletId}`)) {
    return new Response(JSON.stringify({ data: { wallet } }), { status: 200 })
  }
  return new Response(JSON.stringify({ code: 404, message: 'Not found' }), { status: 404 })
}

const client = createCircleDeveloperTreasuryClient({
  config,
  fetchImpl,
  requestId: () => '4f5ab1b4-e617-4eba-81dc-6818dbb09901',
})
assert.deepEqual(await client.createWalletSet(), { id: walletSetId })
assert.equal((await client.createWallet(walletSetId)).accountType, 'SCA')
assert.equal((await client.verifyConfiguredWallet()).address, address)

const mutationBodies = requests
  .filter(request => request.init.method === 'POST')
  .map(request => JSON.parse(String(request.init.body)))
assert.equal(mutationBodies[0].idempotencyKey, walletSetIdempotencyKey)
assert.equal(mutationBodies[1].accountType, 'SCA')
assert.deepEqual(mutationBodies[1].blockchains, ['BASE'])
assert.notEqual(mutationBodies[0].entitySecretCiphertext, mutationBodies[1].entitySecretCiphertext)
assert.equal(requests.every(request => request.init.headers.Authorization === 'Bearer TEST_API_KEY'), true)

const badHost = readCircleTreasuryConfig({
  ...process.env,
  CIRCLE_BASE_URL: 'https://example.com',
  CIRCLE_API_KEY: 'x',
  CIRCLE_ENTITY_SECRET: entitySecret,
  POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY: walletSetIdempotencyKey,
  POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY: walletIdempotencyKey,
})
assert.equal(badHost.credentialsReady, false)

console.log('Circle developer-controlled treasury smoke checks passed.')

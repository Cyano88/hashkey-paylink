import { randomUUID } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import { encryptCircleEntitySecret } from '../../api/circle-developer-treasury.ts'

const CIRCLE_API_BASE = 'https://api.circle.com'
const ARC_BLOCKCHAIN = 'ARC-TESTNET'
const TEST_API_KEY = /^TEST_API_KEY:[^:\s]+:[^:\s]+$/
const ENTITY_SECRET = /^[0-9a-f]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function required(value, label) {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) throw new Error(`${label} is required.`)
  return cleaned
}

export function readArcAgreementOperatorProvisionConfig(env = process.env) {
  const apiKey = required(env.CIRCLE_TEST_API_KEY, 'CIRCLE_TEST_API_KEY')
  if (!TEST_API_KEY.test(apiKey)) {
    throw new Error('CIRCLE_TEST_API_KEY must be a complete Circle TEST_API_KEY value.')
  }
  const entitySecret = required(env.CIRCLE_ENTITY_SECRET, 'CIRCLE_ENTITY_SECRET')
  if (!ENTITY_SECRET.test(entitySecret)) {
    throw new Error('CIRCLE_ENTITY_SECRET must be the registered 32-byte hexadecimal entity secret.')
  }
  const walletSetIdempotencyKey = required(
    env.ARC_AGREEMENT_OPERATOR_WALLET_SET_IDEMPOTENCY_KEY,
    'ARC_AGREEMENT_OPERATOR_WALLET_SET_IDEMPOTENCY_KEY',
  )
  const walletIdempotencyKey = required(
    env.ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY,
    'ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY',
  )
  if (!UUID_V4.test(walletSetIdempotencyKey)) {
    throw new Error('ARC_AGREEMENT_OPERATOR_WALLET_SET_IDEMPOTENCY_KEY must be a UUID v4.')
  }
  if (!UUID_V4.test(walletIdempotencyKey)) {
    throw new Error('ARC_AGREEMENT_OPERATOR_WALLET_IDEMPOTENCY_KEY must be a UUID v4.')
  }
  if (walletSetIdempotencyKey.toLowerCase() === walletIdempotencyKey.toLowerCase()) {
    throw new Error('Arc operator wallet-set and wallet idempotency keys must be different.')
  }
  return Object.freeze({ apiKey, entitySecret, walletSetIdempotencyKey, walletIdempotencyKey })
}

function verifiedWallet(value, expectedWalletSetId) {
  if (!value || typeof value !== 'object') throw new Error('Circle returned an invalid Arc operator wallet.')
  const id = String(value.id ?? '').trim()
  const address = String(value.address ?? '').trim()
  const walletSetId = String(value.walletSetId ?? '').trim()
  if (!UUID.test(id) || !isAddress(address) || walletSetId !== expectedWalletSetId) {
    throw new Error('Circle returned an incomplete or mismatched Arc operator wallet.')
  }
  if (value.blockchain !== ARC_BLOCKCHAIN) throw new Error('Circle did not create the operator wallet on ARC-TESTNET.')
  if (value.custodyType !== 'DEVELOPER' || value.state !== 'LIVE') {
    throw new Error('Circle did not return a live developer-controlled operator wallet.')
  }
  if (value.accountType !== 'EOA') throw new Error('Circle did not create the approved EOA operator wallet.')
  return Object.freeze({
    walletSetId,
    walletId: id,
    address: getAddress(address),
    blockchain: ARC_BLOCKCHAIN,
    custodyType: 'DEVELOPER',
    state: 'LIVE',
    accountType: 'EOA',
  })
}

export async function provisionArcAgreementOperator(options = {}) {
  if (options.confirmed !== true) {
    throw new Error('Arc operator provisioning requires --confirm-create-arc-testnet-operator.')
  }
  const config = readArcAgreementOperatorProvisionConfig(options.env)
  const fetchImpl = options.fetchImpl ?? fetch
  const requestId = options.requestId ?? randomUUID

  async function request(path, init = {}) {
    const response = await fetchImpl(`${CIRCLE_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'X-Request-Id': requestId(),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Circle operator provisioning request failed at ${path} with HTTP ${response.status}.`)
    }
    return body
  }

  async function freshEntitySecretCiphertext() {
    const response = await request('/v1/w3s/config/entity/publicKey')
    return encryptCircleEntitySecret(config.entitySecret, String(response?.data?.publicKey ?? '').trim())
  }

  const walletSetResponse = await request('/v1/w3s/developer/walletSets', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: config.walletSetIdempotencyKey,
      entitySecretCiphertext: await freshEntitySecretCiphertext(),
      name: 'Hash PayLink Arc Agreements',
    }),
  })
  const walletSetId = String(walletSetResponse?.data?.walletSet?.id ?? '').trim()
  if (!UUID.test(walletSetId)) throw new Error('Circle returned an invalid Arc Agreements wallet-set ID.')

  const walletResponse = await request('/v1/w3s/developer/wallets', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: config.walletIdempotencyKey,
      blockchains: [ARC_BLOCKCHAIN],
      entitySecretCiphertext: await freshEntitySecretCiphertext(),
      walletSetId,
      accountType: 'EOA',
      count: 1,
      metadata: [{
        name: 'Hash PayLink Arc Agreements Operator',
        refId: 'hashpaylink-arc-agreements-operator',
      }],
    }),
  })
  return verifiedWallet(walletResponse?.data?.wallets?.[0], walletSetId)
}

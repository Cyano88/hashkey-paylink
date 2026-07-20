import {
  constants,
  publicEncrypt,
  randomUUID,
} from 'node:crypto'
import { isAddress } from 'viem'

const OFFICIAL_CIRCLE_API_HOST = 'api.circle.com'
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENTITY_SECRET_PATTERN = /^[0-9a-f]{64}$/i

export type CircleTreasuryConfig = {
  apiBase: string
  apiKey: string
  entitySecret: string
  walletSetId: string
  walletId: string
  treasuryAddress: string
  walletSetIdempotencyKey: string
  walletIdempotencyKey: string
  blockchain: 'BASE'
  accountType: 'SCA'
  credentialsReady: boolean
  setupReady: boolean
  verificationReady: boolean
  issues: string[]
}

export type CircleDeveloperWallet = {
  id: string
  address: string
  blockchain: string
  state: string
  walletSetId: string
  accountType: string
  name?: string
  refId?: string
}

export type CircleDeveloperTransaction = {
  id: string
  blockchain: string
  state: string
  transactionType: string
  walletId: string
  sourceAddress: string
  destinationAddress: string
  amounts: string[]
  tokenId: string
  txHash: string
  refId: string
  errorReason: string
  errorDetails: string
}

type FetchLike = typeof fetch

export class CircleTreasuryError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 500) {
    super(message)
    this.name = 'CircleTreasuryError'
    this.code = code
    this.status = status
  }
}

function officialApiBase(value: unknown) {
  const text = String(value ?? '').trim().replace(/\/+$/, '') || 'https://api.circle.com'
  try {
    const parsed = new URL(text)
    const valid = parsed.protocol === 'https:'
      && parsed.hostname === OFFICIAL_CIRCLE_API_HOST
      && !parsed.username
      && !parsed.password
      && parsed.pathname === '/'
    return { value: text, valid }
  } catch {
    return { value: text, valid: false }
  }
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

export function readCircleTreasuryConfig(env: NodeJS.ProcessEnv = process.env): CircleTreasuryConfig {
  const apiBase = officialApiBase(env.CIRCLE_BASE_URL)
  const apiKey = clean(env.CIRCLE_API_KEY)
  const entitySecret = clean(env.CIRCLE_ENTITY_SECRET)
  const walletSetId = clean(env.POCKET_BILLS_TREASURY_WALLET_SET_ID)
  const walletId = clean(env.POCKET_BILLS_TREASURY_WALLET_ID)
  const treasuryAddress = clean(env.POCKET_BILLS_TREASURY_ADDRESS)
  const walletSetIdempotencyKey = clean(env.POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY)
  const walletIdempotencyKey = clean(env.POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY)
  const issues: string[] = []

  if (!apiBase.valid) issues.push('CIRCLE_BASE_URL must be https://api.circle.com.')
  if (!apiKey) issues.push('CIRCLE_API_KEY is missing.')
  if (!ENTITY_SECRET_PATTERN.test(entitySecret)) issues.push('CIRCLE_ENTITY_SECRET must be a 32-byte secret encoded as 64 hexadecimal characters.')
  if (walletSetId && !UUID_PATTERN.test(walletSetId)) issues.push('POCKET_BILLS_TREASURY_WALLET_SET_ID must be a UUID.')
  if (walletId && !UUID_PATTERN.test(walletId)) issues.push('POCKET_BILLS_TREASURY_WALLET_ID must be a UUID.')
  if (treasuryAddress && !isAddress(treasuryAddress)) issues.push('POCKET_BILLS_TREASURY_ADDRESS must be a valid EVM address.')
  if (!UUID_V4_PATTERN.test(walletSetIdempotencyKey)) issues.push('POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY must be a UUID v4.')
  if (!UUID_V4_PATTERN.test(walletIdempotencyKey)) issues.push('POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY must be a UUID v4.')

  const credentialsReady = Boolean(apiBase.valid && apiKey && ENTITY_SECRET_PATTERN.test(entitySecret))
  const setupReady = Boolean(
    credentialsReady
    && UUID_V4_PATTERN.test(walletSetIdempotencyKey)
    && UUID_V4_PATTERN.test(walletIdempotencyKey),
  )
  const verificationReady = Boolean(
    credentialsReady
    && UUID_PATTERN.test(walletSetId)
    && UUID_PATTERN.test(walletId)
    && isAddress(treasuryAddress),
  )

  return {
    apiBase: apiBase.value,
    apiKey,
    entitySecret,
    walletSetId,
    walletId,
    treasuryAddress,
    walletSetIdempotencyKey,
    walletIdempotencyKey,
    blockchain: 'BASE',
    accountType: 'SCA',
    credentialsReady,
    setupReady,
    verificationReady,
    issues,
  }
}

function safeProviderMessage(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const value = body as { code?: unknown; message?: unknown }
  const code = clean(value.code).slice(0, 60)
  const message = clean(value.message).replace(/\s+/g, ' ').slice(0, 240)
  return [code, message].filter(Boolean).join(': ')
}

function assertWallet(value: unknown): CircleDeveloperWallet {
  if (!value || typeof value !== 'object') {
    throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an invalid wallet response.', 502)
  }
  const wallet = value as Partial<CircleDeveloperWallet>
  if (!clean(wallet.id) || !isAddress(clean(wallet.address))) {
    throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an incomplete wallet response.', 502)
  }
  return {
    id: clean(wallet.id),
    address: clean(wallet.address),
    blockchain: clean(wallet.blockchain),
    state: clean(wallet.state),
    walletSetId: clean(wallet.walletSetId),
    accountType: clean(wallet.accountType),
    name: clean(wallet.name) || undefined,
    refId: clean(wallet.refId) || undefined,
  }
}

function assertTransaction(value: unknown): CircleDeveloperTransaction {
  if (!value || typeof value !== 'object') {
    throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an invalid transaction response.', 502)
  }
  const transaction = value as Record<string, unknown>
  const id = clean(transaction.id)
  const state = clean(transaction.state)
  const amounts = Array.isArray(transaction.amounts)
    ? transaction.amounts.map(amount => clean(amount)).filter(Boolean)
    : []
  if (!UUID_PATTERN.test(id) || !state) {
    throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an incomplete transaction response.', 502)
  }
  return {
    id,
    blockchain: clean(transaction.blockchain),
    state,
    transactionType: clean(transaction.transactionType),
    walletId: clean(transaction.walletId),
    sourceAddress: clean(transaction.sourceAddress),
    destinationAddress: clean(transaction.destinationAddress),
    amounts,
    tokenId: clean(transaction.tokenId),
    txHash: clean(transaction.txHash).toLowerCase(),
    refId: clean(transaction.refId),
    errorReason: clean(transaction.errorReason),
    errorDetails: clean(transaction.errorDetails),
  }
}

export function encryptCircleEntitySecret(entitySecret: string, publicKeyPem: string) {
  if (!ENTITY_SECRET_PATTERN.test(entitySecret)) {
    throw new CircleTreasuryError('CIRCLE_ENTITY_SECRET_INVALID', 'Circle entity secret is not valid.', 503)
  }
  if (!publicKeyPem.includes('BEGIN PUBLIC KEY')) {
    throw new CircleTreasuryError('CIRCLE_PUBLIC_KEY_INVALID', 'Circle returned an invalid entity public key.', 502)
  }
  try {
    return publicEncrypt({
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, Buffer.from(entitySecret, 'hex')).toString('base64')
  } catch {
    throw new CircleTreasuryError('CIRCLE_ENTITY_SECRET_ENCRYPTION_FAILED', 'Circle entity secret encryption failed.', 502)
  }
}

export function createCircleDeveloperTreasuryClient(options: {
  config: CircleTreasuryConfig
  fetchImpl?: FetchLike
  requestId?: () => string
}) {
  const { config } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const requestId = options.requestId ?? randomUUID

  async function request(path: string, init: RequestInit = {}) {
    if (!config.apiKey) {
      throw new CircleTreasuryError('CIRCLE_API_KEY_MISSING', 'Circle API key is not configured.', 503)
    }
    const response = await fetchImpl(`${config.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'X-Request-Id': requestId(),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    })
    const body = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      const providerMessage = safeProviderMessage(body)
      throw new CircleTreasuryError(
        'CIRCLE_REQUEST_FAILED',
        providerMessage ? `Circle request failed: ${providerMessage}` : `Circle request failed with HTTP ${response.status}.`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
      )
    }
    return body as Record<string, any>
  }

  async function freshEntitySecretCiphertext() {
    if (!ENTITY_SECRET_PATTERN.test(config.entitySecret)) {
      throw new CircleTreasuryError('CIRCLE_ENTITY_SECRET_MISSING', 'Circle entity secret is not configured.', 503)
    }
    const body = await request('/v1/w3s/config/entity/publicKey')
    const publicKey = clean(body?.data?.publicKey)
    return encryptCircleEntitySecret(config.entitySecret, publicKey)
  }

  async function createWalletSet() {
    if (!config.setupReady) {
      throw new CircleTreasuryError('CIRCLE_TREASURY_SETUP_NOT_READY', 'Circle treasury setup configuration is incomplete.', 503)
    }
    const body = await request('/v1/w3s/developer/walletSets', {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: config.walletSetIdempotencyKey,
        entitySecretCiphertext: await freshEntitySecretCiphertext(),
        name: 'Hash PayLink Bills Treasury',
      }),
    })
    const walletSetId = clean(body?.data?.walletSet?.id)
    if (!UUID_PATTERN.test(walletSetId)) {
      throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an invalid wallet set response.', 502)
    }
    return { id: walletSetId }
  }

  async function createWallet(walletSetId: string) {
    if (!config.setupReady || !UUID_PATTERN.test(walletSetId)) {
      throw new CircleTreasuryError('CIRCLE_TREASURY_SETUP_NOT_READY', 'Circle treasury wallet setup configuration is incomplete.', 503)
    }
    const body = await request('/v1/w3s/developer/wallets', {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: config.walletIdempotencyKey,
        blockchains: [config.blockchain],
        entitySecretCiphertext: await freshEntitySecretCiphertext(),
        walletSetId,
        accountType: config.accountType,
        count: 1,
        metadata: [{ name: 'Hash PayLink Bills Treasury', refId: 'pocket-bills-treasury' }],
      }),
    })
    return assertWallet(body?.data?.wallets?.[0])
  }

  async function getWallet(walletId = config.walletId) {
    if (!UUID_PATTERN.test(walletId)) {
      throw new CircleTreasuryError('CIRCLE_TREASURY_WALLET_ID_MISSING', 'Circle treasury wallet ID is not configured.', 503)
    }
    const body = await request(`/v1/w3s/wallets/${encodeURIComponent(walletId)}`)
    return assertWallet(body?.data?.wallet)
  }

  async function verifyConfiguredWallet() {
    if (!config.verificationReady) {
      throw new CircleTreasuryError('CIRCLE_TREASURY_VERIFICATION_NOT_READY', 'Circle treasury verification configuration is incomplete.', 503)
    }
    const wallet = await getWallet()
    const matches = wallet.id === config.walletId
      && wallet.walletSetId === config.walletSetId
      && wallet.address.toLowerCase() === config.treasuryAddress.toLowerCase()
      && wallet.blockchain === config.blockchain
      && wallet.accountType === config.accountType
      && wallet.state === 'LIVE'
    if (!matches) {
      throw new CircleTreasuryError(
        'CIRCLE_TREASURY_MISMATCH',
        'Configured Bills treasury does not match the live Circle Base SCA wallet.',
        409,
      )
    }
    return wallet
  }

  async function createUsdcTransfer(input: {
    idempotencyKey: string
    destinationAddress: string
    amount: string
    refId: string
    tokenAddress: string
  }) {
    if (!config.verificationReady) {
      throw new CircleTreasuryError('CIRCLE_TREASURY_VERIFICATION_NOT_READY', 'Circle treasury verification configuration is incomplete.', 503)
    }
    if (!UUID_V4_PATTERN.test(input.idempotencyKey)) {
      throw new CircleTreasuryError('CIRCLE_IDEMPOTENCY_KEY_INVALID', 'Circle transfer idempotency key must be a UUID v4.', 400)
    }
    if (!isAddress(input.destinationAddress) || !isAddress(input.tokenAddress)) {
      throw new CircleTreasuryError('CIRCLE_TRANSFER_ADDRESS_INVALID', 'Circle transfer addresses are invalid.', 400)
    }
    if (!/^\d+(?:\.\d{1,6})?$/.test(input.amount) || Number(input.amount) <= 0) {
      throw new CircleTreasuryError('CIRCLE_TRANSFER_AMOUNT_INVALID', 'Circle transfer amount is invalid.', 400)
    }
    const refId = clean(input.refId).slice(0, 100)
    if (!refId) throw new CircleTreasuryError('CIRCLE_TRANSFER_REFERENCE_INVALID', 'Circle transfer reference is required.', 400)
    const body = await request('/v1/w3s/developer/transactions/transfer', {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        destinationAddress: input.destinationAddress,
        entitySecretCiphertext: await freshEntitySecretCiphertext(),
        amounts: [input.amount],
        feeLevel: 'MEDIUM',
        refId,
        tokenAddress: input.tokenAddress,
        blockchain: config.blockchain,
        walletAddress: config.treasuryAddress,
      }),
    })
    const id = clean(body?.data?.id)
    if (!UUID_PATTERN.test(id)) {
      throw new CircleTreasuryError('CIRCLE_INVALID_RESPONSE', 'Circle returned an invalid transfer response.', 502)
    }
    return { id }
  }

  async function getTransaction(transactionId: string) {
    if (!UUID_PATTERN.test(transactionId)) {
      throw new CircleTreasuryError('CIRCLE_TRANSACTION_ID_INVALID', 'Circle transaction ID is invalid.', 400)
    }
    const body = await request(`/v1/w3s/transactions/${encodeURIComponent(transactionId)}?txType=OUTBOUND`)
    return assertTransaction(body?.data?.transaction)
  }

  return {
    createWalletSet,
    createWallet,
    getWallet,
    verifyConfiguredWallet,
    createUsdcTransfer,
    getTransaction,
  }
}

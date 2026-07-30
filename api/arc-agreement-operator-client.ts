import { randomUUID } from 'node:crypto'
import { encryptCircleEntitySecret } from './circle-developer-treasury.js'
import {
  fetchAndVerifyArcAgreementOperatorTransaction,
  type ArcAgreementOperatorTransactionStatus,
} from './arc-agreement-operator-status.js'
import {
  fetchAndVerifyArcAgreementOperatorWallet,
  type ArcAgreementVerifiedOperatorWallet,
} from './arc-agreement-operator-wallet.js'
import {
  assertArcAgreementPreparedOperatorCall,
  type ArcAgreementPreparedOperatorCall,
} from './arc-agreement-operator.js'

const CIRCLE_API_BASE = 'https://api.circle.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ArcAgreementOperatorProviderError extends Error {
  readonly definitive: boolean
  readonly manualReview: boolean

  constructor(message: string, options: { definitive?: boolean; manualReview?: boolean } = {}) {
    super(message)
    this.name = 'ArcAgreementOperatorProviderError'
    this.definitive = options.definitive === true
    this.manualReview = options.manualReview === true
  }
}

type CircleMutationResponse = {
  data?: {
    id?: unknown
  }
  code?: unknown
  message?: unknown
}

export type ArcAgreementOperatorClient = {
  operatorWallet: (expectedOperator: string) => Promise<ArcAgreementVerifiedOperatorWallet>
  submit: (call: ArcAgreementPreparedOperatorCall) => Promise<string>
  status: (
    transactionId: string,
    call: ArcAgreementPreparedOperatorCall,
  ) => Promise<ArcAgreementOperatorTransactionStatus>
}

function required(value: string | undefined, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function safeProviderMessage(body: CircleMutationResponse | null) {
  return [body?.code, body?.message]
    .map(value => String(value ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(': ')
    .slice(0, 300)
}

export function createArcAgreementOperatorClient(input: {
  apiKey?: string
  entitySecret?: string
  operatorWalletId?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}): ArcAgreementOperatorClient {
  const apiKey = required(input.apiKey ?? process.env.CIRCLE_TEST_API_KEY, 'Circle test API key')
  if (!apiKey.startsWith('TEST_API_KEY:')) {
    throw new Error('Arc Agreement operator execution requires a Circle test API key.')
  }
  const entitySecret = required(input.entitySecret ?? process.env.CIRCLE_ENTITY_SECRET, 'Circle entity secret')
  const operatorWalletId = required(
    input.operatorWalletId ?? process.env.ARC_AGREEMENT_OPERATOR_WALLET_ID,
    'Arc Agreement operator wallet id',
  )
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = Number(input.timeoutMs ?? 30_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 60_000) {
    throw new Error('Circle operator request timeout is invalid.')
  }

  async function circleRequest(path: string, init: RequestInit) {
    const response = await fetchImpl(`${CIRCLE_API_BASE}${path}`, {
      ...init,
      redirect: 'error',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await response.json().catch(() => null) as CircleMutationResponse | null
    if (!response.ok) {
      const detail = safeProviderMessage(body)
      const suffix = detail ? `: ${detail}` : ''
      if (response.status === 401 || response.status === 403) {
        throw new ArcAgreementOperatorProviderError(
          `Circle operator authentication failed with HTTP ${response.status}${suffix}`,
          { manualReview: true },
        )
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        throw new ArcAgreementOperatorProviderError(
          `Circle rejected the operator transaction with HTTP ${response.status}${suffix}`,
          { definitive: true },
        )
      }
      throw new ArcAgreementOperatorProviderError(
        `Circle operator transaction outcome is not yet known after HTTP ${response.status}${suffix}`,
      )
    }
    return body
  }

  async function freshCiphertext() {
    const body = await circleRequest('/v1/w3s/config/entity/publicKey', { method: 'GET' })
    const publicKey = String((body as { data?: { publicKey?: unknown } })?.data?.publicKey ?? '').trim()
    if (!publicKey) throw new ArcAgreementOperatorProviderError('Circle entity public key is unavailable.')
    return encryptCircleEntitySecret(entitySecret, publicKey)
  }

  return {
    operatorWallet: expectedOperator => fetchAndVerifyArcAgreementOperatorWallet({
      apiKey,
      walletId: operatorWalletId,
      expectedOperator,
      requestId: randomUUID(),
      fetchImpl,
      timeoutMs,
    }),
    submit: async prepared => {
      const call = assertArcAgreementPreparedOperatorCall(prepared)
      const body = await circleRequest('/v1/w3s/developer/transactions/contractExecution', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: call.idempotencyKey,
          walletId: call.walletId,
          blockchain: call.network,
          contractAddress: call.contractAddress,
          feeLevel: call.feeLevel,
          refId: call.refId,
          abiFunctionSignature: call.abiFunctionSignature,
          abiParameters: call.abiParameters.map(String),
          entitySecretCiphertext: await freshCiphertext(),
        }),
      })
      const transactionId = String(body?.data?.id ?? '').trim()
      if (!UUID.test(transactionId)) {
        throw new ArcAgreementOperatorProviderError(
          'Circle accepted the operator request without a valid transaction id.',
          { manualReview: true },
        )
      }
      return transactionId
    },
    status: (transactionId, call) => fetchAndVerifyArcAgreementOperatorTransaction({
      apiKey,
      transactionId,
      requestId: randomUUID(),
      preparedCall: call,
      fetchImpl,
      timeoutMs,
    }),
  }
}

import { getAddress, isAddress, type Hex } from 'viem'
import {
  assertArcAgreementPreparedOperatorCall,
  type ArcAgreementPreparedOperatorCall,
} from './arc-agreement-operator.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TX_HASH = /^0x[0-9a-f]{64}$/i
const CIRCLE_API_BASE = 'https://api.circle.com'

const CIRCLE_STATES = new Set([
  'CANCELLED',
  'CONFIRMED',
  'COMPLETE',
  'DENIED',
  'FAILED',
  'INITIATED',
  'CLEARED',
  'QUEUED',
  'SENT',
  'STUCK',
])
const SUCCESS_CANDIDATES = new Set(['CONFIRMED', 'COMPLETE', 'CLEARED'])
const FAILURES = new Set(['CANCELLED', 'DENIED', 'FAILED'])

type CircleOperatorTransactionResponse = {
  data?: {
    transaction?: {
      id?: unknown
      blockchain?: unknown
      state?: unknown
      transactionType?: unknown
      operation?: unknown
      custodyType?: unknown
      walletId?: unknown
      sourceAddress?: unknown
      contractAddress?: unknown
      abiFunctionSignature?: unknown
      abiParameters?: unknown
      refId?: unknown
      txHash?: unknown
      blockHeight?: unknown
    }
  }
}

export type ArcAgreementOperatorTransactionStatus = Readonly<{
  verified: true
  transactionId: string
  circleState: string
  classification: 'pending' | 'chain_reconciliation_required' | 'failed' | 'manual_review'
  txHash: Hex | null
  blockHeight: number | null
  authoritativeAgreementState: false
  requiresConfirmedChainReconciliation: boolean
}>

function requiredUuid(value: unknown, label: string) {
  const normalized = String(value ?? '').trim()
  if (!UUID.test(normalized)) throw new Error(`${label} is invalid.`)
  return normalized
}

function requiredRequestId(value: unknown) {
  const requestId = String(value ?? '').trim()
  if (!UUID_V4.test(requestId)) throw new Error('Circle transaction status request id must be a UUID v4.')
  return requestId
}

function requiredApiKey(value: unknown) {
  const apiKey = String(value ?? '').trim()
  if (apiKey.length < 16) throw new Error('Circle test API key is required for operator transaction status.')
  return apiKey
}

function normalizedAddress(value: unknown, label: string) {
  const address = String(value ?? '').trim()
  if (!isAddress(address)) throw new Error(`Circle operator transaction ${label} is invalid.`)
  return getAddress(address)
}

function parametersMatch(actual: unknown, expected: readonly (number | Hex)[]) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false
  return actual.every((value, index) => {
    const actualValue = String(value)
    const expectedValue = String(expected[index])
    return expectedValue.startsWith('0x')
      ? actualValue.toLowerCase() === expectedValue.toLowerCase()
      : actualValue === expectedValue
  })
}

function classification(state: string) {
  if (SUCCESS_CANDIDATES.has(state)) return 'chain_reconciliation_required' as const
  if (FAILURES.has(state)) return 'failed' as const
  if (state === 'STUCK') return 'manual_review' as const
  return 'pending' as const
}

export function verifyArcAgreementOperatorTransaction(input: {
  transactionId: unknown
  preparedCall: ArcAgreementPreparedOperatorCall
  response: unknown
}): ArcAgreementOperatorTransactionStatus {
  const transactionId = requiredUuid(input.transactionId, 'Circle operator transaction id')
  const preparedCall = assertArcAgreementPreparedOperatorCall(input.preparedCall)
  const transaction = (input.response as CircleOperatorTransactionResponse)?.data?.transaction
  if (!transaction || String(transaction.id ?? '').trim().toLowerCase() !== transactionId.toLowerCase()) {
    throw new Error('Circle operator transaction response does not match the requested transaction id.')
  }
  if (transaction.blockchain !== preparedCall.network) {
    throw new Error('Circle operator transaction is not on the prepared Arc network.')
  }
  if (transaction.custodyType !== undefined && transaction.custodyType !== 'DEVELOPER') {
    throw new Error('Circle operator transaction is not developer-controlled.')
  }
  if (transaction.transactionType !== 'OUTBOUND') {
    throw new Error('Circle operator transaction is not outbound.')
  }
  if (transaction.operation !== undefined && transaction.operation !== 'CONTRACT_EXECUTION') {
    throw new Error('Circle operator transaction is not a contract execution.')
  }
  if (String(transaction.walletId ?? '').trim().toLowerCase() !== preparedCall.walletId.toLowerCase()) {
    throw new Error('Circle operator transaction wallet does not match the prepared wallet.')
  }
  if (normalizedAddress(transaction.sourceAddress, 'source address') !== preparedCall.operatorAddress) {
    throw new Error('Circle operator transaction source does not match the verified operator.')
  }
  if (normalizedAddress(transaction.contractAddress, 'contract address') !== preparedCall.contractAddress) {
    throw new Error('Circle operator transaction target does not match the prepared escrow.')
  }
  if (transaction.abiFunctionSignature !== preparedCall.abiFunctionSignature) {
    throw new Error('Circle operator transaction method does not match the prepared call.')
  }
  if (!parametersMatch(transaction.abiParameters, preparedCall.abiParameters)) {
    throw new Error('Circle operator transaction parameters do not match the prepared call.')
  }
  if (String(transaction.refId ?? '').trim() !== preparedCall.refId) {
    throw new Error('Circle operator transaction reference does not match the prepared call.')
  }
  const state = String(transaction.state ?? '').trim()
  if (!CIRCLE_STATES.has(state)) throw new Error('Circle operator transaction state is unsupported.')

  const successCandidate = SUCCESS_CANDIDATES.has(state)
  const txHashValue = String(transaction.txHash ?? '').trim()
  if (successCandidate && !TX_HASH.test(txHashValue)) {
    throw new Error('Circle operator transaction is missing a valid transaction hash.')
  }
  if (txHashValue && !TX_HASH.test(txHashValue)) {
    throw new Error('Circle operator transaction hash is invalid.')
  }
  const blockHeightValue = transaction.blockHeight
  const blockHeight = blockHeightValue === undefined || blockHeightValue === null
    ? null
    : Number(blockHeightValue)
  if (blockHeight !== null && (!Number.isSafeInteger(blockHeight) || blockHeight < 0)) {
    throw new Error('Circle operator transaction block height is invalid.')
  }

  return Object.freeze({
    verified: true,
    transactionId,
    circleState: state,
    classification: classification(state),
    txHash: txHashValue ? txHashValue as Hex : null,
    blockHeight,
    authoritativeAgreementState: false,
    requiresConfirmedChainReconciliation: successCandidate,
  })
}

export async function fetchAndVerifyArcAgreementOperatorTransaction(input: {
  apiKey: string
  transactionId: string
  requestId: string
  preparedCall: ArcAgreementPreparedOperatorCall
  fetchImpl?: typeof fetch
  timeoutMs?: number
}) {
  const apiKey = requiredApiKey(input.apiKey)
  const transactionId = requiredUuid(input.transactionId, 'Circle operator transaction id')
  const requestId = requiredRequestId(input.requestId)
  const preparedCall = assertArcAgreementPreparedOperatorCall(input.preparedCall)
  const timeoutMs = Number(input.timeoutMs ?? 10_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error('Circle operator transaction status timeout is invalid.')
  }
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${CIRCLE_API_BASE}/v1/w3s/transactions/${encodeURIComponent(transactionId)}?txType=OUTBOUND`,
    {
      method: 'GET',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-request-id': requestId,
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!response.ok) {
    if (response.status === 401) throw new Error('Circle operator transaction status authentication failed.')
    if (response.status === 404) throw new Error('Circle operator transaction was not found.')
    throw new Error(`Circle operator transaction status failed with HTTP ${response.status}.`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Circle operator transaction status returned invalid JSON.')
  }
  return verifyArcAgreementOperatorTransaction({
    transactionId,
    preparedCall,
    response: body,
  })
}

import { POCKET_API, createPocketIdempotencyKey } from '../lib/pocketSchemas'

export type PocketBillIntentState =
  | 'quoted'
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'vending'
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'refund_pending'
  | 'refunding'
  | 'refund_submitted'
  | 'refunded'
  | 'needs_review'

export type PocketBillIntent = {
  id: string
  requestId: string
  state: PocketBillIntentState
  category: 'airtime'
  serviceId: string
  serviceName: string
  phone: string
  amountNgn: string
  amountUsdc: string
  fxRateNgnPerUsdc: string
  network: 'base'
  treasuryAddress: string
  payerWallet: string
  quoteExpiresAt: number
  txHash: string
  paymentAmountUsdc: string
  refundTxHash: string
  providerStatus: string
  providerDescription: string
  failureReason: string
  createdAt: number
  updatedAt: number
}

export class PocketBillsApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(message: string, options: { code?: string; retryable?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'PocketBillsApiError'
    this.code = options.code ?? 'ACTION_FAILED'
    this.retryable = options.retryable ?? false
    this.status = options.status ?? 500
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isIntentState(value: unknown): value is PocketBillIntentState {
  return ['quoted', 'awaiting_payment', 'payment_confirmed', 'vending', 'pending', 'delivered', 'failed', 'refund_pending', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(String(value))
}

export function parsePocketBillIntent(value: unknown): PocketBillIntent {
  const intent = record(value)
  if (!text(intent.id) || !text(intent.requestId) || !isIntentState(intent.state) || intent.category !== 'airtime') {
    throw new PocketBillsApiError('Bill-payment response was invalid.')
  }
  const quoteExpiresAt = Number(intent.quoteExpiresAt)
  const createdAt = Number(intent.createdAt)
  const updatedAt = Number(intent.updatedAt)
  if (![quoteExpiresAt, createdAt, updatedAt].every(Number.isFinite)) {
    throw new PocketBillsApiError('Bill-payment response was invalid.')
  }
  return {
    id: text(intent.id),
    requestId: text(intent.requestId),
    state: intent.state,
    category: 'airtime',
    serviceId: text(intent.serviceId),
    serviceName: text(intent.serviceName),
    phone: text(intent.phone),
    amountNgn: text(intent.amountNgn),
    amountUsdc: text(intent.amountUsdc),
    fxRateNgnPerUsdc: text(intent.fxRateNgnPerUsdc),
    network: 'base',
    treasuryAddress: text(intent.treasuryAddress),
    payerWallet: text(intent.payerWallet),
    quoteExpiresAt,
    txHash: text(intent.txHash),
    paymentAmountUsdc: text(intent.paymentAmountUsdc),
    refundTxHash: text(intent.refundTxHash),
    providerStatus: text(intent.providerStatus),
    providerDescription: text(intent.providerDescription),
    failureReason: text(intent.failureReason),
    createdAt,
    updatedAt,
  }
}

export function parsePocketBillsAvailability(value: unknown) {
  const bills = record(record(value).bills)
  const minNgn = Number(bills.minNgn)
  const maxNgn = Number(bills.maxNgn)
  return {
    enabled: bills.enabled === true,
    environment: bills.environment === 'live' ? 'live' as const : 'sandbox' as const,
    minNgn: Number.isFinite(minNgn) && minNgn > 0 ? minNgn : 100,
    maxNgn: Number.isFinite(maxNgn) && maxNgn > 0 ? maxNgn : 1000,
  }
}

function apiError(body: unknown, status: number, fallback: string) {
  const error = record(record(body).error)
  return new PocketBillsApiError(text(error.message) || fallback, {
    code: text(error.code),
    retryable: error.retryable === true,
    status,
  })
}

async function postBills({
  endpoint,
  accessToken,
  body,
  idempotencyKey,
  fetcher = fetch,
}: {
  endpoint: string
  accessToken: string
  body: Record<string, unknown>
  idempotencyKey: string
  fetcher?: typeof fetch
}) {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw apiError(data, response.status, 'Bill-payment request failed.')
  const root = record(data)
  if (root.ok !== true) throw apiError(data, response.status, 'Bill-payment request failed.')
  return record(root.data)
}

export async function readPocketBillsAvailability(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/public-config', { cache: 'no-store' })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new PocketBillsApiError('Bills availability is temporarily unavailable.', { status: response.status, retryable: true })
  return parsePocketBillsAvailability(data)
}

export async function quotePocketAirtime(input: {
  accessToken: string
  serviceId: string
  phone: string
  amountNgn: string
  payerWallet: string
  idempotencyKey?: string
  fetcher?: typeof fetch
}) {
  const data = await postBills({
    endpoint: POCKET_API.billsQuote,
    accessToken: input.accessToken,
    idempotencyKey: input.idempotencyKey ?? createPocketIdempotencyKey('airtime-quote'),
    fetcher: input.fetcher,
    body: { service_id: input.serviceId, phone: input.phone, amount_ngn: input.amountNgn, payer_wallet: input.payerWallet },
  })
  return { intent: parsePocketBillIntent(data.intent), replayed: data.replayed === true }
}

async function mutatePocketBill(input: {
  accessToken: string
  action: 'prepare' | 'confirm' | 'status'
  intentId: string
  txHash?: string
  refresh?: boolean
  fetcher?: typeof fetch
}) {
  const data = await postBills({
    endpoint: POCKET_API.billsPay,
    accessToken: input.accessToken,
    idempotencyKey: createPocketIdempotencyKey(`airtime-${input.action}`),
    fetcher: input.fetcher,
    body: {
      action: input.action,
      intent_id: input.intentId,
      ...(input.txHash ? { tx_hash: input.txHash } : {}),
      ...(input.refresh !== undefined ? { refresh: input.refresh } : {}),
    },
  })
  return parsePocketBillIntent(data.intent)
}

export const preparePocketAirtime = (input: Omit<Parameters<typeof mutatePocketBill>[0], 'action'>) => mutatePocketBill({ ...input, action: 'prepare' })
export const confirmPocketAirtime = (input: Omit<Parameters<typeof mutatePocketBill>[0], 'action'>) => mutatePocketBill({ ...input, action: 'confirm' })
export const refreshPocketAirtime = (input: Omit<Parameters<typeof mutatePocketBill>[0], 'action'>) => mutatePocketBill({ ...input, action: 'status' })

export async function processPocketBillRefund(input: {
  accessToken: string
  intentId: string
  fetcher?: typeof fetch
}) {
  const response = await (input.fetcher ?? fetch)(POCKET_API.billsRefund, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.accessToken}`,
      'idempotency-key': createPocketIdempotencyKey('bill-refund'),
    },
    body: JSON.stringify({ intent_id: input.intentId }),
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok) throw apiError(body, response.status, 'Refund status could not be checked.')
  const root = record(body)
  const data = record(root.data)
  if (root.ok !== true || !text(data.state)) throw new PocketBillsApiError('Refund response was invalid.')
  return {
    state: text(data.state),
    intent: parsePocketBillIntent(data.intent),
  }
}

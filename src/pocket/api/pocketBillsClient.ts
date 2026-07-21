import { POCKET_API, createPocketIdempotencyKey } from '../lib/pocketSchemas'

export type PocketBillIntentState =
  | 'quoted'
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'vending'
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'provider_failed_unverified'
  | 'refund_pending'
  | 'refund_eligible'
  | 'refunding'
  | 'refund_submitted'
  | 'refunded'
  | 'needs_review'

export type PocketBillIntent = {
  id: string
  requestId: string
  state: PocketBillIntentState
  category: 'airtime' | 'data' | 'tv' | 'electricity'
  serviceId: string
  serviceName: string
  variationCode: string
  variationName: string
  phone: string
  contactPhone: string
  customerName: string
  customerAddress: string
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
  purchasedCode: string
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
  return ['quoted', 'awaiting_payment', 'payment_confirmed', 'vending', 'pending', 'delivered', 'failed', 'provider_failed_unverified', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(String(value))
}

export function parsePocketBillIntent(value: unknown): PocketBillIntent {
  const intent = record(value)
  const category = intent.category === 'data' ? 'data' as const : intent.category === 'tv' ? 'tv' as const : intent.category === 'electricity' ? 'electricity' as const : intent.category === 'airtime' ? 'airtime' as const : undefined
  if (!text(intent.id) || !text(intent.requestId) || !isIntentState(intent.state) || !category) {
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
    category,
    serviceId: text(intent.serviceId),
    serviceName: text(intent.serviceName),
    variationCode: text(intent.variationCode),
    variationName: text(intent.variationName),
    phone: text(intent.phone),
    contactPhone: text(intent.contactPhone),
    customerName: text(intent.customerName),
    customerAddress: text(intent.customerAddress),
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
    purchasedCode: text(intent.purchasedCode),
    failureReason: text(intent.failureReason),
    createdAt,
    updatedAt,
  }
}

export function parsePocketBillsAvailability(value: unknown) {
  const bills = record(record(value).bills)
  const categories = Array.isArray(bills.categories) ? bills.categories.map(String) : []
  return {
    enabled: bills.enabled === true,
    environment: bills.environment === 'live' ? 'live' as const : 'sandbox' as const,
    airtimeEnabled: categories.includes('airtime'),
    dataEnabled: categories.includes('data'),
    tvEnabled: categories.includes('tv'),
    electricityEnabled: categories.includes('electricity'),
  }
}

function apiError(body: unknown, status: number, fallback: string) {
  const error = record(record(body).error)
  return new PocketBillsApiError(text(error.message) || fallback, {
    code: text(error.reason) || text(error.code),
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

export type PocketDataService = { serviceId: string; name: string }
export type PocketDataVariation = { variationCode: string; name: string; amountNgn: string; available: boolean }
export type PocketBillService = PocketDataService
export type PocketBillVariation = PocketDataVariation

export async function readPocketDataCatalog(input: {
  accessToken: string
  serviceId?: string
  category?: 'data' | 'tv' | 'electricity'
  fetcher?: typeof fetch
}) {
  const params = new URLSearchParams({ category: input.category ?? 'data' })
  if (input.serviceId) params.set('service_id', input.serviceId)
  const query = `?${params.toString()}`
  const response = await (input.fetcher ?? fetch)(`${POCKET_API.billsCatalog}${query}`, {
    headers: { authorization: `Bearer ${input.accessToken}` },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok) throw apiError(body, response.status, 'Bills catalog is temporarily unavailable.')
  const data = record(record(body).data)
  const services = Array.isArray(data.services) ? data.services.flatMap(value => {
    const item = record(value)
    return text(item.serviceId) && text(item.name) ? [{ serviceId: text(item.serviceId), name: text(item.name) }] : []
  }) : []
  const variations = Array.isArray(data.variations) ? data.variations.flatMap(value => {
    const item = record(value)
    return text(item.variationCode) && text(item.name) && text(item.amountNgn)
      ? [{ variationCode: text(item.variationCode), name: text(item.name), amountNgn: text(item.amountNgn), available: item.available !== false }]
      : []
  }) : []
  if (input.serviceId ? input.category !== 'electricity' && !variations.length : !services.length) {
    throw new PocketBillsApiError('Bills catalog response was invalid.', { status: 502, retryable: true })
  }
  return { services, variations }
}

export type PocketBillVerification = {
  valid: true
  serviceId: string
  billersCode: string
  variationCode: string
  customerName: string
  customerAddress: string
  currentBouquet: string
  renewalAmount: number | null
  minimumAmount: number | null
  maximumAmount: number | null
}

export async function verifyPocketBillCustomer(input: {
  accessToken: string
  category: 'tv' | 'electricity'
  serviceId: string
  billersCode: string
  variationCode?: string
  fetcher?: typeof fetch
}) {
  const data = await postBills({
    endpoint: POCKET_API.billsVerify,
    accessToken: input.accessToken,
    idempotencyKey: createPocketIdempotencyKey('bill-verify'),
    fetcher: input.fetcher,
    body: { category: input.category, service_id: input.serviceId, billers_code: input.billersCode, variation_code: input.variationCode },
  })
  const value = record(data.verification)
  if (value.valid !== true || !text(value.serviceId) || !text(value.billersCode)) throw new PocketBillsApiError('Customer verification response was invalid.', { status: 502, retryable: true })
  const nullableNumber = (candidate: unknown) => candidate === null || candidate === undefined ? null : Number.isFinite(Number(candidate)) ? Number(candidate) : null
  return {
    valid: true as const,
    serviceId: text(value.serviceId), billersCode: text(value.billersCode), variationCode: text(value.variationCode),
    customerName: text(value.customerName), customerAddress: text(value.customerAddress), currentBouquet: text(value.currentBouquet),
    renewalAmount: nullableNumber(value.renewalAmount), minimumAmount: nullableNumber(value.minimumAmount), maximumAmount: nullableNumber(value.maximumAmount),
  }
}

export async function quotePocketData(input: {
  accessToken: string
  serviceId: string
  variationCode: string
  phone: string
  payerWallet: string
  idempotencyKey?: string
  fetcher?: typeof fetch
}) {
  const data = await postBills({
    endpoint: POCKET_API.billsQuote,
    accessToken: input.accessToken,
    idempotencyKey: input.idempotencyKey ?? createPocketIdempotencyKey('data-quote'),
    fetcher: input.fetcher,
    body: { category: 'data', service_id: input.serviceId, variation_code: input.variationCode, phone: input.phone, payer_wallet: input.payerWallet },
  })
  return { intent: parsePocketBillIntent(data.intent), replayed: data.replayed === true }
}

export async function quotePocketTv(input: {
  accessToken: string; serviceId: string; variationCode: string; smartcard: string; contactPhone: string; payerWallet: string; idempotencyKey?: string; fetcher?: typeof fetch
}) {
  const data = await postBills({ endpoint: POCKET_API.billsQuote, accessToken: input.accessToken, idempotencyKey: input.idempotencyKey ?? createPocketIdempotencyKey('tv-quote'), fetcher: input.fetcher,
    body: { category: 'tv', service_id: input.serviceId, variation_code: input.variationCode, phone: input.smartcard, contact_phone: input.contactPhone, payer_wallet: input.payerWallet } })
  return { intent: parsePocketBillIntent(data.intent), replayed: data.replayed === true }
}

export async function quotePocketElectricity(input: {
  accessToken: string; serviceId: string; meterType: 'prepaid' | 'postpaid'; meterNumber: string; contactPhone: string; amountNgn: string; payerWallet: string; idempotencyKey?: string; fetcher?: typeof fetch
}) {
  const data = await postBills({ endpoint: POCKET_API.billsQuote, accessToken: input.accessToken, idempotencyKey: input.idempotencyKey ?? createPocketIdempotencyKey('electricity-quote'), fetcher: input.fetcher,
    body: { category: 'electricity', service_id: input.serviceId, variation_code: input.meterType, phone: input.meterNumber, contact_phone: input.contactPhone, amount_ngn: input.amountNgn, payer_wallet: input.payerWallet } })
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
    idempotencyKey: createPocketIdempotencyKey(`bill-${input.action}`),
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
export const preparePocketData = preparePocketAirtime
export const confirmPocketData = confirmPocketAirtime
export const refreshPocketData = refreshPocketAirtime

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

import { randomBytes } from 'node:crypto'
import type { VtpassPhase0Config } from './vtpass-config.js'

export type VtpassTransactionStatus = 'delivered' | 'pending' | 'failed' | 'reversed'

export type VtpassTransactionResult = {
  status: VtpassTransactionStatus
  providerCode: string
  providerStatus: string
  responseDescription: string
  requestId: string
  transactionId: string
  productName: string
  recipient: string
  amountNgn: number | null
  purchasedCode: string
  retryable: boolean
  requeryRequired: boolean
}

export type VtpassService = {
  serviceId: string
  name: string
  minimumAmount: number | null
  maximumAmount: number | null
  convenienceFee: string
  productType: string
  imageUrl: string
}

export type VtpassServiceCategory = {
  identifier: string
  name: string
}

export type VtpassVariation = {
  variationCode: string
  name: string
  amount: number
  fixedPrice: boolean
}

export type VtpassCustomerVerification = {
  valid: boolean
  customerName: string
  customerAddress: string
  currentBouquet: string
  renewalAmount: number | null
  minimumAmount: number | null
  maximumAmount: number | null
}

export class VtpassClientError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  readonly outcomeUnknown: boolean
  readonly providerCode: string

  constructor(input: {
    code: string
    message: string
    status?: number
    retryable?: boolean
    outcomeUnknown?: boolean
    providerCode?: string
  }) {
    super(input.message)
    this.name = 'VtpassClientError'
    this.code = input.code
    this.status = input.status ?? 500
    this.retryable = input.retryable ?? false
    this.outcomeUnknown = input.outcomeUnknown ?? false
    this.providerCode = input.providerCode ?? ''
  }
}

type FetchLike = typeof fetch

type VtpassClientOptions = {
  config: VtpassPhase0Config
  fetchImpl?: FetchLike
  timeoutMs?: number
  now?: () => Date
  requestSuffix?: () => string
}

const AIRTIME_SERVICE_IDS = new Set(['mtn', 'airtel', 'glo', 'etisalat', '9mobile'])
const CATALOG_SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/
const FAILURE_CODES = new Set([
  '010', '011', '012', '013', '014', '015', '016', '017', '018', '019',
  '021', '022', '023', '024', '025', '026', '027', '028', '030', '031',
  '032', '034', '035', '083', '085', '087', '091',
])
const RETRYABLE_FAILURE_CODES = new Set(['030', '034', '035', '083'])
const PENDING_CODES = new Set(['044', '089', '099'])
const PENDING_STATUSES = new Set(['initiated', 'pending', 'processing'])

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function finiteNumber(value: unknown) {
  const normalized = typeof value === 'number' ? value : text(value)
  if (normalized === '') return null
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function providerDetail(body: unknown) {
  const value = record(body)
  const code = text(value.code)
  const message = text(value.message || value.response_description || value.error).slice(0, 180)
  return { code, message }
}

function assertConfigured(config: VtpassPhase0Config) {
  if (!config.credentialsReady) {
    throw new VtpassClientError({
      code: 'VTPASS_NOT_CONFIGURED',
      message: 'VTpass credentials are not configured.',
      status: 503,
    })
  }
}

function assertPurchaseAllowed(config: VtpassPhase0Config) {
  assertConfigured(config)
  if (!config.canVend) {
    throw new VtpassClientError({
      code: 'VTPASS_VENDING_DISABLED',
      message: config.environment === 'sandbox'
        ? 'VTpass sandbox vending is disabled.'
        : 'VTpass live vending is disabled.',
      status: 503,
    })
  }
}

function normalizePhone(value: unknown, environment: VtpassPhase0Config['environment']) {
  let phone = text(value).replace(/[\s()-]/g, '')
  if (phone.startsWith('+234')) phone = `0${phone.slice(4)}`
  else if (phone.startsWith('234') && phone.length === 13) phone = `0${phone.slice(3)}`
  const normalNigerian = /^0\d{10}$/.test(phone)
  const sandboxScenario = environment === 'sandbox' && /^[2345]\d{11}$/.test(phone)
  if (!normalNigerian && !sandboxScenario) {
    throw new VtpassClientError({
      code: 'VTPASS_INVALID_PHONE',
      message: 'Enter a valid Nigerian phone number.',
      status: 400,
    })
  }
  return phone
}

function normalizeDataRecipient(value: unknown, serviceId: string, environment: VtpassPhase0Config['environment']) {
  const recipient = text(value).replace(/[\s()-]/g, '')
  if (environment === 'sandbox') {
    const expected = serviceId === 'spectranet' ? '1212121212' : '08011111111'
    if (recipient !== expected) {
      throw new VtpassClientError({ code: 'VTPASS_INVALID_PHONE', message: `Use VTpass sandbox test account ${expected}.`, status: 400 })
    }
    return recipient
  }
  return normalizePhone(recipient, environment)
}

function normalizeAmount(value: unknown) {
  const raw = text(value)
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_AMOUNT', message: 'Enter a valid Naira amount.', status: 400 })
  }
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_AMOUNT', message: 'Enter a valid Naira amount.', status: 400 })
  }
  return amount
}

function normalizeAirtimeServiceId(value: unknown) {
  const serviceId = text(value).toLowerCase()
  if (!AIRTIME_SERVICE_IDS.has(serviceId)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_SERVICE', message: 'Unsupported Airtime network.', status: 400 })
  }
  return serviceId
}

function normalizeDataServiceId(value: unknown) {
  const serviceId = text(value).toLowerCase()
  if (!CATALOG_SERVICE_ID_PATTERN.test(serviceId)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_SERVICE', message: 'Unsupported Data network.', status: 400 })
  }
  return serviceId
}

function normalizeCatalogServiceId(value: unknown, label = 'service') {
  const serviceId = text(value).toLowerCase()
  if (!CATALOG_SERVICE_ID_PATTERN.test(serviceId)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_SERVICE', message: `Unsupported ${label}.`, status: 400 })
  }
  return serviceId
}

function normalizeBillerCode(value: unknown, label: string) {
  const billersCode = text(value).replace(/\D/g, '')
  if (!/^\d{8,15}$/.test(billersCode)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_ACCOUNT', message: `Enter a valid ${label}.`, status: 400 })
  }
  return billersCode
}

function normalizeMeterType(value: unknown) {
  const type = text(value).toLowerCase()
  if (type !== 'prepaid' && type !== 'postpaid') {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_VARIATION', message: 'Select prepaid or postpaid.', status: 400 })
  }
  return type as 'prepaid' | 'postpaid'
}

function normalizeVariationCode(value: unknown) {
  const variationCode = text(value)
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(variationCode)) {
    throw new VtpassClientError({ code: 'VTPASS_INVALID_VARIATION', message: 'Select a valid Data plan.', status: 400 })
  }
  return variationCode
}

function lagosTimePrefix(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}`
}

export function createVtpassRequestId(date = new Date(), suffix = randomBytes(8).toString('hex')) {
  const prefix = lagosTimePrefix(date)
  const cleanSuffix = text(suffix).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)
  if (!/^\d{12}$/.test(prefix) || !cleanSuffix) throw new Error('Could not generate a valid VTpass request ID.')
  return `${prefix}${cleanSuffix}`
}

function assertPurchaseRequestIdDate(requestId: string, date: Date) {
  if (requestId.slice(0, 8) !== lagosTimePrefix(date).slice(0, 8)) {
    throw new VtpassClientError({
      code: 'VTPASS_INVALID_REQUEST_ID_DATE',
      message: 'VTpass purchase request ID must use today\'s Lagos date.',
      status: 400,
    })
  }
}

function normalizeRequestId(value: unknown) {
  const requestId = text(value)
  if (!/^\d{12}[a-zA-Z0-9]{0,40}$/.test(requestId)) {
    throw new VtpassClientError({
      code: 'VTPASS_INVALID_REQUEST_ID',
      message: 'VTpass request ID is invalid.',
      status: 400,
    })
  }
  return requestId
}

export function normalizeVtpassTransaction(body: unknown, fallbackRequestId = ''): VtpassTransactionResult {
  const root = record(body)
  const transaction = record(record(root.content).transactions)
  const providerCode = text(root.code)
  const providerStatus = text(transaction.status).toLowerCase()
  const requestId = text(root.requestId || root.request_id || fallbackRequestId)
  const purchasedCode = text(root.purchased_code || root.token || transaction.extras).slice(0, 4000)
  const common = {
    providerCode,
    providerStatus,
    responseDescription: text(root.response_description).slice(0, 180),
    requestId,
    transactionId: text(transaction.transactionId || transaction.transaction_id),
    productName: text(transaction.product_name),
    recipient: text(transaction.unique_element),
    amountNgn: finiteNumber(root.amount ?? transaction.amount),
    purchasedCode,
  }

  if (providerCode === '040' || providerStatus === 'reversed') {
    return { ...common, status: 'reversed', retryable: false, requeryRequired: false }
  }
  if (['000', '001'].includes(providerCode) && providerStatus === 'delivered') {
    return { ...common, status: 'delivered', retryable: false, requeryRequired: false }
  }
  if (FAILURE_CODES.has(providerCode) || providerStatus === 'failed') {
    return {
      ...common,
      status: 'failed',
      retryable: RETRYABLE_FAILURE_CODES.has(providerCode),
      requeryRequired: false,
    }
  }
  if (PENDING_CODES.has(providerCode) || PENDING_STATUSES.has(providerStatus)) {
    return { ...common, status: 'pending', retryable: true, requeryRequired: true }
  }
  // VTpass explicitly requires unclear and unexpected transaction responses to
  // remain pending until a requery establishes a final state.
  return { ...common, status: 'pending', retryable: true, requeryRequired: true }
}

export function createVtpassClient(options: VtpassClientOptions) {
  const { config } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 15_000)
  const now = options.now ?? (() => new Date())
  const requestSuffix = options.requestSuffix ?? (() => randomBytes(8).toString('hex'))

  async function requestJson(path: string, method: 'GET' | 'POST', payload?: Record<string, unknown>, outcomeSensitive = false) {
    assertConfigured(config)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const headers: Record<string, string> = {
      'api-key': config.apiKey,
      accept: 'application/json',
    }
    if (method === 'GET') headers['public-key'] = config.publicKey
    else {
      headers['secret-key'] = config.secretKey
      headers['content-type'] = 'application/json'
    }
    try {
      const response = await fetchImpl(`${config.apiBase}${path}`, {
        method,
        headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal,
      })
      const body = await response.json().catch(() => null)
      const detail = providerDetail(body)
      if ([401, 403].includes(response.status) || ['021', '022', '023', '024', '027', '087'].includes(detail.code)) {
        throw new VtpassClientError({
          code: 'VTPASS_ACCESS_DENIED',
          message: detail.message || 'VTpass rejected this account or its credentials.',
          status: response.status || 503,
          providerCode: detail.code,
        })
      }
      if (!response.ok && !detail.code) {
        throw new VtpassClientError({
          code: outcomeSensitive ? 'VTPASS_OUTCOME_UNKNOWN' : 'VTPASS_PROVIDER_UNAVAILABLE',
          message: `VTpass returned HTTP ${response.status}.`,
          status: 503,
          retryable: true,
          outcomeUnknown: outcomeSensitive,
        })
      }
      return { body, httpStatus: response.status }
    } catch (error) {
      if (error instanceof VtpassClientError) throw error
      const timeoutError = error instanceof Error && error.name === 'AbortError'
      throw new VtpassClientError({
        code: outcomeSensitive ? 'VTPASS_OUTCOME_UNKNOWN' : timeoutError ? 'VTPASS_TIMEOUT' : 'VTPASS_PROVIDER_UNAVAILABLE',
        message: outcomeSensitive
          ? 'VTpass did not return a conclusive transaction response. Requery before retrying.'
          : timeoutError
            ? 'VTpass request timed out.'
            : 'VTpass is temporarily unavailable.',
        status: 503,
        retryable: true,
        outcomeUnknown: outcomeSensitive,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  async function getWalletBalance() {
    const { body } = await requestJson('/api/balance', 'GET')
    const balance = finiteNumber(record(record(body).contents).balance)
    if (balance === null || balance < 0) {
      throw new VtpassClientError({
        code: 'VTPASS_INVALID_RESPONSE',
        message: 'VTpass wallet balance response was invalid.',
        status: 503,
        retryable: true,
      })
    }
    return balance
  }

  async function listServiceCategories(): Promise<VtpassServiceCategory[]> {
    const { body } = await requestJson('/api/service-categories', 'GET')
    const content = record(body).content
    if (!Array.isArray(content)) throw new VtpassClientError({ code: 'VTPASS_INVALID_RESPONSE', message: 'VTpass service categories response was invalid.', status: 503, retryable: true })
    return content.flatMap((item): VtpassServiceCategory[] => {
      const value = record(item)
      const identifier = text(value.identifier).toLowerCase()
      const name = text(value.name)
      return identifier && name ? [{ identifier, name }] : []
    })
  }

  async function listAirtimeServices(): Promise<VtpassService[]> {
    const { body } = await requestJson('/api/services?identifier=airtime', 'GET')
    const content = record(body).content
    if (!Array.isArray(content)) throw new VtpassClientError({ code: 'VTPASS_INVALID_RESPONSE', message: 'VTpass Airtime catalog response was invalid.', status: 503, retryable: true })
    return content.flatMap((item): VtpassService[] => {
      const value = record(item)
      const serviceId = text(value.serviceID).toLowerCase()
      const name = text(value.name)
      if (!AIRTIME_SERVICE_IDS.has(serviceId) || !name) return []
      const imageUrl = text(value.image)
      return [{
        serviceId,
        name,
        minimumAmount: finiteNumber(value.minimium_amount ?? value.minimum_amount),
        maximumAmount: finiteNumber(value.maximum_amount),
        convenienceFee: text(value.convinience_fee ?? value.convenience_fee),
        productType: text(value.product_type),
        imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : '',
      }]
    })
  }

  async function listDataServices(): Promise<VtpassService[]> {
    const { body } = await requestJson('/api/services?identifier=data', 'GET')
    const content = record(body).content
    if (!Array.isArray(content)) throw new VtpassClientError({ code: 'VTPASS_INVALID_RESPONSE', message: 'VTpass Data catalog response was invalid.', status: 503, retryable: true })
    return content.flatMap((item): VtpassService[] => {
      const value = record(item)
      const serviceId = text(value.serviceID).toLowerCase()
      const name = text(value.name)
      if (!CATALOG_SERVICE_ID_PATTERN.test(serviceId) || !name) return []
      const imageUrl = text(value.image)
      return [{
        serviceId,
        name,
        minimumAmount: finiteNumber(value.minimium_amount ?? value.minimum_amount),
        maximumAmount: finiteNumber(value.maximum_amount),
        convenienceFee: text(value.convinience_fee ?? value.convenience_fee),
        productType: text(value.product_type),
        imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : '',
      }]
    })
  }

  async function listServices(identifierInput: 'tv-subscription' | 'electricity-bill'): Promise<VtpassService[]> {
    const identifier = identifierInput === 'tv-subscription' ? 'tv-subscription' : 'electricity-bill'
    const { body } = await requestJson(`/api/services?identifier=${encodeURIComponent(identifier)}`, 'GET')
    const content = record(body).content
    if (!Array.isArray(content)) throw new VtpassClientError({ code: 'VTPASS_INVALID_RESPONSE', message: 'VTpass service catalog response was invalid.', status: 503, retryable: true })
    return content.flatMap((item): VtpassService[] => {
      const value = record(item)
      const serviceId = text(value.serviceID).toLowerCase()
      const name = text(value.name)
      if (!CATALOG_SERVICE_ID_PATTERN.test(serviceId) || !name) return []
      const imageUrl = text(value.image)
      return [{
        serviceId,
        name,
        minimumAmount: finiteNumber(value.minimium_amount ?? value.minimum_amount),
        maximumAmount: finiteNumber(value.maximum_amount),
        convenienceFee: text(value.convinience_fee ?? value.convenience_fee),
        productType: text(value.product_type),
        imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : '',
      }]
    })
  }

  async function listServiceVariations(serviceIdInput: string): Promise<VtpassVariation[]> {
    const serviceId = normalizeCatalogServiceId(serviceIdInput)
    const { body } = await requestJson(`/api/service-variations?serviceID=${encodeURIComponent(serviceId)}`, 'GET')
    const content = record(record(body).content)
    const variations = Array.isArray(content.variations)
      ? content.variations
      : Array.isArray(content.varations) ? content.varations : null
    if (!variations) throw new VtpassClientError({ code: 'VTPASS_INVALID_RESPONSE', message: 'VTpass plans response was invalid.', status: 503, retryable: true })
    const parsed = variations.flatMap((item): VtpassVariation[] => {
      const value = record(item)
      const variationCode = text(value.variation_code)
      const name = text(value.name).slice(0, 140)
      const amount = finiteNumber(value.variation_amount)
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(variationCode) || !name || amount === null || amount <= 0) return []
      return [{ variationCode, name, amount, fixedPrice: text(value.fixedPrice).toLowerCase() === 'yes' }]
    })
    return [...new Map(parsed.map(variation => [variation.variationCode, variation])).values()]
  }

  async function verifyCustomer(input: { category: 'tv' | 'electricity'; serviceId: string; billersCode: string; variationCode?: string }): Promise<VtpassCustomerVerification> {
    const serviceID = normalizeCatalogServiceId(input.serviceId, input.category === 'tv' ? 'TV provider' : 'electricity provider')
    const billersCode = normalizeBillerCode(input.billersCode, input.category === 'tv' ? 'smartcard number' : 'meter number')
    const payload: Record<string, unknown> = { billersCode, serviceID }
    if (input.category === 'electricity') payload.type = normalizeMeterType(input.variationCode)
    const { body } = await requestJson('/api/merchant-verify', 'POST', payload)
    const root = record(body)
    const content = record(root.content)
    const code = text(root.code || root.response_description)
    const wrongBiller = content.WrongBillersCode === true || text(content.WrongBillersCode).toLowerCase() === 'true'
    const canVendValue = content.Can_Vend
    const canVend = canVendValue === undefined || canVendValue === null || canVendValue === '' || canVendValue === true || ['true', 'yes', '1'].includes(text(canVendValue).toLowerCase())
    if (!['000', '020'].includes(code) || wrongBiller || !canVend) {
      throw new VtpassClientError({
        code: 'VTPASS_CUSTOMER_NOT_VERIFIED',
        message: text(root.response_description || content.error || content.message) || `VTpass could not verify this ${input.category === 'tv' ? 'smartcard' : 'meter'}.`,
        status: 400,
        providerCode: code,
      })
    }
    return {
      valid: true,
      customerName: text(content.Customer_Name || content.customer_name || content.CustomerName).slice(0, 140),
      customerAddress: text(content.Address || content.address).slice(0, 220),
      currentBouquet: text(content.Current_Bouquet || content.current_bouquet).slice(0, 140),
      renewalAmount: finiteNumber(content.Renewal_Amount || content.renewal_amount),
      minimumAmount: finiteNumber(content.Min_Purchase_Amount ?? content.Minimum_Amount ?? content.minimum_amount),
      maximumAmount: finiteNumber(content.MAX_Purchase_Amount ?? content.Maximum_Amount ?? content.maximum_amount),
    }
  }

  async function purchaseAirtime(input: { serviceId: string; phone: string; amountNgn: string | number; requestId?: string }) {
    assertPurchaseAllowed(config)
    const currentTime = now()
    const requestId = input.requestId
      ? normalizeRequestId(input.requestId)
      : createVtpassRequestId(currentTime, requestSuffix())
    assertPurchaseRequestIdDate(requestId, currentTime)
    const serviceID = normalizeAirtimeServiceId(input.serviceId)
    const phone = normalizePhone(input.phone, config.environment)
    const amount = normalizeAmount(input.amountNgn)
    const { body } = await requestJson('/api/pay', 'POST', { request_id: requestId, serviceID, amount, phone }, true)
    return normalizeVtpassTransaction(body, requestId)
  }


  async function purchaseData(input: { serviceId: string; variationCode: string; phone: string; amountNgn: string | number; requestId?: string }) {
    assertPurchaseAllowed(config)
    const currentTime = now()
    const requestId = input.requestId
      ? normalizeRequestId(input.requestId)
      : createVtpassRequestId(currentTime, requestSuffix())
    assertPurchaseRequestIdDate(requestId, currentTime)
    const serviceID = normalizeDataServiceId(input.serviceId)
    const variation_code = normalizeVariationCode(input.variationCode)
    const phone = normalizeDataRecipient(input.phone, serviceID, config.environment)
    const amount = normalizeAmount(input.amountNgn)
    const { body } = await requestJson('/api/pay', 'POST', {
      request_id: requestId,
      serviceID,
      billersCode: phone,
      variation_code,
      amount,
      phone,
      ...(serviceID === 'spectranet' ? { quantity: 1 } : {}),
    }, true)
    return normalizeVtpassTransaction(body, requestId)
  }

  async function purchaseTv(input: { serviceId: string; variationCode: string; smartcard: string; contactPhone: string; amountNgn: string | number; requestId?: string }) {
    assertPurchaseAllowed(config)
    const currentTime = now()
    const requestId = input.requestId ? normalizeRequestId(input.requestId) : createVtpassRequestId(currentTime, requestSuffix())
    assertPurchaseRequestIdDate(requestId, currentTime)
    const serviceID = normalizeCatalogServiceId(input.serviceId, 'TV provider')
    const billersCode = normalizeBillerCode(input.smartcard, 'smartcard number')
    const variation_code = normalizeVariationCode(input.variationCode)
    const phone = normalizePhone(input.contactPhone, config.environment)
    const amount = normalizeAmount(input.amountNgn)
    const { body } = await requestJson('/api/pay', 'POST', {
      request_id: requestId, serviceID, billersCode, variation_code, amount, phone,
      ...(serviceID === 'dstv' || serviceID === 'gotv' ? { subscription_type: 'change', quantity: 1 } : {}),
    }, true)
    return normalizeVtpassTransaction(body, requestId)
  }

  async function purchaseElectricity(input: { serviceId: string; meterType: string; meterNumber: string; contactPhone: string; amountNgn: string | number; requestId?: string }) {
    assertPurchaseAllowed(config)
    const currentTime = now()
    const requestId = input.requestId ? normalizeRequestId(input.requestId) : createVtpassRequestId(currentTime, requestSuffix())
    assertPurchaseRequestIdDate(requestId, currentTime)
    const serviceID = normalizeCatalogServiceId(input.serviceId, 'electricity provider')
    const billersCode = normalizeBillerCode(input.meterNumber, 'meter number')
    const variation_code = normalizeMeterType(input.meterType)
    const phone = normalizePhone(input.contactPhone, config.environment)
    const amount = normalizeAmount(input.amountNgn)
    const { body } = await requestJson('/api/pay', 'POST', { request_id: requestId, serviceID, billersCode, variation_code, amount, phone }, true)
    return normalizeVtpassTransaction(body, requestId)
  }

  async function requeryTransaction(requestIdInput: string) {
    const requestId = normalizeRequestId(requestIdInput)
    const { body } = await requestJson('/api/requery', 'POST', { request_id: requestId })
    return normalizeVtpassTransaction(body, requestId)
  }

  return {
    getWalletBalance,
    listServiceCategories,
    listAirtimeServices,
    listDataServices,
    listTvServices: () => listServices('tv-subscription'),
    listElectricityServices: () => listServices('electricity-bill'),
    listServiceVariations,
    verifyCustomer,
    purchaseAirtime,
    purchaseData,
    purchaseTv,
    purchaseElectricity,
    requeryTransaction,
  }
}

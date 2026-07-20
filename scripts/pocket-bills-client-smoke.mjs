import assert from 'node:assert/strict'
import {
  PocketBillsApiError,
  confirmPocketAirtime,
  parsePocketBillIntent,
  parsePocketBillsAvailability,
  processPocketBillRefund,
  quotePocketData,
  quotePocketAirtime,
  readPocketDataCatalog,
} from '../src/pocket/api/pocketBillsClient.ts'

const intent = {
  id: 'bill-test-1', requestId: '202607191200test', state: 'quoted', category: 'airtime',
  serviceId: 'mtn', serviceName: 'MTN Airtime', phone: '08011111111', amountNgn: '100',
  variationCode: '', variationName: '',
  amountUsdc: '0.071429', fxRateNgnPerUsdc: '1400', network: 'base',
  treasuryAddress: '0x1111111111111111111111111111111111111111',
  payerWallet: '0x2222222222222222222222222222222222222222', quoteExpiresAt: Date.now() + 60_000,
  txHash: '', providerStatus: '', providerDescription: '', purchasedCode: 'Token : 26362054405982757802', failureReason: '', createdAt: Date.now(), updatedAt: Date.now(),
}

assert.deepEqual(parsePocketBillsAvailability({ bills: { enabled: true, environment: 'sandbox', categories: ['airtime', 'data'] } }), { enabled: true, environment: 'sandbox', airtimeEnabled: true, dataEnabled: true, tvEnabled: false, electricityEnabled: false })
assert.deepEqual(parsePocketBillsAvailability({}), { enabled: false, environment: 'sandbox', airtimeEnabled: false, dataEnabled: false, tvEnabled: false, electricityEnabled: false })
assert.equal(parsePocketBillIntent(intent).amountUsdc, '0.071429')
assert.equal(parsePocketBillIntent(intent).purchasedCode, 'Token : 26362054405982757802')
assert.throws(() => parsePocketBillIntent({ ...intent, state: 'invented' }), PocketBillsApiError)

let quoteRequest
const quoteFetcher = async (url, options) => {
  quoteRequest = { url, options, body: JSON.parse(options.body) }
  return new Response(JSON.stringify({ ok: true, data: { intent, replayed: false } }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const quoted = await quotePocketAirtime({
  accessToken: 'privy-token', serviceId: 'mtn', phone: '08011111111', amountNgn: '100',
  payerWallet: intent.payerWallet, idempotencyKey: 'airtime:client:quote:0001', fetcher: quoteFetcher,
})
assert.equal(quoted.intent.id, intent.id)
assert.equal(quoteRequest.url, '/api/pocket/bills/quote')
assert.equal(quoteRequest.options.headers.authorization, 'Bearer privy-token')
assert.equal(quoteRequest.options.headers['idempotency-key'], 'airtime:client:quote:0001')
assert.deepEqual(quoteRequest.body, { service_id: 'mtn', phone: '08011111111', amount_ngn: '100', payer_wallet: intent.payerWallet })

let catalogRequest
const catalogFetcher = async (url, options) => {
  catalogRequest = { url, options }
  return new Response(JSON.stringify({ ok: true, data: { variations: [{ variationCode: 'mtn-100mb-100', name: 'N100 100MB - 24 hrs', amountNgn: '100.00', available: true }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const catalog = await readPocketDataCatalog({ accessToken: 'privy-token', serviceId: 'mtn-data', fetcher: catalogFetcher })
assert.equal(catalog.variations[0].variationCode, 'mtn-100mb-100')
assert.equal(catalog.variations[0].available, true)
assert.equal(catalogRequest.url, '/api/pocket/bills/catalog?category=data&service_id=mtn-data')
assert.equal(catalogRequest.options.headers.authorization, 'Bearer privy-token')

let dataQuoteBody
const dataQuoteFetcher = async (_url, options) => {
  dataQuoteBody = JSON.parse(options.body)
  return new Response(JSON.stringify({ ok: true, data: { intent: { ...intent, category: 'data', serviceId: 'mtn-data', serviceName: 'MTN Data', variationCode: 'mtn-100mb-100', variationName: 'N100 100MB - 24 hrs' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const dataQuote = await quotePocketData({ accessToken: 'privy-token', serviceId: 'mtn-data', variationCode: 'mtn-100mb-100', phone: '08011111111', payerWallet: intent.payerWallet, fetcher: dataQuoteFetcher })
assert.equal(dataQuote.intent.category, 'data')
assert.deepEqual(dataQuoteBody, { category: 'data', service_id: 'mtn-data', variation_code: 'mtn-100mb-100', phone: '08011111111', payer_wallet: intent.payerWallet })

let confirmBody
const confirmFetcher = async (_url, options) => {
  confirmBody = JSON.parse(options.body)
  return new Response(JSON.stringify({ ok: true, data: { intent: { ...intent, state: 'delivered', txHash: `0x${'a'.repeat(64)}` } } }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const confirmed = await confirmPocketAirtime({ accessToken: 'privy-token', intentId: intent.id, txHash: `0x${'a'.repeat(64)}`, fetcher: confirmFetcher })
assert.equal(confirmed.state, 'delivered')
assert.equal(confirmBody.action, 'confirm')
assert.equal(confirmBody.intent_id, intent.id)

const pendingFetcher = async () => new Response(JSON.stringify({ ok: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'Still confirming.', retryable: true } }), { status: 409, headers: { 'content-type': 'application/json' } })
await assert.rejects(
  () => confirmPocketAirtime({ accessToken: 'privy-token', intentId: intent.id, txHash: `0x${'b'.repeat(64)}`, fetcher: pendingFetcher }),
  error => error instanceof PocketBillsApiError && error.code === 'CONFIRMATION_REQUIRED' && error.retryable && error.status === 409,
)

const expiredQuoteFetcher = async () => new Response(JSON.stringify({ ok: false, error: { code: 'VERSION_CONFLICT', reason: 'BILLS_QUOTE_EXPIRED', message: 'Bill quote expired.', retryable: false } }), { status: 409, headers: { 'content-type': 'application/json' } })
await assert.rejects(
  () => quotePocketAirtime({ accessToken: 'privy-token', serviceId: 'mtn', phone: '08011111111', amountNgn: '100', payerWallet: intent.payerWallet, fetcher: expiredQuoteFetcher }),
  error => error instanceof PocketBillsApiError && error.code === 'BILLS_QUOTE_EXPIRED' && error.status === 409,
)

let refundRequest
const refundFetcher = async (url, options) => {
  refundRequest = { url, options, body: JSON.parse(options.body) }
  return new Response(JSON.stringify({
    ok: true,
    data: { state: 'refund_submitted', intent: { ...intent, state: 'refund_submitted' } },
  }), { status: 202, headers: { 'content-type': 'application/json' } })
}
const refund = await processPocketBillRefund({ accessToken: 'privy-token', intentId: intent.id, fetcher: refundFetcher })
assert.equal(refund.intent.state, 'refund_submitted')
assert.equal(refundRequest.url, '/api/pocket/bills/refund')
assert.equal(refundRequest.options.headers.authorization, 'Bearer privy-token')
assert.deepEqual(refundRequest.body, { intent_id: intent.id })

console.log('Pocket Bills client smoke test passed: availability, response validation, auth, idempotency, exact payloads, and retryable confirmation errors are deterministic.')

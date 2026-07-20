import assert from 'node:assert/strict'
import {
  PocketBillsApiError,
  confirmPocketAirtime,
  parsePocketBillIntent,
  parsePocketBillsAvailability,
  processPocketBillRefund,
  quotePocketAirtime,
} from '../src/pocket/api/pocketBillsClient.ts'

const intent = {
  id: 'bill-test-1', requestId: '202607191200test', state: 'quoted', category: 'airtime',
  serviceId: 'mtn', serviceName: 'MTN Airtime', phone: '08011111111', amountNgn: '100',
  amountUsdc: '0.071429', fxRateNgnPerUsdc: '1400', network: 'base',
  treasuryAddress: '0x1111111111111111111111111111111111111111',
  payerWallet: '0x2222222222222222222222222222222222222222', quoteExpiresAt: Date.now() + 60_000,
  txHash: '', providerStatus: '', providerDescription: '', failureReason: '', createdAt: Date.now(), updatedAt: Date.now(),
}

assert.deepEqual(parsePocketBillsAvailability({ bills: { enabled: true, environment: 'sandbox', minNgn: 50, maxNgn: 5000 } }), { enabled: true, environment: 'sandbox', minNgn: 50, maxNgn: 5000 })
assert.deepEqual(parsePocketBillsAvailability({}), { enabled: false, environment: 'sandbox', minNgn: 100, maxNgn: 1000 })
assert.equal(parsePocketBillIntent(intent).amountUsdc, '0.071429')
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

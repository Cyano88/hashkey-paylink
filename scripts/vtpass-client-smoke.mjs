import assert from 'node:assert/strict'
import {
  VtpassClientError,
  createVtpassClient,
  createVtpassRequestId,
  normalizeVtpassTransaction,
} from '../api/vtpass-client.ts'
import { readVtpassPhase0Config } from '../api/vtpass-config.ts'

const env = {
  VTPASS_ENVIRONMENT: 'sandbox',
  VTPASS_API_BASE: 'https://sandbox.vtpass.com',
  VTPASS_API_KEY: 'static-api-key',
  VTPASS_PUBLIC_KEY: 'PK_public',
  VTPASS_SECRET_KEY: 'SK_secret',
  POCKET_BILLS_ENABLED: 'false',
  VTPASS_SANDBOX_VENDING_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'false',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'false',
  POCKET_BILLS_TREASURY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POCKET_BILLS_MIN_NGN: '100',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:test',
}

const config = readVtpassPhase0Config(env)
assert.equal(config.canSandboxVend, true)

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function queuedClient(responses, calls = []) {
  return createVtpassClient({
    config,
    now: () => new Date('2026-07-19T10:05:00.000Z'),
    requestSuffix: () => 'fixed123',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init })
      const next = responses.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error('Unexpected fetch')
      return next
    },
  })
}

assert.equal(createVtpassRequestId(new Date('2026-07-19T10:05:00.000Z'), 'abc-123'), '202607191105abc123')

const readCalls = []
const readClient = queuedClient([
  jsonResponse({ code: 1, contents: { balance: 2000000 } }),
  jsonResponse({ response_description: '000', content: [{ identifier: 'airtime', name: 'Airtime Recharge' }] }),
  jsonResponse({
    response_description: '000',
    content: [
      { serviceID: 'mtn', name: 'MTN Airtime', minimium_amount: '50', maximum_amount: '50000', convinience_fee: '0 %', product_type: 'flexible', image: 'https://sandbox.vtpass.com/mtn.png' },
      { serviceID: 'dstv', name: 'Not airtime' },
    ],
  }),
], readCalls)
assert.equal(await readClient.getWalletBalance(), 2000000)
assert.deepEqual(await readClient.listServiceCategories(), [{ identifier: 'airtime', name: 'Airtime Recharge' }])
assert.deepEqual(await readClient.listAirtimeServices(), [{
  serviceId: 'mtn',
  name: 'MTN Airtime',
  minimumAmount: 50,
  maximumAmount: 50000,
  convenienceFee: '0 %',
  productType: 'flexible',
  imageUrl: 'https://sandbox.vtpass.com/mtn.png',
}])
for (const call of readCalls) {
  assert.equal(call.init.method, 'GET')
  assert.equal(call.init.headers['api-key'], 'static-api-key')
  assert.equal(call.init.headers['public-key'], 'PK_public')
  assert.equal(call.init.headers['secret-key'], undefined)
}

const dataReadCalls = []
const dataReadClient = queuedClient([
  jsonResponse({ response_description: '000', content: [
    { serviceID: 'mtn-data', name: 'MTN Data', minimium_amount: '1', maximum_amount: '1000000', convinience_fee: '0 %', product_type: 'fix', image: 'https://sandbox.vtpass.com/mtn-data.png' },
    { serviceID: 'smile-direct', name: 'Smile Payment' },
  ] }),
  jsonResponse({ response_description: '000', content: { serviceID: 'mtn-data', variations: [
    { variation_code: 'mtn-100mb-100', name: 'N100 100MB - 24 hrs', variation_amount: '100.00', fixedPrice: 'Yes' },
    { variation_code: 'invalid plan', name: 'Ignored', variation_amount: '200.00', fixedPrice: 'Yes' },
  ] } }),
], dataReadCalls)
assert.deepEqual(await dataReadClient.listDataServices(), [{ serviceId: 'mtn-data', name: 'MTN Data', minimumAmount: 1, maximumAmount: 1000000, convenienceFee: '0 %', productType: 'fix', imageUrl: 'https://sandbox.vtpass.com/mtn-data.png' }])
assert.deepEqual(await dataReadClient.listServiceVariations('mtn-data'), [{ variationCode: 'mtn-100mb-100', name: 'N100 100MB - 24 hrs', amount: 100, fixedPrice: true }])

const deliveredCalls = []
const deliveredClient = queuedClient([jsonResponse({
  code: '000',
  content: { transactions: { status: 'delivered', transactionId: 'tx-1', product_name: 'MTN Airtime VTU', unique_element: '08011111111', amount: '100' } },
  response_description: 'TRANSACTION SUCCESSFUL',
  requestId: '202607191105fixed123',
  amount: 100,
  purchased_code: '',
})], deliveredCalls)
const delivered = await deliveredClient.purchaseAirtime({ serviceId: 'mtn', phone: '08011111111', amountNgn: '100' })
assert.equal(delivered.status, 'delivered')
assert.equal(delivered.requeryRequired, false)
assert.equal(delivered.transactionId, 'tx-1')
assert.equal(deliveredCalls[0].url, 'https://sandbox.vtpass.com/api/pay')
assert.equal(deliveredCalls[0].init.method, 'POST')
assert.equal(deliveredCalls[0].init.headers['secret-key'], 'SK_secret')
assert.equal(deliveredCalls[0].init.headers['public-key'], undefined)
assert.deepEqual(JSON.parse(deliveredCalls[0].init.body), {
  request_id: '202607191105fixed123',
  serviceID: 'mtn',
  amount: 100,
  phone: '08011111111',
})

const dataPurchaseCalls = []
const dataPurchaseClient = queuedClient([jsonResponse({
  code: '000',
  content: { transactions: { status: 'delivered', transactionId: 'data-tx-1', product_name: 'MTN Data', unique_element: '08011111111', amount: '100' } },
  response_description: 'TRANSACTION SUCCESSFUL',
  requestId: '202607191105fixed123',
  amount: 100,
})], dataPurchaseCalls)
const dataDelivered = await dataPurchaseClient.purchaseData({ serviceId: 'mtn-data', variationCode: 'mtn-100mb-100', phone: '08011111111', amountNgn: '100' })
assert.equal(dataDelivered.status, 'delivered')
assert.deepEqual(JSON.parse(dataPurchaseCalls[0].init.body), {
  request_id: '202607191105fixed123',
  serviceID: 'mtn-data',
  billersCode: '08011111111',
  variation_code: 'mtn-100mb-100',
  amount: 100,
  phone: '08011111111',
})

const pending = normalizeVtpassTransaction({ code: '000', content: { transactions: { status: 'pending' } } }, '202607191105pending')
assert.equal(pending.status, 'pending')
assert.equal(pending.requeryRequired, true)

const processing = normalizeVtpassTransaction({ code: '099', response_description: 'TRANSACTION IS PROCESSING' }, '202607191105processing')
assert.equal(processing.status, 'pending')
assert.equal(processing.requeryRequired, true)

const unexpected = normalizeVtpassTransaction({ code: '777', response_description: 'UNKNOWN' }, '202607191105unknown')
assert.equal(unexpected.status, 'pending')
assert.equal(unexpected.requeryRequired, true)

const failed = normalizeVtpassTransaction({ code: '016', content: { transactions: { status: 'failed' } } }, '202607191105failed')
assert.equal(failed.status, 'failed')
assert.equal(failed.requeryRequired, false)

const retryableFailure = normalizeVtpassTransaction({ code: '030', response_description: 'BILLER NOT REACHABLE' }, '202607191105retry')
assert.equal(retryableFailure.status, 'failed')
assert.equal(retryableFailure.retryable, true)

const reversed = normalizeVtpassTransaction({ code: '040', content: { transactions: { status: 'reversed' } } }, '202607191105reversed')
assert.equal(reversed.status, 'reversed')
assert.equal(reversed.requeryRequired, false)

const requeryCalls = []
const requeryClient = queuedClient([jsonResponse({ code: '001', content: { transactions: { status: 'delivered', transactionId: 'tx-2' } } })], requeryCalls)
const requeried = await requeryClient.requeryTransaction('202607191105fixed123')
assert.equal(requeried.status, 'delivered')
assert.deepEqual(JSON.parse(requeryCalls[0].init.body), { request_id: '202607191105fixed123' })

const abortError = new Error('socket timed out')
abortError.name = 'AbortError'
const timeoutClient = queuedClient([abortError])
await assert.rejects(
  () => timeoutClient.purchaseAirtime({ serviceId: 'airtel', phone: '300000000000', amountNgn: 100 }),
  error => error instanceof VtpassClientError
    && error.code === 'VTPASS_OUTCOME_UNKNOWN'
    && error.outcomeUnknown
    && error.requeryRequired === undefined,
)

const authClient = queuedClient([jsonResponse({ code: '087', response_description: 'INVALID CREDENTIALS' }, 401)])
await assert.rejects(
  () => authClient.getWalletBalance(),
  error => error instanceof VtpassClientError
    && error.code === 'VTPASS_ACCESS_DENIED'
    && error.providerCode === '087'
    && !JSON.stringify(error).includes('SK_secret'),
)

const blockedConfig = readVtpassPhase0Config({ ...env, VTPASS_SANDBOX_VENDING_ENABLED: 'false' })
let blockedFetchCalled = false
const blockedClient = createVtpassClient({
  config: blockedConfig,
  fetchImpl: async () => {
    blockedFetchCalled = true
    return jsonResponse({})
  },
})
await assert.rejects(
  () => blockedClient.purchaseAirtime({ serviceId: 'mtn', phone: '08011111111', amountNgn: 100 }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_VENDING_DISABLED',
)
assert.equal(blockedFetchCalled, false)

await assert.rejects(
  () => deliveredClient.purchaseAirtime({ serviceId: 'dstv', phone: '08011111111', amountNgn: 100 }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_INVALID_SERVICE',
)
await assert.rejects(
  () => deliveredClient.purchaseAirtime({ serviceId: 'mtn', phone: 'invalid', amountNgn: 100 }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_INVALID_PHONE',
)
await assert.rejects(
  () => deliveredClient.purchaseAirtime({ serviceId: 'mtn', phone: '08011111111', amountNgn: 1001 }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_AMOUNT_ABOVE_LIMIT',
)
await assert.rejects(
  () => deliveredClient.purchaseAirtime({ serviceId: 'mtn', phone: '08011111111', amountNgn: 100, requestId: '202607181105older' }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_INVALID_REQUEST_ID_DATE',
)
await assert.rejects(
  () => dataPurchaseClient.purchaseData({ serviceId: 'mtn-data', variationCode: 'invalid plan', phone: '08011111111', amountNgn: 100 }),
  error => error instanceof VtpassClientError && error.code === 'VTPASS_INVALID_VARIATION',
)

console.log('VTpass client adapter smoke tests passed.')

import assert from 'node:assert/strict'
import { createHostedCheckoutsHandler, markHostedCheckoutNairaPayout, markHostedCheckoutPaid, resolveHostedCheckoutPartnerPolicy } from '../api/hosted-checkouts.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, { body, headers = {}, query = {} } = {}) {
  const response = responseRecorder()
  await handler({ method, body, headers, query }, response)
  return response
}

let store
let now = new Date('2026-07-19T12:00:00.000Z')
let createdCount = 0
const dependencies = {
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  policy: req => req.headers['x-api-key'] === 'partner-secret'
    ? { partnerId: 'polydesk', allowedOrigins: ['https://polydesk.trade'] }
    : null,
  notify: async () => undefined,
  prepareNaira: async () => { throw new Error('Unexpected Naira preparation.') },
  signingSecret: () => 'a-secure-test-secret-that-is-longer-than-thirty-two-characters',
  createId: () => createdCount++ === 0 ? 'chk_testcheckout1234' : `chk_testcheckout${createdCount.toString().padStart(4, '0')}`,
  now: () => now,
}
const handler = createHostedCheckoutsHandler(dependencies)
const valid = {
  kind: 'service',
  merchantName: 'PolyDesk',
  title: 'Market data',
  description: 'One hosted service request.',
  amount: '00.024000',
  network: 'base',
  recipient: '0x1111111111111111111111111111111111111111',
  memo: 'Market data request',
  returnUrl: 'https://polydesk.trade/portfolio',
  expiresInMinutes: 60,
}
const headers = { 'x-api-key': 'partner-secret', 'idempotency-key': 'partner:order:00000001' }

const previousPolicyMap = process.env.HASH_PAYLINK_PARTNER_API_KEYS
const previousSingleKey = process.env.HASH_PAYLINK_PARTNER_API_KEY
process.env.HASH_PAYLINK_PARTNER_API_KEYS = ''
process.env.HASH_PAYLINK_PARTNER_API_KEY = ''
assert.equal(await resolveHostedCheckoutPartnerPolicy({ headers: { 'x-api-key': 'toString' } }), null)
if (previousPolicyMap === undefined) delete process.env.HASH_PAYLINK_PARTNER_API_KEYS
else process.env.HASH_PAYLINK_PARTNER_API_KEYS = previousPolicyMap
if (previousSingleKey === undefined) delete process.env.HASH_PAYLINK_PARTNER_API_KEY
else process.env.HASH_PAYLINK_PARTNER_API_KEY = previousSingleKey

assert.equal((await request(handler, 'POST', { body: valid, headers: {} })).statusCode, 401)
assert.equal((await request(handler, 'POST', { body: { ...valid, returnUrl: 'https://evil.example' }, headers })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, kind: 'pos' }, headers })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, returnUrl: '' }, headers: { ...headers, 'idempotency-key': 'partner:order:no-return' } })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, amount: '0' }, headers: { ...headers, 'idempotency-key': 'partner:order:zero-amount' } })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, recipient: '0x0000000000000000000000000000000000000000' }, headers: { ...headers, 'idempotency-key': 'partner:order:zero-address' } })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, expiresInMinutes: 5.5 }, headers: { ...headers, 'idempotency-key': 'partner:order:fractional-expiry' } })).statusCode, 400)

store = {
  checkouts: {
    chk_stalecheckout123: {
      id: 'chk_stalecheckout123',
      createdAt: '2026-05-01T12:00:00.000Z',
      expiresAt: '2026-05-01T13:00:00.000Z',
    },
  },
  idempotency: { 'polydesk:stale-key': 'chk_stalecheckout123' },
}

const created = await request(handler, 'POST', { body: valid, headers })
assert.equal(created.statusCode, 201)
assert.equal(created.headers['cache-control'], 'no-store')
assert.equal(created.body.checkoutId, 'chk_testcheckout1234')
assert.equal(created.body.checkoutUrl, '/pay/c/chk_testcheckout1234')
assert.equal(created.body.replayed, false)
assert.equal(store.checkouts.chk_stalecheckout123, undefined)
assert.equal(store.idempotency['polydesk:stale-key'], undefined)

const replay = await request(handler, 'POST', { body: valid, headers })
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)

const conflict = await request(handler, 'POST', { body: { ...valid, amount: '0.048' }, headers })
assert.equal(conflict.statusCode, 409)
assert.match(conflict.body.error, /different checkout request/)

const lookup = await request(handler, 'GET', { query: { id: created.body.checkoutId } })
assert.equal(lookup.statusCode, 200)
assert.equal(lookup.body.checkout.kind, 'service')
assert.match(lookup.body.paymentUrl, /^\/pay\?/)
assert.match(lookup.body.paymentUrl, /src=service/)
assert.match(lookup.body.paymentUrl, /a=0\.024(?:&|$)/)
assert.match(lookup.body.paymentUrl, /id=0x[a-f0-9]{64}/)
assert.equal(JSON.stringify(lookup.body).includes('https://polydesk.trade'), false)

const solanaHeaders = { ...headers, 'idempotency-key': 'partner:order:solana-0001' }
const solanaCreated = await request(handler, 'POST', {
  body: { ...valid, network: 'solana', recipient: '4QW6qgaEvDZMaKJ8s6GDZjy3G7MQXM4mLrWjK1U8ovCE' },
  headers: solanaHeaders,
})
assert.equal(solanaCreated.statusCode, 400)

const multiHeaders = { ...headers, 'idempotency-key': 'partner:order:multi-network-0001' }
const multi = {
  ...valid,
  network: undefined,
  recipient: undefined,
  defaultNetwork: 'base',
  paymentOptions: [
    { network: 'base', recipient: '0x1111111111111111111111111111111111111111' },
    { network: 'arbitrum', recipient: '0x3333333333333333333333333333333333333333' },
    { network: 'arc', recipient: '0x4444444444444444444444444444444444444444' },
  ],
}
assert.equal((await request(handler, 'POST', {
  body: { ...multi, defaultNetwork: 'solana' },
  headers: { ...multiHeaders, 'idempotency-key': 'partner:order:invalid-default' },
})).statusCode, 400)
assert.equal((await request(handler, 'POST', {
  body: { ...multi, paymentOptions: [multi.paymentOptions[0], multi.paymentOptions[0]] },
  headers: { ...multiHeaders, 'idempotency-key': 'partner:order:duplicate-network' },
})).statusCode, 400)
const multiCreated = await request(handler, 'POST', { body: multi, headers: multiHeaders })
assert.equal(multiCreated.statusCode, 201)
const multiLookup = await request(handler, 'GET', { query: { id: multiCreated.body.checkoutId } })
assert.deepEqual(multiLookup.body.checkout.availableNetworks, ['base', 'arbitrum', 'arc'])
assert.match(multiLookup.body.paymentUrl, /multi=1/)
assert.match(multiLookup.body.paymentUrl, /e_base=0x1111111111111111111111111111111111111111/i)
assert.match(multiLookup.body.paymentUrl, /e_arbitrum=0x3333333333333333333333333333333333333333/i)
assert.match(multiLookup.body.paymentUrl, /e_arc=0x4444444444444444444444444444444444444444/i)
await assert.rejects(markHostedCheckoutPaid({
  id: multiCreated.body.checkoutId,
  txHash: `0x${'d'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T12:30:00.000Z',
}, dependencies), /payment network is invalid/)
await markHostedCheckoutPaid({
  id: multiCreated.body.checkoutId,
  txHash: `0x${'d'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T12:30:00.000Z',
  network: 'arbitrum',
}, dependencies)
const multiStatus = await request(handler, 'GET', { headers: { 'x-api-key': 'partner-secret' }, query: { id: multiCreated.body.checkoutId, purpose: 'status' } })
assert.equal(multiStatus.body.status, 'paid')
assert.equal(multiStatus.body.network, 'arbitrum')
assert.equal(multiStatus.body.payment.network, 'arbitrum')
const originalArbitrumRecipient = store.checkouts[multiCreated.body.checkoutId].paymentOptions[1].recipient
store.checkouts[multiCreated.body.checkoutId].paymentOptions[1].recipient = '0x5555555555555555555555555555555555555555'
assert.equal((await request(handler, 'GET', { query: { id: multiCreated.body.checkoutId } })).statusCode, 409)
store.checkouts[multiCreated.body.checkoutId].paymentOptions[1].recipient = originalArbitrumRecipient

const returnLookup = await request(handler, 'GET', { query: { id: created.body.checkoutId, purpose: 'return' } })
assert.equal(returnLookup.statusCode, 200)
assert.equal(returnLookup.body.returnUrl, 'https://polydesk.trade/portfolio')

assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId, purpose: 'status' } })).statusCode, 401)
const pendingStatus = await request(handler, 'GET', { headers: { 'x-api-key': 'partner-secret' }, query: { id: created.body.checkoutId, purpose: 'status' } })
assert.equal(pendingStatus.body.status, 'pending')
await assert.rejects(markHostedCheckoutPaid({
  id: created.body.checkoutId,
  txHash: `0x${'c'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T11:59:59.000Z',
}, dependencies), /before creation/)
await assert.rejects(markHostedCheckoutPaid({
  id: created.body.checkoutId,
  txHash: `0x${'b'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T13:00:01.000Z',
}, dependencies), /after expiry/)
await markHostedCheckoutPaid({
  id: created.body.checkoutId,
  txHash: `0x${'a'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T12:30:00.000Z',
}, dependencies)
const paidStatus = await request(handler, 'GET', { headers: { 'x-api-key': 'partner-secret' }, query: { id: created.body.checkoutId, purpose: 'status' } })
assert.equal(paidStatus.body.status, 'paid')
assert.equal(paidStatus.body.payment.amount, '0.024')

const secondCheckout = await request(handler, 'POST', {
  body: { ...valid, title: 'Another market data request' },
  headers: { ...headers, 'idempotency-key': 'partner:order:second-checkout' },
})
assert.equal(secondCheckout.statusCode, 201)
await assert.rejects(markHostedCheckoutPaid({
  id: secondCheckout.body.checkoutId,
  txHash: `0x${'a'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T12:30:00.000Z',
}, dependencies), /already linked to another hosted checkout/)

const storageFailure = await request(createHostedCheckoutsHandler({
  ...dependencies,
  read: async () => { throw new Error('database offline') },
}), 'GET', { query: { id: created.body.checkoutId } })
assert.equal(storageFailure.statusCode, 503)
assert.match(storageFailure.body.error, /temporarily unavailable/)

let managedStore
const managedNotifications = []
const managedDependencies = {
  ...dependencies,
  read: async () => managedStore,
  mutate: async (_key, update) => { managedStore = update(managedStore); return managedStore },
  policy: () => ({
    partnerId: 'dev_managedproject', merchantName: 'Managed Platform', allowedOrigins: ['https://managed.example'],
    defaultNetwork: 'base', projectManaged: true,
    settlementMode: 'usdc',
    paymentOptions: [
      { network: 'base', recipient: '0x1111111111111111111111111111111111111111' },
      { network: 'arbitrum', recipient: '0x3333333333333333333333333333333333333333' },
    ],
  }),
  notify: async (partnerId, event, data) => { managedNotifications.push({ partnerId, event, data }) },
  createId: () => 'chk_managedproject123',
}
const managedHandler = createHostedCheckoutsHandler(managedDependencies)
const managedBody = {
  kind: 'service', title: 'Managed checkout', amount: '1.25', memo: 'Order 42',
  returnUrl: 'https://managed.example/complete',
}
const managedHeaders = { 'x-api-key': 'hpl_live_managed', 'idempotency-key': 'managed:order:00000001' }
assert.equal((await request(managedHandler, 'POST', { body: { ...managedBody, recipient: valid.recipient }, headers: managedHeaders })).statusCode, 400)
const managedCreated = await request(managedHandler, 'POST', { body: managedBody, headers: managedHeaders })
assert.equal(managedCreated.statusCode, 201)
const managedLookup = await request(managedHandler, 'GET', { query: { id: managedCreated.body.checkoutId } })
assert.equal(managedLookup.body.checkout.merchantName, 'Managed Platform')
assert.deepEqual(managedLookup.body.checkout.availableNetworks, ['base', 'arbitrum'])
assert.deepEqual(managedNotifications.map(item => item.event), ['checkout.created'])
await markHostedCheckoutPaid({
  id: managedCreated.body.checkoutId,
  txHash: `0x${'b'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '1.25',
  confirmedAt: '2026-07-19T12:30:00.000Z',
  network: 'base',
}, managedDependencies)
assert.deepEqual(managedNotifications.map(item => item.event), ['checkout.created', 'payment.confirmed'])
await markHostedCheckoutPaid({
  id: managedCreated.body.checkoutId,
  txHash: `0x${'b'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '1.25',
  confirmedAt: '2026-07-19T12:30:00.000Z',
  network: 'base',
}, managedDependencies)
assert.equal(managedNotifications.length, 2)

let nairaStore
let nairaPrepareCalls = 0
const nairaNotifications = []
const nairaDependencies = {
  ...dependencies,
  read: async () => nairaStore,
  mutate: async (_key, update) => { nairaStore = update(nairaStore); return nairaStore },
  policy: () => ({
    partnerId: 'dev_nairaproject', merchantName: 'Naira Platform', allowedOrigins: ['https://naira.example'],
    defaultNetwork: 'base', projectManaged: true, settlementMode: 'ngn',
    paymentOptions: [{ network: 'base', recipient: '0x1111111111111111111111111111111111111111' }],
    nairaSettlement: {
      bankCode: 'OPAYNGPC', bankName: 'OPay', accountName: 'NAIRA PLATFORM',
      accountNumber: '0123456789', refundAddress: '0x1111111111111111111111111111111111111111',
    },
  }),
  prepareNaira: async (_policy, checkoutId, requestedUsdc) => {
    nairaPrepareCalls += 1
    return {
      provider: 'paycrest', orderId: 'paycrest_naira_1', intentId: checkoutId,
      requestedUsdc, payableUsdc: '1.253', amountNgn: '1750.00',
      receiveAddress: '0x6666666666666666666666666666666666666666',
      bankName: 'OPay', bankLast4: '6789', accountName: 'NAIRA PLATFORM',
      validUntil: '2026-07-19T12:45:00.000Z', status: 'initiated',
    }
  },
  notify: async (partnerId, event, data) => { nairaNotifications.push({ partnerId, event, data }) },
  createId: () => 'chk_nairaproject1234',
}
const nairaHandler = createHostedCheckoutsHandler(nairaDependencies)
const nairaHeaders = { 'x-api-key': 'hpl_live_naira', 'idempotency-key': 'naira:order:00000001' }
const nairaBody = { kind: 'service', title: 'Naira service', amount: '1.25', returnUrl: 'https://naira.example/complete' }
assert.equal((await request(nairaHandler, 'POST', { body: { ...nairaBody, flexible: true }, headers: { ...nairaHeaders, 'idempotency-key': 'naira:flexible:0000001' } })).statusCode, 400)
const nairaCreated = await request(nairaHandler, 'POST', { body: nairaBody, headers: nairaHeaders })
assert.equal(nairaCreated.statusCode, 201)
assert.equal(nairaPrepareCalls, 1)
assert.equal((await request(nairaHandler, 'POST', { body: nairaBody, headers: nairaHeaders })).statusCode, 200)
assert.equal(nairaPrepareCalls, 1)
const nairaLookup = await request(nairaHandler, 'GET', { query: { id: nairaCreated.body.checkoutId } })
assert.equal(nairaLookup.body.checkout.amount, '1.253')
assert.equal(nairaLookup.body.checkout.settlementMode, 'ngn')
assert.match(nairaLookup.body.paymentUrl, /src=bank-receive/)
assert.match(nairaLookup.body.paymentUrl, /offramp=paycrest/)
assert.match(nairaLookup.body.paymentUrl, /hostedKind=service/)
await markHostedCheckoutPaid({
  id: nairaCreated.body.checkoutId, txHash: `0x${'e'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222', amount: '1.253',
  confirmedAt: '2026-07-19T12:20:00.000Z', network: 'base',
}, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'processing')
assert.deepEqual(nairaNotifications.map(item => item.event), ['checkout.created', 'payment.processing'])
assert.equal((await request(nairaHandler, 'GET', { query: { id: nairaCreated.body.checkoutId } })).body.checkout.status, 'processing')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'pending' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'processing')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'validated' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'paid')
assert.deepEqual(nairaNotifications.map(item => item.event), ['checkout.created', 'payment.processing', 'payment.confirmed'])
assert.equal((await request(nairaHandler, 'GET', { query: { id: nairaCreated.body.checkoutId } })).body.checkout.status, 'paid')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'settled' }, nairaDependencies)
assert.equal(nairaNotifications.length, 3)
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'refunded' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'paid')
assert.equal(nairaNotifications.length, 3)

store.checkouts[created.body.checkoutId].amount = '99'
assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId } })).statusCode, 409)
store.checkouts[created.body.checkoutId].amount = '0.024'

now = new Date('2026-07-19T14:00:00.000Z')
assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId } })).statusCode, 410)

console.log('Hosted checkout adapter smoke tests passed.')

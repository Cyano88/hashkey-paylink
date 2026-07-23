import assert from 'node:assert/strict'
import { attachHostedCheckoutReceipt, createHostedCheckoutsHandler, drainHostedCheckoutWebhookOutbox, markHostedCheckoutNairaPayout, markHostedCheckoutPaid, resolveHostedCheckoutPartnerPolicy } from '../api/hosted-checkouts.ts'

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
assert.equal((await request(handler, 'POST', { body: { ...valid, checkoutMode: 'mixed' }, headers: { ...headers, 'idempotency-key': 'partner:order:mixed-mode' } })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, checkoutMode: 'agentic' }, headers: { ...headers, 'idempotency-key': 'partner:agentic:no-type' } })).statusCode, 400)
assert.equal((await request(handler, 'POST', { body: { ...valid, agenticType: 'creator_earnings' }, headers: { ...headers, 'idempotency-key': 'partner:human:agent-type' } })).statusCode, 400)

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
assert.match(created.body.checkoutUrl, /^\/pay\/c\/chk_testcheckout1234\?attempt=pat_[a-f0-9]{24}$/)
assert.equal(created.body.checkoutMode, 'human')
assert.match(created.body.paymentAttemptId, /^pat_[a-f0-9]{24}$/)
assert.equal(created.body.agentPaymentUrl, undefined)
assert.equal(created.body.agentCheckoutUrl, undefined)
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
assert.equal(lookup.body.checkout.checkoutMode, 'human')
assert.equal(lookup.body.checkout.paymentAttempt.id, created.body.paymentAttemptId)
assert.equal(lookup.body.checkout.paymentAttempt.status, 'pending')
assert.equal(lookup.body.agentPaymentUrl, undefined)
assert.match(lookup.body.paymentUrl, /^\/pay\?/)
assert.match(lookup.body.paymentUrl, /src=service/)
assert.match(lookup.body.paymentUrl, /a=0\.024(?:&|$)/)
assert.match(lookup.body.paymentUrl, /id=0x[a-f0-9]{64}/)
assert.match(lookup.body.paymentUrl, new RegExp(`attempt=${created.body.paymentAttemptId}`))
assert.equal(JSON.stringify(lookup.body).includes('https://polydesk.trade'), false)
assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId, attempt: 'pat_wrong' } })).statusCode, 409)

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
assert.equal(multiLookup.body.checkout.paymentAttempt.network, undefined)
assert.match(multiLookup.body.paymentUrl, /multi=1/)
assert.match(multiLookup.body.paymentUrl, /e_base=0x1111111111111111111111111111111111111111/)
assert.match(multiLookup.body.paymentUrl, /e_arbitrum=0x3333333333333333333333333333333333333333/)
await assert.rejects(markHostedCheckoutPaid({
  id: multiCreated.body.checkoutId,
  txHash: `0x${'d'.repeat(64)}`,
  payer: '0x2222222222222222222222222222222222222222',
  amount: '0.024',
  confirmedAt: '2026-07-19T12:30:00.000Z',
  network: 'arbitrum',
}, dependencies), /not locked/)
const selectedMulti = await request(handler, 'POST', {
  query: { id: multiCreated.body.checkoutId, attempt: multiCreated.body.paymentAttemptId, action: 'select-network' },
  body: { network: 'arbitrum' },
})
assert.equal(selectedMulti.statusCode, 200)
assert.equal(selectedMulti.body.paymentAttempt.network, 'arbitrum')
assert.equal(selectedMulti.body.paymentAttempt.recipient, undefined)
const selectedMultiLookup = await request(handler, 'GET', { query: { id: multiCreated.body.checkoutId, attempt: multiCreated.body.paymentAttemptId } })
assert.equal(selectedMultiLookup.body.checkout.network, 'arbitrum')
assert.match(selectedMultiLookup.body.paymentUrl, /n=arbitrum/)
assert.match(selectedMultiLookup.body.paymentUrl, /e=0x3333333333333333333333333333333333333333/)
assert.equal((await request(handler, 'POST', {
  query: { id: multiCreated.body.checkoutId, attempt: multiCreated.body.paymentAttemptId, action: 'select-network' },
  body: { network: 'base' },
})).statusCode, 409)

const agenticCreated = await request(handler, 'POST', {
  body: { ...valid, checkoutMode: 'agentic', agenticType: 'creator_earnings' },
  headers: { ...headers, 'idempotency-key': 'partner:agentic:00000001' },
})
assert.equal(agenticCreated.statusCode, 201)
assert.equal(agenticCreated.body.checkoutMode, 'agentic')
assert.equal(agenticCreated.body.agenticType, 'creator_earnings')
assert.equal(agenticCreated.body.network, 'base')
assert.deepEqual(agenticCreated.body.availableNetworks, ['base'])
assert.match(agenticCreated.body.checkoutUrl, /^\/pay\/a\/chk_[a-zA-Z0-9]+\?attempt=pat_[a-f0-9]{24}$/)
assert.match(agenticCreated.body.agentPaymentUrl, /\/api\/v2\/checkouts\/agent\?id=.*&attempt=pat_/)
const agenticLookup = await request(handler, 'GET', { query: { id: agenticCreated.body.checkoutId } })
assert.equal(agenticLookup.body.checkout.checkoutMode, 'agentic')
assert.equal(agenticLookup.body.paymentUrl, undefined)
assert.match(agenticLookup.body.agentPaymentUrl, /\/api\/v2\/checkouts\/agent\?id=.*&attempt=pat_/)
assert.equal((await request(handler, 'POST', {
  body: { ...multi, checkoutMode: 'agentic', agenticType: 'agent_treasury' },
  headers: { ...headers, 'idempotency-key': 'partner:agentic:multi-no-network' },
})).statusCode, 400)

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
assert.equal(paidStatus.body.paymentAttempt.status, 'paid')
assert.equal(paidStatus.body.paymentAttempt.transaction, `0x${'a'.repeat(64)}`)
assert.equal(paidStatus.body.paymentAttempt.returnUrl, valid.returnUrl)
assert.equal(paidStatus.body.paymentAttempt.recipient, valid.recipient)
await attachHostedCheckoutReceipt({
  id: created.body.checkoutId,
  txHash: `0x${'a'.repeat(64)}`,
  receiptId: 'receipt_hosted_0001',
  receiptUrl: '/receipt/receipt_hosted_0001',
}, dependencies)
const receiptStatus = await request(handler, 'GET', { headers: { 'x-api-key': 'partner-secret' }, query: { id: created.body.checkoutId, purpose: 'status' } })
assert.equal(receiptStatus.body.paymentAttempt.receiptId, 'receipt_hosted_0001')
assert.equal(receiptStatus.body.paymentAttempt.receiptUrl, '/receipt/receipt_hosted_0001')
const paidReturnLookup = await request(handler, 'GET', { query: { id: created.body.checkoutId, attempt: created.body.paymentAttemptId, purpose: 'return' } })
assert.equal(paidReturnLookup.body.checkout.paymentAttempt.transaction, `0x${'a'.repeat(64)}`)
assert.equal(paidReturnLookup.body.checkout.paymentAttempt.payer, '0x2222222222222222222222222222222222222222')

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
let managedCreatedCount = 0
const managedNotifications = []
const managedDependencies = {
  ...dependencies,
  read: async () => managedStore,
  mutate: async (_key, update) => { managedStore = update(managedStore); return managedStore },
  policy: () => ({
    partnerId: 'dev_managedproject', merchantName: 'Managed Platform', allowedOrigins: ['https://managed.example'],
    brandImageUrl: 'https://managed.example/brand/mark.webp',
    defaultNetwork: 'base', projectManaged: true,
    settlementMode: 'usdc',
    paymentOptions: [
      { network: 'base', recipient: '0x1111111111111111111111111111111111111111' },
      { network: 'arbitrum', recipient: '0x3333333333333333333333333333333333333333' },
    ],
  }),
  notify: async (partnerId, event, data) => { managedNotifications.push({ partnerId, event, data }) },
  createId: () => managedCreatedCount++ === 0 ? 'chk_managedproject123' : `chk_managedproject${managedCreatedCount}`,
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
assert.equal(managedLookup.body.checkout.brandImageUrl, 'https://managed.example/brand/mark.webp')
assert.equal(new URL(managedLookup.body.paymentUrl, 'https://app.hashpaylink.com').searchParams.get('merchantLogo'), 'https://managed.example/brand/mark.webp')
assert.deepEqual(managedLookup.body.checkout.availableNetworks, ['base', 'arbitrum'])
assert.equal(managedLookup.body.checkout.paymentAttempt.network, undefined)
assert.deepEqual(managedNotifications.map(item => item.event), ['checkout.created'])
const managedSelected = await request(managedHandler, 'POST', {
  query: { id: managedCreated.body.checkoutId, attempt: managedCreated.body.paymentAttemptId, action: 'select-network' },
  body: { network: 'base' },
})
assert.equal(managedSelected.statusCode, 200)
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
const managedAgentic = await request(managedHandler, 'POST', {
  body: { ...managedBody, checkoutMode: 'agentic', agenticType: 'agent_treasury', network: 'arbitrum' },
  headers: { ...managedHeaders, 'idempotency-key': 'managed:agentic:00000001' },
})
assert.equal(managedAgentic.statusCode, 201)
assert.equal(managedAgentic.body.network, 'arbitrum')
assert.deepEqual(managedAgentic.body.availableNetworks, ['arbitrum'])
const managedAgenticLookup = await request(managedHandler, 'GET', { query: { id: managedAgentic.body.checkoutId } })
assert.equal(managedAgenticLookup.body.checkout.network, 'arbitrum')
assert.deepEqual(managedAgenticLookup.body.checkout.availableNetworks, ['arbitrum'])
assert.equal(managedAgenticLookup.body.paymentUrl, undefined)
assert.equal((await request(managedHandler, 'POST', {
  body: { ...managedBody, checkoutMode: 'agentic', agenticType: 'agent_treasury' },
  headers: { ...managedHeaders, 'idempotency-key': 'managed:agentic:no-network' },
})).statusCode, 400)

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
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].paymentAttempts[0].status, 'processing')
assert.deepEqual(nairaNotifications.map(item => item.event), ['checkout.created', 'payment.processing'])
assert.equal((await request(nairaHandler, 'GET', { query: { id: nairaCreated.body.checkoutId } })).body.checkout.status, 'processing')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'pending' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'processing')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'validated' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'paid')
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].paymentAttempts[0].status, 'paid')
assert.deepEqual(nairaNotifications.map(item => item.event), ['checkout.created', 'payment.processing', 'payment.confirmed'])
assert.equal((await request(nairaHandler, 'GET', { query: { id: nairaCreated.body.checkoutId } })).body.checkout.status, 'paid')
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'settled' }, nairaDependencies)
assert.equal(nairaNotifications.length, 3)

let retryNow = new Date('2026-07-19T12:00:00.000Z')
let retryStore = {
  checkouts: {},
  idempotency: {},
  outbox: [{
    id: 'evt_retrydelivery12345', partnerId: 'dev_retry', event: 'payment.confirmed',
    data: { checkoutId: 'chk_retrycheckout123' }, createdAt: retryNow.toISOString(),
    attempts: 0, nextAttemptAt: retryNow.toISOString(), status: 'pending',
  }],
}
const retryDeliveries = []
let failRetryDelivery = true
const retryDependencies = {
  ...dependencies,
  read: async () => retryStore,
  mutate: async (_key, update) => { retryStore = update(retryStore); return retryStore },
  now: () => retryNow,
  notify: async (partnerId, event, data, delivery) => {
    retryDeliveries.push({ partnerId, event, data, delivery })
    if (failRetryDelivery) throw new Error('temporary receiver failure')
  },
}
assert.equal(await drainHostedCheckoutWebhookOutbox(retryDependencies), 0)
assert.equal(retryStore.outbox[0].status, 'pending')
assert.equal(retryStore.outbox[0].attempts, 1)
assert.match(retryStore.outbox[0].lastError, /temporary receiver failure/)
retryNow = new Date('2026-07-19T12:00:10.000Z')
failRetryDelivery = false
assert.equal(await drainHostedCheckoutWebhookOutbox(retryDependencies), 1)
assert.equal(retryStore.outbox[0].status, 'delivered')
assert.equal(retryStore.outbox[0].attempts, 2)
assert.deepEqual(retryDeliveries.map(item => item.delivery.eventId), ['evt_retrydelivery12345', 'evt_retrydelivery12345'])
await markHostedCheckoutNairaPayout({ intentId: nairaCreated.body.checkoutId, status: 'refunded' }, nairaDependencies)
assert.equal(nairaStore.checkouts[nairaCreated.body.checkoutId].payment.status, 'paid')
assert.equal(nairaNotifications.length, 3)

store.checkouts[created.body.checkoutId].amount = '99'
assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId } })).statusCode, 409)
store.checkouts[created.body.checkoutId].amount = '0.024'

now = new Date('2026-07-19T14:00:00.000Z')
assert.equal((await request(handler, 'GET', { query: { id: created.body.checkoutId } })).statusCode, 410)

console.log('Hosted checkout adapter smoke tests passed.')

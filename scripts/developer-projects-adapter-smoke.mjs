import assert from 'node:assert/strict'
import { buildDeveloperWebhookRequest, createDeveloperProjectsHandler, developerPolicyFromStore, developerWebhookSignature, validatePublicWebhookDestination } from '../api/developer-projects.ts'
import { createHmac } from 'node:crypto'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, body = undefined) {
  const response = responseRecorder()
  await handler({ method, body, headers: { authorization: 'Bearer privy-test' } }, response)
  return response
}

let store
let keyCount = 0
let projectCount = 0
const portalSecret = 'developer-portal-test-secret-longer-than-thirty-two-characters'
const linkedWallet = '0x1111111111111111111111111111111111111111'
await assert.rejects(validatePublicWebhookDestination('https://127.0.0.1/webhook'), /public HTTPS/)
assert.equal(
  developerWebhookSignature('whsec_test', '1784452800', '{"event":"payment.confirmed"}'),
  createHmac('sha256', 'whsec_test').update('1784452800.{"event":"payment.confirmed"}').digest('hex'),
)
const firstWebhookAttempt = buildDeveloperWebhookRequest('whsec_test', 'payment.confirmed', { checkoutId: 'chk_test' }, {
  eventId: 'evt_stable', createdAt: '2026-07-19T12:00:00.000Z', attemptedAt: '2026-07-19T12:00:00.000Z',
})
const retryWebhookAttempt = buildDeveloperWebhookRequest('whsec_test', 'payment.confirmed', { checkoutId: 'chk_test' }, {
  eventId: 'evt_stable', createdAt: '2026-07-19T12:00:00.000Z', attemptedAt: '2026-07-19T13:00:00.000Z',
})
assert.equal(firstWebhookAttempt.payload, retryWebhookAttempt.payload)
assert.notEqual(firstWebhookAttempt.timestamp, retryWebhookAttempt.timestamp)
assert.notEqual(firstWebhookAttempt.signature, retryWebhookAttempt.signature)
const handler = createDeveloperProjectsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => { store = update(store); return store },
  verify: async () => ({ userId: 'did:privy:test-owner', email: 'owner@example.com', wallets: [linkedWallet] }),
  validateWebhook: async url => { assert.match(url, /^https:\/\//) },
  paycrestReady: () => true,
  listBanks: async () => [{ code: 'OPAYNGPC', name: 'OPay' }],
  verifyBank: async ({ institution, accountIdentifier }) => institution === 'OPAYNGPC' && accountIdentifier === '0123456789' ? 'POLYDESK LIMITED' : '',
  portalSecret: () => portalSecret,
  createProjectId: () => projectCount++ === 0 ? 'dev_testproject1234' : 'dev_agentproject1234',
  createKeyId: () => `key_test${++keyCount}`,
  createSecret: prefix => `${prefix}_generated-secret-${keyCount}`,
  now: () => new Date('2026-07-19T12:00:00.000Z'),
})

assert.equal((await request(handler, 'PATCH')).statusCode, 405)
assert.equal((await request(handler, 'POST', { action: 'create', name: 'A', website: 'javascript:alert(1)', useCase: 'short' })).statusCode, 400)
assert.equal((await request(handler, 'POST', {
  action: 'create', name: 'No mode', website: 'https://example.com',
  useCase: 'Accept customer payments through a hosted checkout integration.',
})).statusCode, 400)

const created = await request(handler, 'POST', {
  action: 'create', name: 'PolyDesk API', website: 'https://polydesk.trade/app',
  checkoutMode: 'human',
  useCase: 'Sell individual market data and analysis requests through hosted checkout.',
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.project.ownerEmail, 'owner@example.com')
assert.deepEqual(created.body.project.allowedOrigins, ['https://polydesk.trade'])
assert.equal(created.body.project.brandImageUrl, '')
assert.equal(created.body.project.checkoutMode, 'human')

const immutableMode = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, checkoutMode: 'agentic',
  name: 'PolyDesk API', website: 'https://polydesk.trade',
  useCase: 'Sell individual market data and analysis requests through hosted checkout.',
})
assert.equal(immutableMode.statusCode, 409)

const invalidBrand = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, name: 'PolyDesk API', website: 'https://polydesk.trade',
  brandImageUrl: 'https://tracker.example/polydesk.svg',
  useCase: 'Sell individual market data and analysis requests through hosted checkout.', settlementMode: 'usdc',
  capabilities: ['hosted_checkout'], networks: ['base'], defaultNetwork: 'base', recipients: { base: linkedWallet },
  allowedOrigins: ['https://polydesk.trade'], webhookUrl: '',
})
assert.equal(invalidBrand.statusCode, 400)
assert.match(invalidBrand.body.error, /project website origin/)

const unlinked = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, name: 'PolyDesk API', website: 'https://polydesk.trade',
  brandImageUrl: 'https://polydesk.trade/brand/polydesk-mark-bw-transparent.png',
  useCase: 'Sell individual market data and analysis requests through hosted checkout.', settlementMode: 'usdc',
  capabilities: ['hosted_checkout', 'polymarket_funding'],
  networks: ['base'], defaultNetwork: 'base', recipients: { base: '0x2222222222222222222222222222222222222222' },
  allowedOrigins: ['https://polydesk.trade'], webhookUrl: '',
})
assert.equal(unlinked.statusCode, 200)
assert.equal(unlinked.body.project.settlementStatus, 'ready')

const ready = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, name: 'PolyDesk API', website: 'https://polydesk.trade',
  brandImageUrl: 'https://polydesk.trade/brand/polydesk-mark-bw-transparent.png',
  useCase: 'Sell individual market data and analysis requests through hosted checkout.', settlementMode: 'usdc',
  capabilities: ['hosted_checkout', 'polymarket_funding'],
  networks: ['base', 'arbitrum', 'arc'], defaultNetwork: 'base', recipients: { base: linkedWallet, arbitrum: linkedWallet, arc: linkedWallet },
  allowedOrigins: ['https://polydesk.trade', 'javascript:alert(1)'], webhookUrl: 'https://polydesk.trade/webhooks/hashpaylink',
})
assert.equal(ready.body.project.settlementStatus, 'ready')
assert.deepEqual(ready.body.project.allowedOrigins, ['https://polydesk.trade'])
assert.equal(ready.body.project.brandImageUrl, 'https://polydesk.trade/brand/polydesk-mark-bw-transparent.png')

const generated = await request(handler, 'POST', { action: 'create-key', projectId: created.body.project.id, name: 'Production backend' })
assert.equal(generated.statusCode, 201)
assert.match(generated.body.apiKey, /^hpl_live_/)
assert.equal(JSON.stringify(generated.body).includes('digest'), false)
const policy = developerPolicyFromStore(store, generated.body.apiKey, portalSecret)
assert.equal(policy.partnerId, created.body.project.id)
assert.equal(policy.merchantName, 'PolyDesk API')
assert.equal(policy.brandImageUrl, 'https://polydesk.trade/brand/polydesk-mark-bw-transparent.png')
assert.equal(policy.checkoutMode, 'human')
assert.deepEqual(policy.capabilities, ['hosted_checkout', 'polymarket_funding'])
assert.deepEqual(policy.paymentOptions.map(option => option.network), ['base', 'arbitrum'])
assert.equal(developerPolicyFromStore(store, `${generated.body.apiKey}tampered`, portalSecret), null)
const testKey = await request(handler, 'POST', { action: 'create-key', projectId: created.body.project.id, name: 'Arc sandbox', environment: 'test' })
assert.equal(testKey.statusCode, 201)
assert.match(testKey.body.apiKey, /^hpl_test_/)
assert.equal(testKey.body.key.environment, 'test')
const testPolicy = developerPolicyFromStore(store, testKey.body.apiKey, portalSecret)
assert.deepEqual(testPolicy.paymentOptions.map(option => option.network), ['arc'])
assert.equal(testPolicy.defaultNetwork, 'arc')

const invalidAgenticProduct = await request(handler, 'POST', {
  action: 'create', name: 'PolyDesk Agent API', website: 'https://polydesk.trade',
  checkoutMode: 'agentic', capabilities: ['hosted_checkout', 'polymarket_funding'],
  useCase: 'Sell fixed-price LP Scout research to compatible agent wallets.',
})
assert.equal(invalidAgenticProduct.statusCode, 400)
const agenticProject = await request(handler, 'POST', {
  action: 'create', name: 'PolyDesk Agent API', website: 'https://polydesk.trade',
  checkoutMode: 'agentic', capabilities: ['hosted_checkout'],
  useCase: 'Sell fixed-price LP Scout research to compatible agent wallets.',
})
assert.equal(agenticProject.statusCode, 201)
assert.equal(agenticProject.body.project.checkoutMode, 'agentic')
const agenticNaira = await request(handler, 'PUT', {
  action: 'configure', projectId: agenticProject.body.project.id, checkoutMode: 'agentic',
  name: 'PolyDesk Agent API', website: 'https://polydesk.trade',
  useCase: 'Sell fixed-price LP Scout research to compatible agent wallets.',
  capabilities: ['hosted_checkout'], settlementMode: 'ngn', networks: ['base'], defaultNetwork: 'base',
  refundAddress: linkedWallet, allowedOrigins: ['https://polydesk.trade'],
})
assert.equal(agenticNaira.statusCode, 400)
const agenticReady = await request(handler, 'PUT', {
  action: 'configure', projectId: agenticProject.body.project.id, checkoutMode: 'agentic',
  name: 'PolyDesk Agent API', website: 'https://polydesk.trade',
  useCase: 'Sell fixed-price LP Scout research to compatible agent wallets.',
  capabilities: ['hosted_checkout'], settlementMode: 'usdc', networks: ['arc'], defaultNetwork: 'arc',
  recipients: { arc: linkedWallet }, allowedOrigins: ['https://polydesk.trade'], webhookUrl: '',
})
assert.equal(agenticReady.body.project.settlementStatus, 'ready')
const agenticKey = await request(handler, 'POST', { action: 'create-key', projectId: agenticProject.body.project.id, name: 'Agent sandbox', environment: 'test' })
assert.equal(agenticKey.statusCode, 201)
const agenticPolicy = developerPolicyFromStore(store, agenticKey.body.apiKey, portalSecret)
assert.equal(agenticPolicy.checkoutMode, 'agentic')
assert.deepEqual(agenticPolicy.capabilities, ['hosted_checkout'])

const webhook = await request(handler, 'POST', { action: 'rotate-webhook-secret', projectId: created.body.project.id })
assert.equal(webhook.statusCode, 201)
assert.match(webhook.body.webhookSecret, /^whsec_/)
assert.equal(JSON.stringify(webhook.body.project).includes('webhookSecretCipher'), false)

const naira = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, name: 'PolyDesk API', website: 'https://polydesk.trade',
  useCase: 'Settle customer payments into a verified Nigerian business bank account.', settlementMode: 'ngn',
  networks: ['base'], defaultNetwork: 'base', recipients: { base: linkedWallet }, refundAddress: linkedWallet,
  allowedOrigins: ['https://polydesk.trade'], webhookUrl: 'https://polydesk.trade/webhooks/hashpaylink',
  bankCode: 'OPAYNGPC', bankName: 'OPay', bankAccountName: 'POLYDESK LIMITED', bankAccountNumber: '0123456789',
})
assert.equal(naira.body.project.settlementStatus, 'ready')
assert.ok(naira.body.project.bankVerifiedAt)
assert.equal(naira.body.project.bankAccountLast4, '6789')
assert.equal(JSON.stringify(naira.body.project).includes('0123456789'), false)
const nairaPolicy = developerPolicyFromStore(store, generated.body.apiKey, portalSecret)
assert.equal(nairaPolicy.settlementMode, 'ngn')
assert.equal(nairaPolicy.nairaSettlement.accountNumber, '0123456789')

const nairaUpdate = await request(handler, 'PUT', {
  action: 'configure', projectId: created.body.project.id, name: 'PolyDesk API', website: 'https://polydesk.trade',
  useCase: 'Settle customer payments into a verified Nigerian business bank account.', settlementMode: 'ngn',
  networks: ['base'], defaultNetwork: 'base', recipients: { base: linkedWallet }, refundAddress: linkedWallet,
  allowedOrigins: ['https://polydesk.trade'], webhookUrl: 'https://polydesk.trade/webhooks/hashpaylink',
  bankCode: 'OPAYNGPC', bankName: 'OPay', bankAccountName: 'POLYDESK LIMITED',
})
assert.equal(nairaUpdate.statusCode, 200)
assert.equal(nairaUpdate.body.project.bankAccountLast4, '6789')

const revoked = await request(handler, 'POST', { action: 'revoke-key', projectId: created.body.project.id, keyId: generated.body.key.id })
assert.equal(revoked.statusCode, 200)
assert.ok(revoked.body.project.keys[0].revokedAt)

const otherOwner = createDeveloperProjectsHandler({
  hasStore: () => true, read: async () => store, mutate: async () => store,
  verify: async () => ({ userId: 'did:privy:other', email: 'other@example.com', wallets: [] }),
  validateWebhook: async () => undefined,
  paycrestReady: () => true, listBanks: async () => [], verifyBank: async () => '',
  portalSecret: () => portalSecret, createProjectId: () => 'unused', createKeyId: () => 'unused',
  createSecret: prefix => `${prefix}_unused`, now: () => new Date(),
})
assert.equal((await request(otherOwner, 'PUT', { action: 'configure', projectId: created.body.project.id })).statusCode, 404)

console.log('Developer projects adapter smoke tests passed.')

import assert from 'node:assert/strict'
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pad } from 'viem'

const root = await mkdtemp(join(tmpdir(), 'pocket-ng-pos-route-'))
const originalFetch = globalThis.fetch
const originalWarn = console.warn
console.warn = (...args) => { if (!/durable (?:load|save) failed/i.test(String(args[0] ?? ''))) originalWarn(...args) }
delete process.env.DATABASE_URL
delete process.env.RENDER
delete process.env.RENDER_SERVICE_ID
delete process.env.RENDER_EXTERNAL_URL
process.env.NG_POS_STORE = join(root, 'ng-pos.json')
process.env.PAYCREST_POS_STORE = join(root, 'paycrest.json')
process.env.POCKET_PAYMENT_EXECUTION_STORE = join(root, 'executions.json')
process.env.NG_POS_BANK_ENCRYPTION_KEY = 'isolated-route-test-key'
process.env.PAYCREST_API_KEY = 'isolated-paycrest-key'
process.env.PAYCREST_API_BASE = 'https://paycrest.test'
process.env.PAYCREST_WEBHOOK_SECRET = 'isolated-webhook-secret'
process.env.PRIVATE_RPC_URL = 'https://base-rpc.test'
process.env.NG_POS_USDC_NGN_RATE = '1600'
process.env.PAYCREST_RECONCILE_ATTEMPTS = '1'

const merchantId = 'pos_route_merchant'
const ownerId = 'did:privy:pos-route-owner'
const refundAddress = '0x2222222222222222222222222222222222222222'
const receiveAddress = '0x3333333333333333333333333333333333333333'
const txHash = `0x${'a'.repeat(64)}`
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

function encryptedBank() {
  const key = createHash('sha256').update(process.env.NG_POS_BANK_ENCRYPTION_KEY).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify({ bank_code: 'TESTBANK', account_number: '0123456789', account_name: 'ADA SHOP' })
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: 'test-v1' }
}

await writeFile(process.env.NG_POS_STORE, JSON.stringify({ merchants: { [merchantId]: {
  merchant_id: merchantId, owner_id: ownerId, display_name: 'Ada Shop', country: 'NG', payout_preference: 'INSTANT_FIAT',
  encrypted_bank_details: encryptedBank(), bank_name: 'Test Bank', bank_code: 'TESTBANK', bank_last4: '6789', bank_account_name: 'ADA SHOP',
  circle_smart_wallet_address: refundAddress, supported_networks: ['base'], kyc_status: 'UNVERIFIED', settlement_enabled: true,
  source: 'pos', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
} }, intents: {}, bank_send_links: {} }, null, 2))

let providerStatus = 'initiated'
globalThis.fetch = async (url, init = {}) => {
  const target = String(url)
  if (target === process.env.PRIVATE_RPC_URL) {
    const request = JSON.parse(String(init.body))
    if (request.method === 'eth_blockNumber') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x10' })
    if (request.method === 'eth_getLogs') return Response.json({ jsonrpc: '2.0', id: 1, result: [] })
    assert.equal(request.method, 'eth_getTransactionReceipt')
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {
      status: '0x1', blockNumber: '0x10', logs: [{ address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', topics: [transferTopic, `0x${'0'.repeat(64)}`, pad(receiveAddress, { size: 32 })], data: '0x0f4240' }],
    } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (target.includes('/v2/rates/')) return Response.json({ status: 'success', data: { sell: { rate: '1600' } } })
  if (target.endsWith('/v2/sender/orders') && init.method === 'POST') return Response.json({ data: {
    id: 'paycrest-pos-route-order', amount: '1', status: providerStatus,
    providerAccount: { receiveAddress, validUntil: new Date(Date.now() + 600_000).toISOString() },
  } })
  if (target.includes('/v2/sender/orders/paycrest-pos-route-order')) return Response.json({ data: { id: 'paycrest-pos-route-order', status: providerStatus } })
  return new Response(JSON.stringify({ error: 'unexpected test request', target }), { status: 503, headers: { 'content-type': 'application/json' } })
}

function responseRecorder() {
  return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

async function route(handler, body) {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers: { host: 'pay.example', 'x-forwarded-proto': 'https' } }, response)
  assert.equal(response.statusCode, 200, JSON.stringify(response.body))
  return response.body
}

try {
  const [{ default: ngPosHandler }, { paycrestWebhookHandler }, { paymentExecutionRepository }] = await Promise.all([
    import('../api/ng-pos.ts'), import('../api/paycrest-pos.ts'), import('../api/pocket/payment-execution-intents.ts'),
  ])
  const quoted = await route(ngPosHandler, { action: 'quote', merchant_id: merchantId, settlement_type: 'INSTANT_FIAT', amount_currency: 'NGN', amount: '1600', network: 'base' })
  assert.equal(quoted.quote.amount_usdc, '1')
  assert.ok(quoted.quote.intent_id)
  assert.ok(quoted.quote.payment_execution_id)
  assert.equal((await paymentExecutionRepository.get(ownerId, quoted.quote.payment_execution_id)).state, 'prepared')

  const ordered = await route(ngPosHandler, { action: 'createOfframpOrder', intent_id: quoted.quote.intent_id, refund_address: refundAddress, payer_wallet: refundAddress, payer_name: 'Test Payer' })
  assert.equal(ordered.order.paycrest_order_id, 'paycrest-pos-route-order')
  assert.equal(ordered.payment_execution.id, quoted.quote.payment_execution_id)
  assert.equal(ordered.payment_execution.state, 'authorized')
  await new Promise(resolve => setTimeout(resolve, 20))

  const paid = await route(ngPosHandler, { action: 'markOfframpPaid', intent_id: quoted.quote.intent_id, tx_hash: txHash, payer_wallet: refundAddress })
  assert.equal(paid.payment_execution.state, 'processing')
  assert.ok(paid.receipt?.receiptId, 'verified POS payment must be registered before the mark-paid response returns')

  providerStatus = 'settled'
  const webhookPayload = Buffer.from(JSON.stringify({ data: { id: 'paycrest-pos-route-order', status: providerStatus, txHash } }))
  const webhookResponse = responseRecorder()
  await paycrestWebhookHandler({ body: webhookPayload, headers: { 'x-paycrest-signature': createHmac('sha256', process.env.PAYCREST_WEBHOOK_SECRET).update(webhookPayload).digest('hex') } }, webhookResponse)
  assert.equal(webhookResponse.statusCode, 200)

  const settled = await route(ngPosHandler, { action: 'offrampStatus', intent_id: quoted.quote.intent_id, refresh: false })
  assert.equal(settled.order.status, 'settled')
  assert.equal(settled.payment_execution.id, quoted.quote.payment_execution_id)
  assert.equal(settled.payment_execution.state, 'completed')
} finally {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  await rm(root, { recursive: true, force: true })
}

console.log('Pocket ng-pos settlement route smoke test passed.')

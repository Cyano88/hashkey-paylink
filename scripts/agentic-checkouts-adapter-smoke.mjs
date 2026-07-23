import assert from 'node:assert/strict'
import { createAgenticCheckoutsHandler, reconcileGatewayPayment } from '../api/agentic-checkouts.ts'

const paymentAttemptId = 'pat_agentattempt1234567890'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; this.ended = true; return this },
    end(body) { this.body = body; this.ended = true; return this },
  }
}

function checkout(overrides = {}) {
  return {
    id: 'chk_agentcheckout1234',
    partnerId: 'dev_agentproject',
    kind: 'service',
    merchantName: 'Agent Services',
    title: 'Research request',
    description: 'Verified research result.',
    amount: '0.25',
    flexible: false,
    network: 'base',
    recipient: '0x1111111111111111111111111111111111111111',
    memo: 'Research request',
    returnUrl: 'https://agent.example/complete',
    createdAt: '2026-07-22T10:00:00.000Z',
    expiresAt: '2026-07-22T11:00:00.000Z',
    requestHash: 'a'.repeat(64),
    checkoutMode: 'agentic',
    agenticType: 'agent_treasury',
    paymentAttempts: [{
      id: paymentAttemptId,
      mode: 'agentic',
      status: 'pending',
      network: 'base',
      recipient: '0x1111111111111111111111111111111111111111',
      returnUrl: 'https://agent.example/complete',
      amount: '0.25',
      createdAt: '2026-07-22T10:00:00.000Z',
      updatedAt: '2026-07-22T10:00:00.000Z',
    }],
    integrity: 'b'.repeat(64),
    ...overrides,
  }
}

async function request(handler, { method = 'GET', query = { id: 'chk_agentcheckout1234', attempt: paymentAttemptId }, headers = {} } = {}) {
  const req = { method, query, headers, url: `/api/v2/checkouts/agent?id=${query.id ?? ''}` }
  const res = responseRecorder()
  await handler(req, res)
  return { req, res }
}

let active = checkout()
let marked
let attempted
const gatewayTransferId = '3c90c3cc-0d44-4b50-8888-8dd25736052a'
const challengeHandler = createAgenticCheckoutsHandler({
  read: async () => active,
  markPaid: async input => { marked = input; return active },
  beginAttempt: async input => { attempted = input; return active },
  protect: async () => async (_req, res) => {
    res.statusCode = 402
    res.setHeader('PAYMENT-REQUIRED', 'challenge')
    res.end('{}')
  },
  reconcile: async () => null,
  now: () => new Date('2026-07-22T10:15:00.000Z'),
})

assert.equal((await request(challengeHandler, { method: 'POST' })).res.statusCode, 405)
assert.equal((await request(challengeHandler, { query: { id: 'invalid', attempt: paymentAttemptId } })).res.statusCode, 400)
assert.equal((await request(challengeHandler, { query: { id: 'chk_agentcheckout1234', attempt: 'pat_wrong' } })).res.statusCode, 409)
const challenged = await request(challengeHandler)
assert.equal(challenged.res.statusCode, 402)
assert.equal(challenged.res.headers['payment-required'], 'challenge')
assert.equal(marked, undefined)

const paidRecord = checkout({
  payment: {
    status: 'paid',
    referenceType: 'circle_gateway_transfer',
    txHash: gatewayTransferId,
    payer: '0x2222222222222222222222222222222222222222',
    amount: '0.25',
    confirmedAt: '2026-07-22T10:15:00.000Z',
    network: 'base',
  },
})
const paidHandler = createAgenticCheckoutsHandler({
  read: async () => active,
  markPaid: async input => { marked = input; return paidRecord },
  beginAttempt: async input => { attempted = input; return active },
  protect: async () => async (req, _res, next) => {
    req.payment = {
      verified: true,
      payer: '0x2222222222222222222222222222222222222222',
      amount: '250000',
      network: 'eip155:8453',
      transaction: gatewayTransferId,
    }
    next()
  },
  reconcile: async () => null,
  now: () => new Date('2026-07-22T10:15:00.000Z'),
})
const paid = await request(paidHandler)
assert.equal(paid.res.statusCode, 200)
assert.equal(paid.res.body.paymentPath, 'agentic')
assert.equal(paid.res.body.paymentAttemptId, paymentAttemptId)
assert.equal(paid.res.body.status, 'paid')
assert.equal(marked.amount, '0.25')
assert.equal(marked.network, 'base')
assert.equal(marked.referenceType, 'circle_gateway_transfer')

marked = undefined
const wrongAmountHandler = createAgenticCheckoutsHandler({
  read: async () => active,
  markPaid: async input => { marked = input; return paidRecord },
  beginAttempt: async input => { attempted = input; return active },
  protect: async () => async (req, _res, next) => {
    req.payment = {
      verified: true,
      payer: '0x2222222222222222222222222222222222222222',
      amount: '249999',
      network: 'eip155:8453',
      transaction: gatewayTransferId,
    }
    next()
  },
  reconcile: async () => null,
  now: () => new Date('2026-07-22T10:15:00.000Z'),
})
const wrongAmount = await request(wrongAmountHandler)
assert.equal(wrongAmount.res.statusCode, 409)
assert.match(wrongAmount.res.body.error, /amount does not match/)
assert.equal(marked, undefined)

active = checkout()
const paymentSignature = Buffer.from(JSON.stringify({
  accepted: { network: 'eip155:8453' },
  payload: { authorization: { from: '0x2222222222222222222222222222222222222222', nonce: `0x${'a'.repeat(64)}` } },
})).toString('base64')
await request(paidHandler, { headers: { 'payment-signature': paymentSignature } })
assert.equal(attempted.nonce, `0x${'a'.repeat(64)}`)
assert.equal(attempted.network, 'base')

active = checkout({ agenticAttempts: [{ signatureHash: 'd'.repeat(64), nonce: `0x${'a'.repeat(64)}`, payer: '0x2222222222222222222222222222222222222222', network: 'base', startedAt: '2026-07-22T10:14:00.000Z' }] })
const recoveredHandler = createAgenticCheckoutsHandler({
  read: async () => active,
  markPaid: async input => { marked = input; return paidRecord },
  beginAttempt: async input => { attempted = input; return active },
  protect: async () => { throw new Error('Protection should not run after reconciliation.') },
  reconcile: async () => paidRecord,
  now: () => new Date('2026-07-22T10:16:00.000Z'),
})
const recovered = await request(recoveredHandler)
assert.equal(recovered.res.statusCode, 200)
assert.equal(recovered.res.body.transaction, gatewayTransferId)

let reconciliationUrl = ''
const reconciledRecord = await reconcileGatewayPayment(active, {
  fetcher: async url => {
    reconciliationUrl = String(url)
    return new Response(JSON.stringify({ transfers: [{
      id: gatewayTransferId,
      status: 'received',
      token: 'USDC',
      sendingNetwork: 'eip155:8453',
      fromAddress: '0x2222222222222222222222222222222222222222',
      toAddress: '0x1111111111111111111111111111111111111111',
      amount: '250000',
      nonce: `0x${'a'.repeat(64)}`,
      createdAt: '2026-07-22T10:15:30.000Z',
    }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  },
  markPaid: async input => { marked = input; return paidRecord },
})
assert.equal(reconciledRecord.payment.txHash, gatewayTransferId)
assert.match(reconciliationUrl, /nonce=0x/)
assert.equal(marked.referenceType, 'circle_gateway_transfer')

active = checkout({ kind: 'usdc_request' })
assert.equal((await request(paidHandler)).res.statusCode, 409)
active = checkout({ checkoutMode: 'human', agenticType: undefined })
assert.equal((await request(paidHandler)).res.statusCode, 409)
active = paidRecord
const replayed = await request(challengeHandler)
assert.equal(replayed.res.statusCode, 200)
assert.equal(replayed.res.body.status, 'paid')

console.log('Agentic checkout adapter smoke tests passed.')

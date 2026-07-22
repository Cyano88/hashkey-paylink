import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.RECEIPT_SIGNING_SECRET = 'receipt-test-secret-that-is-at-least-32-characters'

const { isPaymentReceiptIdAuthentic, paymentReceiptId } = await import('../api/event-registry.ts')
const { publicReceiptPayer } = await import('../api/receipt.ts')

const receiptId = paymentReceiptId('evt_public_1', `0x${'a'.repeat(64)}`)
assert.match(receiptId, /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
assert.equal(isPaymentReceiptIdAuthentic(receiptId), true)

const [version, payload, signature] = receiptId.split('.')
const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`
assert.equal(isPaymentReceiptIdAuthentic(`${version}.${tamperedPayload}.${signature}`), false)
assert.equal(isPaymentReceiptIdAuthentic(Buffer.from(JSON.stringify({ eventId: 'evt_public_1', txHash: `0x${'a'.repeat(64)}` })).toString('base64url')), false)

assert.equal(publicReceiptPayer('payer@example.com'), 'p***@example.com')
assert.equal(publicReceiptPayer(`0x${'b'.repeat(40)}`), `0x${'b'.repeat(40)}`)

console.log('Receipt capability security smoke checks passed')

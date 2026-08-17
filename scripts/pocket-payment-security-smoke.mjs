import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { consumePocketPaymentApproval, createPocketPaymentSecurityHandler } from '../api/pocket/payment-security.ts'

function response() {
  return { statusCode: 200, payload: undefined, headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(value) { this.payload = value; return this } }
}
async function call(handler, method, body = {}) {
  const res = response()
  await handler({ method, body, headers: {} }, res)
  return res
}

let now = 1_800_000_000_000
let randomCounter = 0
const handler = createPocketPaymentSecurityHandler({
  verifyUser: async () => ({ userId: 'did:privy:pocket-pin-smoke', email: 'pin@example.com' }),
  now: () => now,
  random: size => Buffer.alloc(size, ++randomCounter),
})

const initial = await call(handler, 'GET')
assert.equal(initial.payload.configured, false)
assert.equal((await call(handler, 'POST', { action: 'setup', pin: '123456' })).statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'setup', pin: '654321' })).statusCode, 409)
assert.equal((await call(handler, 'POST', { action: 'verify', pin: '000000' })).statusCode, 401)
const approved = await call(handler, 'POST', { action: 'verify', pin: '123456' })
assert.equal(approved.statusCode, 200)
assert.match(approved.payload.approvalToken, /^[A-Za-z0-9_-]{32,}$/)
for (let index = 0; index < 4; index += 1) assert.equal(await consumePocketPaymentApproval(approved.payload.approvalToken, 'did:privy:pocket-pin-smoke', now), true)
assert.equal(await consumePocketPaymentApproval(approved.payload.approvalToken, 'did:privy:pocket-pin-smoke', now), false)
assert.equal((await call(handler, 'POST', { action: 'change', currentPin: '123456', newPin: '654321' })).statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'verify', pin: '123456' })).statusCode, 401)
assert.equal((await call(handler, 'POST', { action: 'verify', pin: '654321' })).statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'reset', pin: '111111', confirmReset: true })).statusCode, 200)

const circleSource = await readFile(new URL('../api/circle-solana-email.ts', import.meta.url), 'utf8')
const controllerSource = await readFile(new URL('../src/pocket/controllers/usePocketWithdrawalController.ts', import.meta.url), 'utf8')
const gateSource = await readFile(new URL('../src/pocket/components/PocketPaymentSecurityGate.tsx', import.meta.url), 'utf8')
assert.match(circleSource, /x-pocket-payment-approval/)
assert.match(circleSource, /idempotencyKey,/)
assert.match(controllerSource, /SOLANA_SEND_OPERATION_KEY/)
assert.match(gateSource, /Create your Pocket PIN/)
assert.match(gateSource, /readPocketPinWithBiometrics/)
console.log('Pocket payment security smoke test passed.')

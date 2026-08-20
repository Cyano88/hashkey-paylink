import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { consumePocketPaymentApproval, createPocketPaymentSecurityHandler } from '../api/pocket/payment-security.ts'

function response() {
  return { statusCode: 200, payload: undefined, headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(value) { this.payload = value; return this } }
}
async function call(handler, method, body = {}, headers = {}) {
  const res = response()
  await handler({ method, body, headers }, res)
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
assert.equal(await consumePocketPaymentApproval(approved.payload.approvalToken, 'did:privy:wrong-owner', now), false)
assert.equal(await consumePocketPaymentApproval(approved.payload.approvalToken, 'did:privy:pocket-pin-smoke', now), true)
assert.equal(await consumePocketPaymentApproval(approved.payload.approvalToken, 'did:privy:pocket-pin-smoke', now), false)
assert.equal((await call(handler, 'POST', { action: 'change', currentPin: '123456', newPin: '654321' })).statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'verify', pin: '123456' })).statusCode, 401)
assert.equal((await call(handler, 'POST', { action: 'verify', pin: '654321' })).statusCode, 200)
const resetStarted = await call(handler, 'POST', { action: 'begin-reset' }, { authorization: 'Bearer session-before-reset' })
assert.equal(resetStarted.statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'reset', pin: '111111', resetToken: resetStarted.payload.resetToken }, { authorization: 'Bearer session-before-reset' })).statusCode, 401)
assert.equal((await call(handler, 'POST', { action: 'reset', pin: '111111', resetToken: resetStarted.payload.resetToken }, { authorization: 'Bearer session-after-reauth' })).statusCode, 200)
assert.equal((await call(handler, 'POST', { action: 'reset', pin: '222222', resetToken: resetStarted.payload.resetToken }, { authorization: 'Bearer another-session' })).statusCode, 401)

const circleSource = await readFile(new URL('../api/circle-solana-email.ts', import.meta.url), 'utf8')
const controllerSource = await readFile(new URL('../src/pocket/controllers/usePocketWithdrawalController.ts', import.meta.url), 'utf8')
const gateSource = await readFile(new URL('../src/pocket/components/PocketPaymentSecurityGate.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/pocket/api/pocketPaymentSecurityClient.ts', import.meta.url), 'utf8')
assert.match(circleSource, /x-pocket-payment-approval/)
assert.match(circleSource, /findPaymentCircleLinkByWallet/)
assert.match(circleSource, /identity\.userId !== link\.privyUserId/)
assert.match(circleSource, /idempotencyKey,/)
assert.match(controllerSource, /SOLANA_SEND_OPERATION_KEY/)
assert.match(gateSource, /Create your Pocket PIN/)
assert.match(gateSource, /readPocketPinWithBiometrics/)
assert.match(clientSource, /pocketApiUrl\('\/api\/pocket\/payment-security\?v=1'\)/)
console.log('Pocket payment security smoke test passed.')
process.exit(0)

import assert from 'node:assert/strict'
import { PaycrestRequestError, resolvePaycrestOfframpAvailability, verifyPaycrestAccount } from '../api/paycrest-pos.ts'

const unavailable = amount => {
  throw new PaycrestRequestError(`No provider available for ${amount}`, 404, 'PAYCREST_ROUTE_UNAVAILABLE')
}

const exact = await resolvePaycrestOfframpAvailability({
  amount: '100',
  quote: async ({ amount }) => amount === '100' ? 1387.38 : unavailable(amount),
})
assert.deepEqual(exact, { requestedUsdc: '100', availableUsdc: '100', rate: 1387.38, exact: true })

const calls = []
const partial = await resolvePaycrestOfframpAvailability({
  amount: '20000',
  maxProbes: 8,
  quote: async ({ amount }) => {
    calls.push(amount)
    if (Number(amount) > 7500) return unavailable(amount)
    return 1390.98
  },
})
assert.equal(partial.exact, false)
assert.equal(partial.requestedUsdc, '20000')
assert.equal(partial.availableUsdc, '7500')
assert.equal(partial.rate, 1390.98)
assert.ok(calls.length <= 9)

let maintenanceCalls = 0
await assert.rejects(
  resolvePaycrestOfframpAvailability({
    amount: '20000',
    quote: async () => {
      maintenanceCalls += 1
      throw new PaycrestRequestError('Service maintenance', 503)
    },
  }),
  /Service maintenance/,
)
assert.equal(maintenanceCalls, 1)

await assert.rejects(
  resolvePaycrestOfframpAvailability({ amount: '0.5', quote: async ({ amount }) => unavailable(amount) }),
  error => error instanceof PaycrestRequestError && error.code === 'PAYCREST_ROUTE_UNAVAILABLE',
)

const originalFetch = globalThis.fetch
const originalApiKey = process.env.PAYCREST_API_KEY
process.env.PAYCREST_API_KEY = 'test-paycrest-key'
let verificationBody
globalThis.fetch = async (_url, init) => {
  verificationBody = JSON.parse(String(init?.body || '{}'))
  return new Response(JSON.stringify({ status: 'success', data: { accountName: 'TEST CUSTOMER' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
assert.equal(await verifyPaycrestAccount({ institution: 'OPAY', accountIdentifier: '0123456789' }), 'TEST CUSTOMER')
assert.deepEqual(verificationBody, { institution: 'OPAY', accountIdentifier: '0123456789', currency: 'NGN' })

globalThis.fetch = async () => new Response(JSON.stringify({
  status: 'error',
  message: 'Failed to validate payload',
  data: [{ field: 'currency', message: 'Currency is required' }],
}), { status: 400, headers: { 'content-type': 'application/json' } })
await assert.rejects(
  verifyPaycrestAccount({ institution: 'OPAY', accountIdentifier: '0123456789' }),
  /currency: Currency is required/,
)
globalThis.fetch = originalFetch
if (originalApiKey === undefined) delete process.env.PAYCREST_API_KEY
else process.env.PAYCREST_API_KEY = originalApiKey

console.log('Paycrest provider-boundary smoke tests passed: exact quotes, conservative available amounts, and service failures stay distinct.')

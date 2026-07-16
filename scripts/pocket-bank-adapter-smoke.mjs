import assert from 'node:assert/strict'
import { createPocketBankInstitutionsHandler } from '../api/pocket/bank-receive-institutions.ts'
import { createPocketBankVerifyHandler } from '../api/pocket/bank-receive-verify.ts'
import {
  parsePocketBankInstitutions,
  parsePocketBankVerification,
  readPocketBankInstitutions,
  verifyPocketBankAccount,
} from '../src/pocket/api/pocketBankClient.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, body = undefined, headers = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers }, res)
  return res
}

const institutions = [
  { code: '001', name: 'Test Bank', type: 'bank' },
  { code: '002', name: 'Second Bank' },
]
const institutionCalls = []
const institutionsHandler = createPocketBankInstitutionsHandler({
  listInstitutions: async currency => {
    institutionCalls.push(currency)
    return institutions
  },
})

const wrongInstitutionsMethod = await request(institutionsHandler, 'POST')
assert.equal(wrongInstitutionsMethod.statusCode, 405)
const institutionsResponse = await request(institutionsHandler, 'GET')
assert.equal(institutionsResponse.statusCode, 200)
assert.deepEqual(institutionsResponse.body, { ok: true, institutions })
assert.deepEqual(institutionCalls, ['NGN'])
assert.deepEqual(parsePocketBankInstitutions(institutionsResponse.body), { institutions })

const invalidInstitutionsHandler = createPocketBankInstitutionsHandler({
  listInstitutions: async () => [{ code: '', name: 'Invalid bank' }],
})
const invalidInstitutions = await request(invalidInstitutionsHandler, 'GET')
assert.equal(invalidInstitutions.statusCode, 503)
assert.equal(invalidInstitutions.body.error.code, 'PROVIDER_UNAVAILABLE')

const bankRequest = {
  bank_code: '001',
  bank_name: 'Test Bank',
  account_number: '0123456789',
}
const verifyCalls = []
const verifyHandler = createPocketBankVerifyHandler({
  verifyUser: async req => {
    if (req.headers.authorization !== 'Bearer privy-secret') {
      throw Object.assign(new Error('Missing Privy access token.'), { status: 401 })
    }
    return { userId: 'privy-user-1', email: 'ada@example.com' }
  },
  verifyAccount: async body => {
    verifyCalls.push(body)
    return { account_name: 'ADA LOVELACE', bank_code: '001' }
  },
})

const unauthorized = await request(verifyHandler, 'POST', bankRequest)
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')
assert.equal(verifyCalls.length, 0)

const invalidVerification = await request(verifyHandler, 'POST', { ...bankRequest, account_number: '123' }, {
  authorization: 'Bearer privy-secret',
})
assert.equal(invalidVerification.statusCode, 400)
assert.equal(invalidVerification.body.error.field, 'bankAccount')
assert.equal(verifyCalls.length, 0)

const verified = await request(verifyHandler, 'POST', bankRequest, {
  authorization: 'Bearer privy-secret',
})
assert.equal(verified.statusCode, 200)
assert.deepEqual(verified.body, { ok: true, account_name: 'ADA LOVELACE', bank_code: '001' })
assert.deepEqual(verifyCalls, [bankRequest])
assert.deepEqual(parsePocketBankVerification(verified.body), {
  account_name: 'ADA LOVELACE',
  bank_code: '001',
})
const serializedVerification = JSON.stringify(verified.body)
assert.equal(serializedVerification.includes('0123456789'), false)
assert.equal(serializedVerification.includes('privy-user-1'), false)
assert.equal(serializedVerification.includes('ada@example.com'), false)
assert.equal(serializedVerification.includes('privy-secret'), false)

const providerFailureHandler = createPocketBankVerifyHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  verifyAccount: async () => { throw Object.assign(new Error('Paycrest unavailable.'), { status: 503 }) },
})
const providerFailure = await request(providerFailureHandler, 'POST', bankRequest)
assert.equal(providerFailure.statusCode, 503)
assert.equal(providerFailure.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(providerFailure.body.error.retryable, true)

const readCalls = []
const readResult = await readPocketBankInstitutions(async (url, init) => {
  readCalls.push({ url, init })
  return { ok: true, json: async () => institutionsResponse.body }
})
assert.deepEqual(readResult, { institutions })
assert.equal(readCalls[0].url, '/api/pocket/bank-receive/institutions')
assert.equal(readCalls[0].init.method, 'GET')
assert.equal(readCalls[0].init.headers, undefined)

const clientCalls = []
const clientResult = await verifyPocketBankAccount({
  accessToken: 'client-privy-token',
  request: bankRequest,
  fetcher: async (url, init) => {
    clientCalls.push({ url, init })
    return { ok: true, json: async () => verified.body }
  },
})
assert.deepEqual(clientResult, { account_name: 'ADA LOVELACE', bank_code: '001' })
assert.equal(clientCalls[0].url, '/api/pocket/bank-receive/verify')
assert.equal(clientCalls[0].init.method, 'POST')
assert.equal(clientCalls[0].init.headers.authorization, 'Bearer client-privy-token')
assert.deepEqual(JSON.parse(clientCalls[0].init.body), bankRequest)

console.log('Circle Pocket bank metadata and verification adapter smoke tests passed.')

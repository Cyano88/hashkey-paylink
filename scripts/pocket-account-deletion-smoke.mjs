import assert from 'node:assert/strict'
import { createPocketAccountHandler } from '../api/pocket/account.ts'

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

function request(method = 'DELETE', confirmation = 'DELETE') {
  return { method, body: { confirmation }, headers: {} }
}

const calls = []
const dependencies = {
  verifyUser: async () => ({ userId: 'privy:test-user', email: 'test@example.com' }),
  deleteProfile: async () => { calls.push('profile') },
  deleteCircleLinks: async () => { calls.push('links') },
  deletePushDevices: async () => { calls.push('push') },
  deletePaymentSecurity: async () => { calls.push('security') },
  deleteHelper: async identity => { assert.equal(identity.storageKey, 'privy:privy:test-user'); calls.push('helper') },
  redactSupport: async profileId => { assert.match(profileId, /^[a-f0-9]{32}$/); calls.push('support') },
  deleteIdentity: async () => { calls.push('identity') },
}

const handler = createPocketAccountHandler(dependencies)
{
  const res = response()
  await handler(request('POST'), res)
  assert.equal(res.statusCode, 405)
}
{
  const res = response()
  await handler(request('DELETE', 'delete'), res)
  assert.equal(res.statusCode, 400)
}
{
  const res = response()
  await handler(request(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.deepEqual(calls, ['push', 'security', 'links', 'helper', 'support', 'profile', 'identity'])
}
{
  const failedCalls = []
  const failing = createPocketAccountHandler({
    ...dependencies,
    deleteCircleLinks: async () => { failedCalls.push('links'); throw new Error('storage unavailable') },
    deleteIdentity: async () => { failedCalls.push('identity') },
  })
  const res = response()
  await failing(request(), res)
  assert.equal(res.statusCode, 503)
  assert.deepEqual(failedCalls, ['links'])
}

console.log('Pocket account deletion smoke checks passed.')

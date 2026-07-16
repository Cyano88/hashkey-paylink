import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalCurrencyProfileRepository } from '../api/local-currency-profile.ts'
import { createPocketProfileHandler } from '../api/pocket/profile.ts'
import { isPocketMutationResult } from '../src/pocket/lib/pocketSchemas.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function request(handler, method, body = undefined, headers = {}) {
  const res = responseRecorder()
  await handler({ method, headers, body }, res)
  return res
}

const root = await mkdtemp(join(tmpdir(), 'pocket-profile-adapter-'))
try {
  let clock = 0
  const repository = createLocalCurrencyProfileRepository({
    storePath: join(root, 'profiles.json'),
    durable: false,
    isRender: false,
    now: () => `2026-07-15T01:00:0${++clock}.000Z`,
  })
  const handler = createPocketProfileHandler({
    verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
    repository,
    requestId: () => 'profile-request-test',
  })

  const emptyRead = await request(handler, 'GET')
  assert.deepEqual(emptyRead.body, { ok: true, email: 'ada@example.com', profile: null })

  const missingKey = await request(handler, 'POST', { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' })
  assert.equal(missingKey.statusCode, 400)
  assert.equal(missingKey.body.error.field, 'idempotencyKey')
  assert.equal(isPocketMutationResult(missingKey.body), true)

  const key = 'pocket:profile-save:test-request-00000001'
  const invalidBody = await request(handler, 'POST', { firstName: '', lastName: 'Lovelace', email: 'invalid' }, { 'idempotency-key': key })
  assert.equal(invalidBody.statusCode, 400)
  assert.equal(invalidBody.body.error.code, 'VALIDATION_FAILED')

  const mismatchedEmail = await request(handler, 'POST', {
    firstName: 'Ada', lastName: 'Lovelace', email: 'other@example.com',
  }, { 'idempotency-key': key })
  assert.equal(mismatchedEmail.statusCode, 403)

  const firstSave = await request(handler, 'POST', {
    firstName: ' Ada ', lastName: 'Lovelace', email: 'ada@example.com',
  }, { 'idempotency-key': key })
  assert.equal(firstSave.statusCode, 200)
  assert.equal(isPocketMutationResult(firstSave.body), true)
  assert.equal(firstSave.body.data.profile.firstName, 'Ada')
  assert.equal(firstSave.body.data.unchanged, false)

  const retry = await request(handler, 'POST', {
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
  }, { 'idempotency-key': key })
  assert.equal(retry.statusCode, 200)
  assert.equal(retry.body.data.unchanged, true)
  assert.equal(retry.body.data.profile.updatedAt, firstSave.body.data.profile.updatedAt)

  const stale = await request(handler, 'POST', {
    firstName: 'Ada', lastName: 'Byron', email: 'ada@example.com', expectedUpdatedAt: '2026-07-14T00:00:00.000Z',
  }, { 'idempotency-key': 'pocket:profile-save:test-request-00000002' })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.error.code, 'VERSION_CONFLICT')

  const loaded = await request(handler, 'GET')
  assert.equal(loaded.body.profile.lastName, 'Lovelace')

  const unauthorizedHandler = createPocketProfileHandler({
    verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
    repository,
    requestId: () => 'profile-request-auth',
  })
  const unauthorized = await request(unauthorizedHandler, 'GET')
  assert.equal(unauthorized.statusCode, 401)
  assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('Circle Pocket profile adapter smoke tests passed.')

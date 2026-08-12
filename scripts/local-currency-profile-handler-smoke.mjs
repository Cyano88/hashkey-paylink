import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createLocalCurrencyProfileHandler,
  createLocalCurrencyProfileRepository,
} from '../api/local-currency-profile.ts'

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

async function request(handler, body) {
  const res = responseRecorder()
  await handler({ method: 'POST', headers: {}, body }, res)
  return res
}

const root = await mkdtemp(join(tmpdir(), 'pocket-profile-'))
try {
  let clock = 0
  const repository = createLocalCurrencyProfileRepository({
    storePath: join(root, 'profiles.json'),
    durable: false,
    isRender: false,
    now: () => `2026-07-15T00:00:0${++clock}.000Z`,
    generatePocketNumber: () => '12345678',
  })
  let identity = { userId: 'privy-user-1', email: 'ada@example.com' }
  const handler = createLocalCurrencyProfileHandler({
    verifyUser: async () => identity,
    repository,
  })

  const methodRes = responseRecorder()
  await handler({ method: 'GET', headers: {}, body: {} }, methodRes)
  assert.equal(methodRes.statusCode, 405)

  const missingAction = await request(handler, {})
  assert.equal(missingAction.statusCode, 400)
  assert.match(missingAction.body.error, /Missing action/)

  const invalidId = await request(handler, { action: 'save', pocket_id: '12345' })
  assert.equal(invalidId.statusCode, 400)

  const firstRead = await request(handler, { action: 'get' })
  assert.equal(firstRead.statusCode, 200)
  assert.equal(firstRead.body.profile.pocketNumber, '12345678')
  assert.equal(firstRead.body.profile.pocketId, '12345678')
  assert.equal(firstRead.body.profile.email, 'ada@example.com')

  const firstSave = await request(handler, { action: 'save', pocket_id: '23456789' })
  assert.equal(firstSave.statusCode, 200)
  assert.equal(firstSave.body.unchanged, false)
  assert.equal(firstSave.body.profile.pocketId, '23456789')

  const retry = await request(handler, { action: 'save', pocket_id: '23456789' })
  assert.equal(retry.statusCode, 200)
  assert.equal(retry.body.unchanged, true)
  assert.equal(retry.body.profile.updatedAt, firstSave.body.profile.updatedAt)

  const invalidVersion = await request(handler, {
    action: 'save', pocket_id: '34567890', expected_updated_at: 'not-a-date',
  })
  assert.equal(invalidVersion.statusCode, 400)

  const staleSave = await request(handler, {
    action: 'save', pocket_id: '34567890', expected_updated_at: '2026-07-14T00:00:00.000Z',
  })
  assert.equal(staleSave.statusCode, 409)

  const currentSave = await request(handler, {
    action: 'save', pocket_id: '34567890', expected_updated_at: firstSave.body.profile.updatedAt,
  })
  assert.equal(currentSave.statusCode, 200)
  assert.equal(currentSave.body.profile.pocketId, '34567890')

  const getProfile = await request(handler, { action: 'get' })
  assert.equal(getProfile.body.profile.pocketId, '34567890')

  const thirdRepository = createLocalCurrencyProfileRepository({
    storePath: join(root, 'concurrent.json'), durable: false, isRender: false,
    generatePocketNumber: (() => {
      const values = ['45678901', '56789012']
      return () => values.shift()
    })(),
  })
  await Promise.all([
    thirdRepository.ensure({ userId: 'user-a', email: 'ada@example.com' }),
    thirdRepository.ensure({ userId: 'user-b', email: 'grace@example.com' }),
  ])
  assert.equal((await thirdRepository.get('user-a'))?.email, 'ada@example.com')
  assert.equal((await thirdRepository.get('user-b'))?.email, 'grace@example.com')

  const authError = Object.assign(new Error('Missing Privy access token.'), { status: 401 })
  const authHandler = createLocalCurrencyProfileHandler({
    verifyUser: async () => { throw authError },
    repository,
  })
  const unauthorized = await request(authHandler, { action: 'get' })
  assert.equal(unauthorized.statusCode, 401)

  const renderRepository = createLocalCurrencyProfileRepository({
    storePath: join(root, 'render.json'), durable: false, isRender: true,
  })
  await assert.rejects(
    renderRepository.ensure({ userId: 'user-c', email: 'katherine@example.com' }),
    /Durable profile storage is not configured/,
  )

  const failingDurableRepository = createLocalCurrencyProfileRepository({
    durable: true,
    isRender: true,
    mutateDurable: async () => { throw new Error('database unavailable') },
  })
  await assert.rejects(
    failingDurableRepository.ensure({ userId: 'user-d', email: 'dorothy@example.com' }),
    /Durable profile storage failed/,
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('Circle Pocket profile handler smoke tests passed.')

import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storeDir = await mkdtemp(join(tmpdir(), 'hashpaylink-helper-identity-'))
delete process.env.DATABASE_URL
delete process.env.POSTGRES_URL
process.env.HELPER_PROFILE_STORE = join(storeDir, 'helper-profiles.json')
process.env.HELPER_PROFILE_STORE_KEY = `helper-profile-identity-smoke-${Date.now()}`

const { default: handler, __testHelperProfileIdentity } = await import('../api/helper-profile.ts')

const guestA = 'a'.repeat(64)
const guestB = 'b'.repeat(64)

const guestIdentityA = await __testHelperProfileIdentity.resolveProfileIdentity({
  headers: { 'x-helper-session': guestA },
}, async () => 'unused')
const guestIdentityARepeat = await __testHelperProfileIdentity.resolveProfileIdentity({
  headers: { 'x-helper-session': guestA },
}, async () => 'unused')
const guestIdentityB = await __testHelperProfileIdentity.resolveProfileIdentity({
  headers: { 'x-helper-session': guestB },
}, async () => 'unused')
assert.deepEqual(guestIdentityA, guestIdentityARepeat)
assert.notEqual(guestIdentityA.storageKey, guestIdentityB.storageKey)
assert.equal(guestIdentityA.storageKey.includes(guestA), false)

const privyIdentity = await __testHelperProfileIdentity.resolveProfileIdentity({
  headers: { authorization: 'Bearer valid-test-token', 'x-helper-session': guestA },
}, async token => token === 'valid-test-token' ? 'did:privy:user-1' : '')
assert.deepEqual(privyIdentity, { kind: 'privy', storageKey: 'privy:did:privy:user-1', subject: 'did:privy:user-1' })

await assert.rejects(
  __testHelperProfileIdentity.resolveProfileIdentity({ headers: {} }, async () => 'unused'),
  error => error?.status === 401,
)
await assert.rejects(
  __testHelperProfileIdentity.resolveProfileIdentity({ headers: { 'x-helper-session': 'guessable' } }, async () => 'unused'),
  error => error?.status === 401,
)

async function call({ method, headers = {}, query = {}, body = {} }) {
  let statusCode = 200
  let payload
  await handler({ method, headers, query, body }, {
    status(code) {
      statusCode = code
      return this
    },
    json(value) {
      payload = value
      return this
    },
  })
  return { statusCode, payload }
}

const missingSession = await call({ method: 'GET', query: { payer: 'victim@example.com' } })
assert.equal(missingSession.statusCode, 401)

const saved = await call({
  method: 'POST',
  headers: { 'x-helper-session': guestA },
  body: {
    action: 'save',
    payer: 'Shy',
    owner: 'victim@example.com',
    fallbackOwner: 'another-victim@example.com',
    displayName: 'Shy',
    memorySummary: 'Private Circle Pocket memory.',
  },
})
assert.equal(saved.statusCode, 200)
assert.equal(saved.payload?.profile?.displayName, 'Shy')

const bankPaylinkThread = await call({
  method: 'POST',
  headers: { 'x-helper-session': guestA },
  body: {
    action: 'append-thread',
    threadId: 'mode:circle-pocket',
    payer: 'Shy',
    mode: 'circle-pocket',
    question: 'Confirm',
    answer: 'Receive to Bank PayLink created.',
    paylink: {
      kind: 'bank-receive',
      mode: 'person',
      wallet: 'OPay ending 9696',
      network: 'base',
      label: 'Breakfast',
      target: 'James',
      amount: '5000',
      payUrl: '/pay/bank-test',
      currency: 'NGN',
      recipientLabel: 'OPay ending 9696',
    },
  },
})
assert.equal(bankPaylinkThread.statusCode, 200)
assert.equal(bankPaylinkThread.payload?.profile?.helperThread?.at(-1)?.paylink?.kind, 'bank-receive')
assert.equal(bankPaylinkThread.payload?.profile?.helperThread?.at(-1)?.paylink?.currency, 'NGN')
assert.equal(bankPaylinkThread.payload?.profile?.helperThread?.at(-1)?.paylink?.recipientLabel, 'OPay ending 9696')

const sameSession = await call({
  method: 'GET',
  headers: { 'x-helper-session': guestA },
  query: { payer: 'completely-different-name', owner: 'spoofed-owner' },
})
assert.match(sameSession.payload?.profile?.memorySummary ?? '', /^Private Circle Pocket memory\./)

const foreignSession = await call({
  method: 'GET',
  headers: { 'x-helper-session': guestB },
  query: { payer: 'Shy', owner: 'victim@example.com' },
})
assert.equal(foreignSession.statusCode, 200)
assert.equal(foreignSession.payload?.profile, null)

console.log('helper profile identity smoke ok')

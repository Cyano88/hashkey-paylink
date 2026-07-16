import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  applyCircleLinkDelete,
  applyCircleLinkSet,
  CircleLinkVersionConflictError,
  createPrivyCircleLinkHandler,
  verifyCircleLinkWallet,
} from '../api/privy-circle-link.ts'

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

async function request(handler, body, method = 'POST') {
  const res = responseRecorder()
  await handler({ method, headers: {}, body }, res)
  return res
}

const records = new Map()
const verifiedWallets = []
const handler = createPrivyCircleLinkHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  read: async key => records.get(key) ?? null,
  write: async (key, record) => { records.set(key, record) },
  remove: async key => { records.delete(key) },
  verifyWallet: async input => { verifiedWallets.push(input) },
})

assert.equal((await request(handler, {}, 'GET')).statusCode, 405)
assert.equal((await request(handler, {})).statusCode, 400)
assert.match((await request(handler, { action: 'resolve', chain: 'polygon' })).body.error, /Unsupported Circle link chain/)
assert.match((await request(handler, { action: 'resolve', chain: 'base', purpose: 'invented' })).body.error, /Unsupported Circle link purpose/)

const wallet = {
  id: 'circle-wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  blockchain: 'BASE',
}
const missingSession = await request(handler, { action: 'link', chain: 'base', email: 'ada@example.com', wallet })
assert.equal(missingSession.statusCode, 400)
assert.match(missingSession.body.error, /valid Circle wallet session/)

const wrongChain = await request(handler, {
  action: 'link', chain: 'base', email: 'ada@example.com', circleUserToken: 'circle-user-token',
  wallet: { ...wallet, blockchain: 'ARB' },
})
assert.equal(wrongChain.statusCode, 400)
assert.match(wrongChain.body.error, /blockchain does not match/)

const wrongEmail = await request(handler, {
  action: 'link', chain: 'base', email: 'other@example.com', circleUserToken: 'circle-user-token', wallet,
})
assert.equal(wrongEmail.statusCode, 403)

const linked = await request(handler, {
  action: 'link', chain: 'base', email: 'ada@example.com', circleUserToken: 'circle-user-token', wallet,
})
assert.equal(linked.statusCode, 200)
assert.equal(linked.body.link.circleWalletId, wallet.id)
assert.equal('circleUserToken' in linked.body.link, false)
assert.equal(verifiedWallets.length, 1)
assert.equal(verifiedWallets[0].userToken, 'circle-user-token')

const resolved = await request(handler, { action: 'resolve', chain: 'base' })
assert.equal(resolved.body.link.circleWalletAddress, wallet.address)
const unlinked = await request(handler, { action: 'unlink', chain: 'base' })
assert.deepEqual(unlinked.body, { ok: true, email: 'ada@example.com', link: null })
assert.equal((await request(handler, { action: 'resolve', chain: 'base' })).body.link, null)

const agentLink = await request(handler, {
  action: 'link', chain: 'base', purpose: 'agent', email: 'ada@example.com',
  wallet: { ...wallet, id: 'agent:wallet:1' },
})
assert.equal(agentLink.statusCode, 200)
assert.equal(verifiedWallets.length, 1)

const unauthorizedHandler = createPrivyCircleLinkHandler({
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
  read: async () => null,
  write: async () => undefined,
  remove: async () => undefined,
  verifyWallet: async () => undefined,
})
assert.equal((await request(unauthorizedHandler, { action: 'resolve', chain: 'base' })).statusCode, 401)

await verifyCircleLinkWallet({
  userToken: 'owned-token',
  chain: 'base',
  wallet,
  listWallets: async () => [{ ...wallet, address: wallet.address.toUpperCase() }],
})
await assert.rejects(
  verifyCircleLinkWallet({
    userToken: 'unowned-token',
    chain: 'base',
    wallet,
    listWallets: async () => [{ ...wallet, id: 'different-wallet' }],
  }),
  error => error.status === 403 && /ownership could not be verified/.test(error.message),
)
await assert.rejects(
  verifyCircleLinkWallet({
    userToken: 'wrong-blockchain-token',
    chain: 'base',
    wallet: { ...wallet, blockchain: 'ARB' },
    listWallets: async () => [wallet],
  }),
  error => error.status === 403 && /ownership could not be verified/.test(error.message),
)

const linkClientSource = await readFile(new URL('../src/lib/privyCircleLink.ts', import.meta.url), 'utf8')
assert.match(linkClientSource, /circleUserToken:\s*params\.circleUserToken/)
const agentWorkspaceSource = await readFile(new URL('../src/pages/AgentWorkspace.tsx', import.meta.url), 'utf8')
assert.match(agentWorkspaceSource, /savePrivyCircleLink\(\{/)
assert.match(agentWorkspaceSource, /purpose:\s*'agent'/)
for (const relativePath of ['../src/pages/CreateLink.tsx', '../src/pages/PaymentPage.tsx']) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /savePrivyCircleLink|unlinkPrivyCircleLink/)
  for (const call of source.matchAll(/\blinkPocketWallet\(\{/g)) {
    assert.match(source.slice(call.index, call.index + 500), /circleUserToken:\s*session\.userToken/)
  }
}

const casKey = 'privy-user-1:base'
const casStore = { links: {} }
const casCandidate = {
  privyUserId: 'privy-user-1',
  email: 'ada@example.com',
  chain: 'base',
  purpose: 'payment',
  circleWalletId: 'circle-wallet-1',
  circleWalletAddress: wallet.address,
  circleBlockchain: 'BASE',
  updatedAt: 0,
}
const created = applyCircleLinkSet(casStore, casKey, casCandidate, undefined, () => 100)
assert.equal(created.unchanged, false)
assert.equal(created.link.updatedAt, 100)
const retried = applyCircleLinkSet(casStore, casKey, { ...casCandidate, updatedAt: 999 }, undefined, () => 200)
assert.equal(retried.unchanged, true)
assert.equal(retried.link.updatedAt, 100)

const replacement = { ...casCandidate, circleWalletId: 'circle-wallet-2', circleWalletAddress: '0x2222222222222222222222222222222222222222' }
assert.throws(() => applyCircleLinkSet(casStore, casKey, replacement), CircleLinkVersionConflictError)
assert.throws(() => applyCircleLinkSet(casStore, casKey, replacement, 99), CircleLinkVersionConflictError)
const replaced = applyCircleLinkSet(casStore, casKey, replacement, 100, () => 200)
assert.equal(replaced.unchanged, false)
assert.equal(replaced.link.updatedAt, 200)
assert.equal(replaced.link.circleWalletId, 'circle-wallet-2')

assert.throws(() => applyCircleLinkDelete(casStore, casKey), CircleLinkVersionConflictError)
assert.throws(() => applyCircleLinkDelete(casStore, casKey, 100), CircleLinkVersionConflictError)
assert.deepEqual(applyCircleLinkDelete(casStore, casKey, 200), { link: null, unchanged: false })
assert.deepEqual(applyCircleLinkDelete(casStore, casKey, 200), { link: null, unchanged: true })
assert.throws(() => applyCircleLinkSet(casStore, casKey, casCandidate, 200), CircleLinkVersionConflictError)

const handlerSource = await readFile(new URL('../api/privy-circle-link.ts', import.meta.url), 'utf8')
const lockIndex = handlerSource.indexOf("select pg_advisory_xact_lock(hashtext($1))")
const lockedReadIndex = handlerSource.indexOf("select * from privy_circle_links where link_key = $1 limit 1", lockIndex)
assert.ok(lockIndex >= 0 && lockedReadIndex > lockIndex)
assert.match(handlerSource, /applyCircleLinkSet\(store, key, candidate, expectedUpdatedAt\)/)
assert.match(handlerSource, /applyCircleLinkDelete\(store, key, expectedUpdatedAt\)/)

console.log('Privy Circle link handler smoke tests passed.')

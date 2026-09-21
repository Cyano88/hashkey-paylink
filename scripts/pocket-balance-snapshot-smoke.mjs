import assert from 'node:assert/strict'
import { circleAmount, createPocketBalancesHandler } from '../api/pocket/balances.ts'
import { createEvmBalanceReader } from '../api/evm-balance.ts'
import { mergePocketBalance } from '../src/pocket/lib/pocketBalanceCache.ts'
import { pocketBalanceRevision } from '../src/pocket/lib/pocketBalanceRevision.ts'
import { refreshPocketData, registerPocketRefreshHandler } from '../src/pocket/lib/pocketRefresh.ts'

const provider = balance => ({ breakdown: [{ breakdown: [{ chain: 'Base', confirmedBalance: balance }] }] })
assert.equal(circleAmount(provider('0'), 'Base'), 0)
assert.equal(circleAmount(provider('2.500001'), 'Base'), 2.500001)
for (const value of [undefined, '', '-1', 'NaN', '1junk', 'Infinity']) assert.throws(() => circleAmount(provider(value), 'Base'))
assert.throws(() => circleAmount({ breakdown: [] }, 'Base'))
assert.throws(() => circleAmount(provider('3'), 'Arbitrum'))
const networks = ['base', 'arbitrum', 'arc', 'solana']
const wallets = { base: { address: '0x' + 'a'.repeat(40), walletId: 'base-fixture', updatedAt: 100 } }
const revisions = Object.fromEntries(await Promise.all(networks.map(async network => [network, await pocketBalanceRevision(network, wallets[network])])))
const result = { total: 7, totalComplete: true, unavailableNetworks: [], rows: networks.map(key => ({ key, label: key, balance: key === 'base' ? 7 : 0, status: 'ok', walletRevision: revisions[key], observedAt: 1000 })) }
const first = await mergePocketBalance(undefined, wallets, result)
assert.equal(first.displayTotal, 7); assert.equal(first.total, 7); assert.equal(first.displayComplete, true)
const failure = { ...result, total: 0, totalComplete: false, rows: result.rows.map(row => row.key === 'base' ? { ...row, status: 'error', balance: 0 } : row) }
const stale = await mergePocketBalance(first, wallets, failure)
assert.equal(stale.displayTotal, 7); assert.equal(stale.displayComplete, true); assert.equal(stale.totalComplete, false)
assert.equal(stale.rows[0].balance, 0, 'cached display is not a fresh spendable balance')
assert.equal(stale.displayRows[0].observedAt, 1000)
const zero = await mergePocketBalance(first, wallets, { ...result, total: 0, rows: result.rows.map(row => ({ ...row, balance: 0 })) })
assert.equal(zero.displayTotal, 0); assert.equal(zero.displayComplete, true, 'explicit verified zero replaces old money')
const replacement = { base: { ...wallets.base, address: '0x' + 'b'.repeat(40), updatedAt: 101 } }
const changed = await mergePocketBalance(first, replacement, result)
assert.equal(changed.displayRows[0].known, false); assert.equal(changed.displayRows[0].balance, 0); assert.equal(changed.displayComplete, false)
const mixed = await mergePocketBalance(first, wallets, { ...result, rows: result.rows.map(row => row.key === 'base' ? { ...row, walletRevision: 'f'.repeat(64), balance: 200 } : row) })
assert.equal(mixed.displayRows[0].known, false)
assert.equal(await pocketBalanceRevision('base', { ...wallets.base, address: wallets.base.address.toUpperCase() }), revisions.base)
assert.notEqual(await pocketBalanceRevision('solana', { address: 'CaseSensitive' }), await pocketBalanceRevision('solana', { address: 'casesensitive' }))
let clock = 0, calls = 0, resolve
const reader = createEvmBalanceReader(async () => { calls++; return 11n }, () => clock)
await reader('base', wallets.base.address); clock = 500; await reader('base', wallets.base.address, true); assert.equal(calls, 1)
clock = 1600; await reader('base', wallets.base.address, true); assert.equal(calls, 2)
await reader('base', wallets.base.address); assert.equal(calls, 2)
const slow = createEvmBalanceReader(async () => { calls++; return new Promise(done => { resolve = done }) })
const left = slow('base', wallets.base.address, true), right = slow('base', wallets.base.address, true)
await new Promise(done => setImmediate(done)); const before = calls; resolve(12n); await Promise.all([left, right]); assert.equal(calls, before)
let freshObserved
const handler = createPocketBalancesHandler({ verifyUser: async () => ({ userId: 'fixture' }), readLink: async key => key.endsWith(':base') ? { privyUserId: 'fixture', chain: 'base', purpose: 'payment', circleWalletId: wallets.base.walletId, circleWalletAddress: wallets.base.address, circleBlockchain: 'BASE', updatedAt: 100 } : null, readBalance: async (_network, _address, fresh) => { freshObserved = fresh; return 7 } })
const response = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
await handler({ method: 'GET', headers: {}, query: { refresh: '1' } }, response)
assert.equal(freshObserved, true); assert.equal(response.body.rows[0].walletRevision, revisions.base)
let finish, refreshes = 0
const unregister = registerPocketRefreshHandler(() => { refreshes++; return new Promise(done => { finish = done }) })
const a = refreshPocketData(), b = refreshPocketData()
assert.equal(a, b); await new Promise(done => setImmediate(done)); assert.equal(refreshes, 1)
let completed = false; a.then(() => { completed = true }); await new Promise(done => setImmediate(done)); assert.equal(completed, false)
finish(); await a; assert.equal(completed, true); unregister()
console.log('PASS: valid zero vs malformed fallback, wallet-revision binding, saved display on failure, migration invalidation, exact-chain identity, manual freshness, RPC dedupe and refresh completion.')

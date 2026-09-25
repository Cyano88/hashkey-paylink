import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDurablePocketActivityHandler } from '../api/pocket/activity-feed.ts'
import { createFileActivityStore } from '../api/pocket/activity-store.ts'
import { mergePocketActivityRows } from '../src/pocket/lib/pocketActivitySnapshot.ts'
import { createWalletActivityReader } from '../api/pocket/wallet-activity-cache.ts'

const row = (id, chain = 'base', extra = {}) => ({ eventId: id, txHash: '0x' + id.padStart(64, '0'), chain, payer: 'fixture', memo: 'Fixture USDC', amount: '1', ts: 1000 + Number(id), source: 'wallet-withdrawal', direction: 'out', ...extra })
const snapshot = payments => ({ payments, merchants: [], collections: [] })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const directory = await mkdtemp(join(tmpdir(), 'pocket-activity-test-'))
const store = createFileActivityStore(directory)
let clock = 100_000, calls = 0, fail = false, fresh = Array.from({ length: 6 }, (_, i) => row(String(i + 1)))
let releaseWallet
let walletReady = new Promise(resolve => { releaseWallet = resolve })
const sources = {
  resources: async () => ({ payments: [], merchants: [{ merchant_id: 'pos-fixture', display_name: 'Fixture POS' }], collections: [] }),
  wallets: async owner => { calls++; await walletReady; if (fail) throw Error('private-provider-key'); return snapshot(owner === 'owner-a' ? fresh : []) },
}
const dependencies = { verifyUser: async req => { if (!req.owner) throw Object.assign(Error('auth'), { status: 401 }); return { userId: req.owner } }, sources, store, now: () => clock, coldWaitMs: 25, sourceTimeoutMs: 5_000 }
const request = async (handler, owner = 'owner-a', scope, refresh = false) => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
  await handler({ method: 'GET', owner, query: { ...(scope ? { scope } : {}), ...(refresh ? { refresh: '1' } : {}) } }, res)
  return res
}
try {
  let handler = createDurablePocketActivityHandler(dependencies)
  const eventually = async predicate => {
    const deadline = Date.now() + 4_000
    let response
    do { response = await request(handler); if (predicate(response.body)) return response; await delay(20) } while (Date.now() < deadline)
    throw new Error('Activity snapshot did not become available.')
  }
  const first = await eventually(body => body.merchants.length === 1)
  assert.equal(first.body.merchants.length, 1, 'POS must load while the wallet provider is pending')
  assert.equal(first.body.partial, true)
  assert.equal(first.body.refreshing, true)
  await Promise.all(Array.from({ length: 6 }, () => request(handler)))
  assert.equal(calls, 1, 'concurrent refresh must be single flight')
  releaseWallet(); await delay(30)
  const loaded = await eventually(body => body.payments.length === 6)
  assert.equal(loaded.body.payments.length, 6)
  assert.equal(loaded.body.complete, true)
  assert.equal((await request(handler, 'owner-a', 'recent')).body.payments.length, 4)
  assert.equal((await request(handler, 'owner-b')).body.payments.length, 0)
  assert.equal((await request(handler, '')).code, 401)
  assert.equal((await request(handler, 'owner-a', 'invalid')).code, 400)
  // A brand new handler and file-store instance represents process restart.
  handler = createDurablePocketActivityHandler({ ...dependencies, store: createFileActivityStore(directory) })
  assert.equal((await request(handler)).body.payments.length, 6)
  clock += 20_000; fresh = []
  await request(handler); await delay(30)
  assert.equal((await request(handler)).body.payments.length, 6, 'empty bounded scans must retain old rows')
  clock += 70_000; fail = true
  const original = console.warn, warnings = []
  console.warn = (...args) => warnings.push(args)
  try {
    await request(handler); await delay(30)
    const partial = await request(handler)
    assert.equal(partial.body.payments.length, 6)
    assert.equal(partial.body.partial, true)
    assert(!JSON.stringify(warnings).includes('private-provider-key'))
  } finally { console.warn = original }
  const unavailable = createDurablePocketActivityHandler({ ...dependencies, store: { read: async () => { throw Error('database unavailable') }, mutate: store.mutate } })
  assert.equal((await request(unavailable)).code, 503)
  const old = row('7', 'base', { source: 'bank-withdraw', providerReference: 'order-7', paycrestStatus: 'processing' })
  const updated = { ...old, txHash: '0x' + 'b'.repeat(64), ts: 999999, paycrestStatus: 'reversed' }
  const merged = mergePocketActivityRows([old], [updated])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].paycrestStatus, 'reversed')
  assert.equal(merged[0].ts, old.ts)
  assert.equal(mergePocketActivityRows([{ ...old, refundAction: 'claim' }], [updated])[0].refundAction, undefined)
  assert.equal(mergePocketActivityRows([row('1')], [row('1', 'arbitrum')]).length, 2)
  assert.equal(mergePocketActivityRows([row('1')], [row('1', 'base', { source: 'purchase' })]).length, 1)
  assert.equal(mergePocketActivityRows([row('1')], [row('1', 'base', { direction: 'in', source: 'wallet-deposit' })]).length, 2)
  for (const source of ['bills', 'bank-withdraw']) {
    const debit = row('42')
    const payment = {...debit, source, eventId: source + '-42', paycrestStatus: 'processing', amountNgn: '200'}
    for (const [previous, incoming] of [[[debit], [payment]], [[payment], [debit]]]) {
      const grouped = mergePocketActivityRows(previous, incoming)
      assert.equal(grouped.length, 1, source + ' funding must not appear as another debit')
      assert.equal(grouped[0].source, source)
      assert.equal(grouped[0].paycrestStatus, 'processing', 'Funding confirmation is not provider delivery')
    }
  }
  // Short client deadlines must not discard persistence on eventual scan completion.
  let finish, observed = []
  const reader = createWalletActivityReader(async () => { await new Promise(resolve => { finish = resolve }); return [row('8')] }, Date.now, 1000, async (owner, rows) => { observed.push({ owner, rows }) })
  assert.deepEqual(await reader('fixture-owner', 'base', 'fixture-wallet', 1), [])
  finish(); await delay(10)
  assert.equal(observed.length, 1); assert.equal(observed[0].owner, 'fixture-owner')
  fail = false; fresh = [row('9')]; clock += 6_000
  const manual = await request(handler, 'owner-a', undefined, true)
  assert.equal(manual.body.refreshing, false, 'manual refresh awaits source completion')
  assert(manual.body.payments.some(item => item.eventId === '9'))
  console.log('PASS: durable restart, partial/empty retention, POS before RPC, single flight, owner isolation, recent max 4, status updates, cross-chain dedup, durable scan completion, storage failure.')
} finally { await rm(directory, { recursive: true, force: true }) }

import assert from 'node:assert/strict'
import { evmActivity, solanaActivity } from '../api/pocket/wallet-chain-activity.ts'
import { createWalletActivityReader } from '../api/pocket/wallet-activity-cache.ts'
import { createReadService, ReadRpcError, validateRead } from '../api/evm-read.ts'
const wallet = '0x' + '11'.repeat(20), other = '0x' + '22'.repeat(20)
const topic = address => '0x' + address.slice(2).padStart(64, '0')
const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const log = (id, from, to) => ({ transactionHash: '0x' + id.repeat(64), logIndex: '0x0', blockNumber: '0x64', topics: [transfer, topic(from), topic(to)], data: '0xf4240' })
const incoming = log('a', other, wallet), outgoing = log('b', wallet, other), self = log('c', wallet, wallet), unrelated = log('d', other, other)
const calls = []
const scanRead = async (network, method, params, signal) => {
  validateRead(method, params); signal.throwIfAborted(); calls.push({ network, method, params })
  if (method === 'eth_blockNumber') return '0x100'
  if (method === 'eth_getLogs') return params[0].topics[1] === topic(wallet) ? [outgoing, self, unrelated] : [incoming, self]
  return { timestamp: '0x65' }
}
const rows = await evmActivity('base', wallet, new AbortController().signal, scanRead)
assert.equal(rows.length, 3)
assert.equal(rows.filter(x => x.direction === 'in').length, 1)
assert.equal(rows.filter(x => x.direction === 'out').length, 2)
assert(rows.every(x => x.amount === '1' && x.ts === 101000))
assert.equal(calls.filter(x => x.method === 'eth_getBlockByNumber').length, 1)
assert(calls.filter(x => x.method === 'eth_getLogs').every(x => x.params[0].topics.includes(topic(wallet))))
// Public Arc scans retain coverage while reducing default log queries to two.
const savedArc = process.env.PRIVATE_RPC_URL_ARC_MAINNET
const savedRange = process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE
delete process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE
delete process.env.PRIVATE_RPC_URL_ARC_MAINNET
try {
 calls.length = 0
 await evmActivity('arc', wallet, new AbortController().signal, scanRead)
 assert.equal(calls.filter(x => x.method === 'eth_getLogs').length, 2)
 process.env.PRIVATE_RPC_URL_ARC_MAINNET = 'https://private-provider.invalid'
 calls.length = 0
 await evmActivity('arc', wallet, new AbortController().signal, scanRead)
 assert.equal(calls.filter(x => x.method === 'eth_getLogs').length, 24)
 process.env.PRIVATE_RPC_URL_ARC_MAINNET = 'https://rpc.mainnet.arc.io'
 process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE = '10'
 calls.length = 0
 await evmActivity('arc', wallet, new AbortController().signal, scanRead)
 assert.equal(calls.filter(x => x.method === 'eth_getLogs').length, 24)
} finally {
 if(savedArc===undefined)delete process.env.PRIVATE_RPC_URL_ARC_MAINNET;else process.env.PRIVATE_RPC_URL_ARC_MAINNET=savedArc
 if(savedRange===undefined)delete process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE;else process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE=savedRange
}
// Abort after one response stops the next chunk/direction/timestamp request.
const abort = new AbortController(); let scanned = 0
await assert.rejects(evmActivity('base', wallet, abort.signal, async (_n, method) => {
  scanned++; if (method === 'eth_blockNumber') return '0x64'
  abort.abort(); return []
}))
assert.equal(scanned, 2)
let now = 100, count = 0, release
const reader = createWalletActivityReader(async () => { count++; await new Promise(r => { release = r }); return rows }, () => now)
const one = reader('owner-a', 'base', wallet), two = reader('owner-a', 'base', wallet)
await new Promise(r => setImmediate(r)); assert.equal(count, 1); release()
const [r1, r2] = await Promise.all([one, two]); assert.deepEqual(r1, rows); r1[0].amount = 'changed'
assert.equal((await reader('owner-a', 'base', wallet))[0].amount, '1'); assert.equal(count, 1)
const otherOwner = reader('owner-b', 'base', wallet); await new Promise(r => setImmediate(r)); assert.equal(count, 2); release(); await otherOwner
const otherNetwork = reader('owner-a', 'arbitrum', wallet); await new Promise(r => setImmediate(r)); assert.equal(count, 3); release(); await otherNetwork
now += 30001
const refreshed = reader('owner-a', 'base', wallet); await new Promise(r => setImmediate(r)); assert.equal(count, 4); release(); await refreshed
// Short UI wait does not launch duplicate scans or discard the eventual cache.
let finish, shortCalls = 0
const shortReader = createWalletActivityReader(async () => { shortCalls++; await new Promise(r => { finish = r }); return rows })
assert.deepEqual(await shortReader('owner', 'base', wallet, 5), [])
const full = shortReader('owner', 'base', wallet); finish(); assert.deepEqual(await full, rows); assert.equal(shortCalls, 1)
// Failure backoff is not cached as a successful empty wallet; last success survives briefly.
let fail = false, attempts = 0, clock = 10
const recovery = createWalletActivityReader(async () => { attempts++; if (fail) throw Error('https://secret-provider.invalid/private-key'); return rows }, () => clock)
await recovery('owner', 'base', wallet); fail = true; clock += 30001
const originalWarn = console.warn, warnings = []; console.warn = (...args) => warnings.push(args)
try {
  assert.deepEqual(await recovery('owner', 'base', wallet), rows)
  await recovery('owner', 'base', wallet); assert.equal(attempts, 2)
  clock += 15001; fail = false; await recovery('owner', 'base', wallet); assert.equal(attempts, 3)
  let quotas = 0, quotaClock = 0
  const quotaReader = createWalletActivityReader(async () => { quotas++; throw new ReadRpcError(-32004, 'quota') }, () => quotaClock)
  await quotaReader('a', 'base', wallet); await quotaReader('b', 'base', other); assert.equal(quotas, 1)
  quotaClock = 60001; await quotaReader('a', 'base', wallet); assert.equal(quotas, 2)
  let cancelled = false
  const deadlines = createWalletActivityReader(async (_n, _w, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { cancelled = true; reject(Error('cancelled')) }, { once: true })
  }), Date.now, 15)
  await deadlines('a', 'base', wallet)
  await new Promise(r => setTimeout(r, 5)); assert.equal(cancelled, true)
  assert(!JSON.stringify(warnings).includes('secret-provider'))
} finally { console.warn = originalWarn }
// Cancelling a gateway scan must abort fetch and never invoke its fallback.
process.env.PRIVATE_RPC_URL = 'https://primary.invalid'
let requests = 0, fetchAborted = false
const cancellable = createReadService(async (_url, init) => {
  requests++
  return new Promise((_, reject) => init.signal.addEventListener('abort', () => { fetchAborted = true; reject(Error('aborted')) }, { once: true }))
})
const ctrl = new AbortController(), inflight = cancellable('base', 'eth_blockNumber', [], ctrl.signal)
ctrl.abort(); await assert.rejects(inflight); assert.equal(requests, 1); assert.equal(fetchAborted, true)
// Independent checkout and cancellable scan do not share cancellation ownership.
let resolveCheckout
const isolated = createReadService(async (_url, init) => new Promise((resolve, reject) => {
  if (JSON.parse(init.body).method !== 'eth_blockNumber') throw Error('unexpected')
  init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })
  resolveCheckout ??= () => resolve(new Response(JSON.stringify({ result: '0x64' })))
}))
const checkout = isolated('base', 'eth_blockNumber', [])
const scanCtrl = new AbortController(), scan = isolated('base', 'eth_blockNumber', [], scanCtrl.signal)
scanCtrl.abort(); await assert.rejects(scan); resolveCheckout(); assert.equal(await checkout, '0x64')
// Solana activity cancels actual SDK fetches and never retries a 429.
process.env.SOLANA_RPC_URL = 'https://solana.invalid'
const solCtrl = new AbortController(); let solAborted = false, solRequests = 0
const solPending = solanaActivity('11111111111111111111111111111111', solCtrl.signal, async (_url, init) => {
  solRequests++
  return new Promise((_, reject) => init.signal.addEventListener('abort', () => { solAborted = true; reject(Error('aborted')) }, { once: true }))
})
await new Promise(r => setImmediate(r)); solCtrl.abort(); await assert.rejects(solPending)
assert.equal(solAborted, true); assert.equal(solRequests, 1)
let rejectedRequests = 0
await assert.rejects(solanaActivity('11111111111111111111111111111111', new AbortController().signal, async () => {
  rejectedRequests++; return new Response('private provider details', { status: 429 })
}))
assert.equal(rejectedRequests, 1)
// The global scan ceiling prevents unbounded distinct-wallet fan-out.
const releases = []; let activeScans = 0
const bounded = createWalletActivityReader(async () => { activeScans++; await new Promise(r => releases.push(r)); return [] })
const busy = Array.from({ length: 16 }, (_, i) => bounded('owner-' + i, 'base', wallet))
await new Promise(r => setImmediate(r))
assert.deepEqual(await bounded('overflow', 'base', wallet), []); assert.equal(activeScans, 16)
releases.forEach(r => r()); await Promise.all(busy)
console.log('Pocket activity RPC budget: wallet filters, dedupe, cache isolation, failure backoff, quota cooldown, deadlines and checkout cancellation isolation passed')

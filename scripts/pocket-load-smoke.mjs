import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createPocketBalancesHandler } from '../api/pocket/balances.ts'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const handler = createPocketBalancesHandler({
  verifyUser: async () => ({ userId: 'load-user' }),
  readLink: async key => ({ privyUserId: 'load-user', chain: key.split(':').at(-1), purpose: 'payment', circleWalletId: key, circleWalletAddress: key, circleBlockchain: 'ETH', updatedAt: Date.now() }),
  readBalance: async () => { await delay(50); return 1 },
})
const request = async () => {
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await handler({ method: 'GET', headers: {} }, res)
  return res
}
const started = performance.now()
const results = await Promise.all(Array.from({ length: 25 }, request))
const elapsed = performance.now() - started
assert.ok(results.every(result => result.statusCode === 200 && result.body.total === 3))
assert.ok(elapsed < 1_000, `Concurrent balance read took ${Math.round(elapsed)}ms`)
console.log(`Pocket load smoke passed: 25 concurrent snapshots in ${Math.round(elapsed)}ms.`)

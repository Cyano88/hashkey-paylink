import assert from 'node:assert/strict'
import { readPendingPocketBridge, savePendingPocketBridge, parsePocketPendingBridge } from '../src/pocket/lib/pocketPendingBridge.ts'
import { createPocketBridgeHandler } from '../api/pocket/bridge.ts'
const values = new Map()
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
const attempt = { id: 'attempt-1', source: 'base', destination: 'arc', amount: '2.25', createdAt: 1234, challengeId: 'challenge-1' }
savePendingPocketBridge('owner-a', attempt, storage)
assert.deepEqual(readPendingPocketBridge('owner-a', storage), attempt, 'pending approval survives a new reader')
assert.equal(readPendingPocketBridge('owner-b', storage), null, 'account switch must not reveal another pending transfer')
const submitted = { ...attempt, txHash: '0x' + 'a'.repeat(64) }
savePendingPocketBridge('owner-a', submitted, storage)
assert.equal(readPendingPocketBridge('owner-a', storage).txHash, submitted.txHash)
assert.throws(() => savePendingPocketBridge('owner-a', attempt, { setItem() { throw Error('disk full') } }), /disk full/, 'storage failure must block submission')
assert.throws(() => parsePocketPendingBridge({ ...attempt, destination: 'base' }))
assert.throws(() => parsePocketPendingBridge({ ...attempt, amount: '-1' }))
assert.throws(() => readPendingPocketBridge('owner-a', { getItem: () => '{broken' }), 'corruption must not be mistaken for no pending bridge')
savePendingPocketBridge('owner-a', null, storage)
assert.equal(readPendingPocketBridge('owner-a', storage), null)
let requestedOwner
const handler = createPocketBridgeHandler({
  verifyUser: async () => ({ userId: 'owner-a' }),
  listActions: async (owner, limit, action, unresolved) => {
    requestedOwner = owner
    assert.equal(action, 'wallet.bridge'); assert.equal(unresolved, true)
    return [
      { id: 'pending-a', ownerId: 'owner-a', action, status: 'submitted', createdAt: 1234, metadata: { ...submitted, secret: 'never-return' } },
      { id: 'pending-b', ownerId: 'owner-b', action, status: 'submitted', metadata: submitted },
      { id: 'complete-a', ownerId: 'owner-a', action, status: 'completed', metadata: submitted },
    ]
  },
})
const res = { code: 200, status(code) { this.code=code;return this }, json(value) { this.body=value;return this } }
await handler({ method: 'GET', query: { action: 'pending' }, headers: {} }, res)
assert.equal(requestedOwner, 'owner-a')
assert.equal(res.body.pending.length, 1)
assert.equal(res.body.pending[0].id, 'pending-a')
assert.equal(res.body.pending[0].secret, undefined)
assert.equal(res.body.pending[0].ownerId, undefined)
parsePocketPendingBridge(res.body.pending[0])
console.log('Pocket bridge recovery tests passed.')

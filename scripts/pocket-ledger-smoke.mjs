import assert from 'node:assert/strict'
import { appendPocketMoneyLedgerEvent, listPocketMoneyLedgerEvents } from '../api/pocket/money-ledger.ts'

const ownerId = 'ledger-owner-' + Date.now()
const base = { ownerId, executionId: 'pex-ledger-1', rail: 'bank_payout', asset: 'USDC', amount: '1', sourceNetwork: 'base', settlementNetwork: 'base', metadata: {} }
const prepared = await appendPocketMoneyLedgerEvent({ ...base, eventKey: 'ledger:test:prepared:' + ownerId, state: 'prepared', recordedAt: 100 })
await appendPocketMoneyLedgerEvent({ ...base, eventKey: 'ledger:test:submitted:' + ownerId, state: 'submitted', recordedAt: 200, transactionHash: '0xtest' })
await appendPocketMoneyLedgerEvent({ ...base, eventKey: 'ledger:test:processing:' + ownerId, state: 'processing', recordedAt: 200 })
await appendPocketMoneyLedgerEvent({ ...base, eventKey: prepared.eventKey, state: 'failed', recordedAt: 300 })
const first = await listPocketMoneyLedgerEvents({ ownerId, limit: 1 })
assert.equal(first.events.length, 1)
assert.ok(['submitted', 'processing'].includes(first.events[0].state))
assert.ok(first.nextCursor)
const second = await listPocketMoneyLedgerEvents({ ownerId, limit: 10, cursor: first.nextCursor })
assert.equal(second.events.length, 2)
assert.ok(second.events.some(event => event.recordedAt === 200))
assert.ok(second.events.some(event => event.state === 'prepared'))
await assert.rejects(listPocketMoneyLedgerEvents({ ownerId, cursor: 'broken' }), /cursor is invalid/i)
assert.equal((await listPocketMoneyLedgerEvents({ ownerId: 'another-owner' })).events.length, 0)
console.log('Pocket append-only ledger smoke tests passed.')

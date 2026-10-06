import assert from 'node:assert/strict'
import { encodeEventTopics, encodeAbiParameters, parseAbiItem } from 'viem'
import { exactTokenTransfer } from '../api/exact-token-transfer.ts'

const token = '0x' + '1'.repeat(40), payer = '0x' + '2'.repeat(40), recipient = '0x' + '3'.repeat(40)
const event = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const log = (units, extra = {}) => ({ address: token, topics: encodeEventTopics({ abi: [event], eventName: 'Transfer', args: { from: payer, to: recipient } }), data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(units)]), ...extra })
const intent = { token, payer, recipient, units: '100' }
const verify = (logs, overrides = {}, status = 'success') => exactTokenTransfer({ ...intent, ...overrides }, { status, logs })
assert.equal(verify([log(100)]), true)
assert.equal(verify([log(99)]), false)
assert.equal(verify([log(101)]), false)
assert.equal(verify([log(100), log(1)]), false, 'An extra transfer to the same recipient is not an exact payment')
assert.equal(verify([log(40), log(60)]), true)
assert.equal(verify([log(100, { removed: true })]), false)
assert.equal(verify([log(100)], {}, 'reverted'), false)
assert.equal(verify([log(100, { address: recipient })]), false)
assert.equal(verify([log(100)], { payer: token }), false)
assert.equal(verify([log(100)], { recipient: token }), false)
assert.equal(verify([log(100)], { units: '0' }), false)
assert.equal(verify([log(100)], { token: 'invalid' }), false)
assert.equal(verify([log(100)], { units: '1e2' }), false)
assert.equal(verify([log(100, { data: '0x' })]), false)
console.log('Exact token proof passed: token, payer, recipient, amount, extra transfers, removed logs and reverts.')

import assert from 'node:assert/strict'
import { createPocketBridgeHandler } from '../api/pocket/bridge.ts'
import { cctpMintRecipient, formatUsdcUnits, parseUsdcAmount } from '../api/pocket/cctp.ts'

function responseRecorder() {
  return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

async function request(handler, { method = 'POST', body = {}, query = {} } = {}) {
  const res = responseRecorder()
  await handler({ method, body, query, headers: {} }, res)
  return res
}

assert.equal(parseUsdcAmount('1.000001'), 1_000_001n)
assert.equal(formatUsdcUnits(1_230_000n), '1.23')
assert.equal(cctpMintRecipient('base', '0x1111111111111111111111111111111111111111'), `0x${'0'.repeat(24)}${'1'.repeat(40)}`)
assert.throws(() => parseUsdcAmount('1.0000001'))

const records = []
const handler = createPocketBridgeHandler({
  verifyUser: async () => ({ userId: 'privy-bridge-user', email: 'bridge@example.com' }),
  readLink: async key => ({ circleWalletAddress: key.endsWith(':solana') ? '4QW6qgCGxSFi1zTb1nrqdjuQFCbVuxLiCLNTZb8qovCE' : '0x1111111111111111111111111111111111111111' }),
  readSolanaRecipient: async () => ({ needsSetup: true }),
  quote: async (_source, _destination, transferUnits) => ({ transferUnits, forwardFeeUnits: 200_000n, protocolFeeUnits: 1_000n, maxFeeUnits: 201_000n, totalUnits: transferUnits + 201_000n, finalityThreshold: 1000 }),
  record: async input => { records.push(input); return { id: 'bridge-action-1' } },
  fetcher: async () => new Response(JSON.stringify({ messages: [{ forwardState: 'CONFIRMED', forwardTxHash: '0xdestination' }] }), { status: 200 }),
})

const quote = await request(handler, { body: { action: 'quote', source: 'base', destination: 'solana', amount: '2' } })
assert.equal(quote.statusCode, 200)
assert.deepEqual(quote.body.quote, {
  source: 'base', destination: 'solana', amount: '2', fee: '0.201', total: '2.201', receive: '2',
  destinationAddress: '4QW6qgCGxSFi1zTb1nrqdjuQFCbVuxLiCLNTZb8qovCE', expiresAt: quote.body.quote.expiresAt,
})

const recorded = await request(handler, { body: { action: 'record', source: 'base', destination: 'solana', amount: '2', txHash: '0xsource', status: 'submitted' } })
assert.equal(recorded.statusCode, 200)
assert.equal(records[0].action, 'wallet.bridge')
assert.equal(records[0].status, 'submitted')

const status = await request(handler, { method: 'GET', query: { action: 'status', source: 'base', txHash: '0xsource' } })
assert.equal(status.body.status, 'confirmed')
assert.equal(status.body.destinationTxHash, '0xdestination')

const arc = await request(handler, { body: { action: 'quote', source: 'arc', destination: 'base', amount: '1' } })
assert.equal(arc.statusCode, 400)

console.log('Circle Pocket bridge adapter smoke tests passed.')

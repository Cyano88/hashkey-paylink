import assert from 'node:assert/strict'
import { createPocketRecipientBalanceHandler } from '../api/pocket/recipient-balance.ts'
import { isPocketRecipientBalanceReadData } from '../src/pocket/lib/pocketSchemas.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, { method = 'POST', body = {} } = {}) {
  const res = responseRecorder()
  await handler({ method, body }, res)
  return res
}

const calls = []
const handler = createPocketRecipientBalanceHandler({
  isValidAddress: address => address === 'valid-solana-address',
  readBalance: async address => {
    calls.push(address)
    return { balance: 2_500_000n }
  },
})

const wrongMethod = await request(handler, { method: 'GET' })
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const wrongNetwork = await request(handler, { body: { network: 'base', address: 'valid-solana-address' } })
assert.equal(wrongNetwork.statusCode, 400)
assert.equal(wrongNetwork.body.error.code, 'VALIDATION_FAILED')

const invalidAddress = await request(handler, { body: { network: 'solana', address: 'invalid' } })
assert.equal(invalidAddress.statusCode, 400)
assert.equal(calls.length, 0)

const loaded = await request(handler, { body: { network: 'solana', address: 'valid-solana-address' } })
assert.equal(loaded.statusCode, 200)
assert.deepEqual(loaded.body, { ok: true, network: 'solana', balance: '2500000' })
assert.equal(isPocketRecipientBalanceReadData(loaded.body), true)
assert.deepEqual(calls, ['valid-solana-address'])
assert.equal(JSON.stringify(loaded.body).includes('ata'), false)

const unavailable = await request(createPocketRecipientBalanceHandler({
  isValidAddress: () => true,
  readBalance: async () => { throw new Error('private RPC detail') },
}), { body: { network: 'solana', address: 'valid-solana-address' } })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.message, 'Recipient balance is temporarily unavailable.')
assert.equal(JSON.stringify(unavailable.body).includes('private RPC detail'), false)

console.log('Circle Pocket recipient balance adapter smoke tests passed.')

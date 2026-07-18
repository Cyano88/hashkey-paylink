import assert from 'node:assert/strict'
import { createPocketSolanaRpcHandler } from '../api/pocket/solana-rpc.ts'

function response() {
  return {
    statusCode: 200,
    body: undefined,
    contentType: '',
    status(code) { this.statusCode = code; return this },
    type(value) { this.contentType = value; return this },
    json(value) { this.body = value; return this },
    send(value) { this.body = value; return this },
  }
}

let forwarded
const handler = createPocketSolanaRpcHandler({
  verifyUser: async () => ({ userId: 'did:privy:pocket-user', email: 'pocket@example.com' }),
  rpcUrl: () => 'https://rpc.example.test',
  fetcher: async (url, init) => {
    forwarded = { url, init }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 123 } }), { status: 200 })
  },
})

const ok = response()
await handler({ method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'getBalance', params: ['wallet'] } }, ok)
assert.equal(ok.statusCode, 200)
assert.equal(ok.contentType, 'application/json')
assert.equal(forwarded.url, 'https://rpc.example.test')
assert.equal(JSON.parse(forwarded.init.body).method, 'getBalance')
assert.equal(JSON.parse(ok.body).result.value, 123)

const blocked = response()
await handler({ method: 'POST', body: { jsonrpc: '2.0', id: 2, method: 'getProgramAccounts', params: [] } }, blocked)
assert.equal(blocked.statusCode, 400)
assert.equal(forwarded.url, 'https://rpc.example.test')

const unavailable = createPocketSolanaRpcHandler({
  verifyUser: async () => ({ userId: 'did:privy:pocket-user', email: 'pocket@example.com' }),
  rpcUrl: () => '',
})
const unavailableResponse = response()
await unavailable({ method: 'POST', body: { jsonrpc: '2.0', id: 3, method: 'getBalance', params: ['wallet'] } }, unavailableResponse)
assert.equal(unavailableResponse.statusCode, 503)
assert.match(unavailableResponse.body.error.message, /not configured/i)

console.log('pocket solana RPC adapter smoke passed')

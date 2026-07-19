import assert from 'node:assert/strict'
import handler from '../api/payment-tx-lookup.ts'

const originalFetch = globalThis.fetch
const originalRpcUrl = process.env.PRIVATE_RPC_URL
const recipient = '0x00000000000000000000000000000000000000aa'
const payer = '0x00000000000000000000000000000000000000bb'
const txHash = `0x${'ab'.repeat(32)}`
const transferUnits = 1_000_000n

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(body) {
  const res = responseRecorder()
  await handler({ method: 'POST', body }, res)
  return res
}

function rpcResponse(result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

try {
  process.env.PRIVATE_RPC_URL = 'https://rpc.example'

  let logQueries = 0
  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(String(init?.body || '{}'))
    if (rpc.method === 'eth_blockNumber') return rpcResponse('0x6e')
    if (rpc.method === 'eth_getLogs') {
      logQueries += 1
      assert.equal(rpc.params[0].fromBlock, '0x65')
      assert.equal(rpc.params[0].topics[1].toLowerCase(), `0x${payer.slice(2).padStart(64, '0')}`)
      assert.equal(rpc.params[0].topics[2].toLowerCase(), `0x${recipient.slice(2).padStart(64, '0')}`)
      return rpcResponse([{
        transactionHash: txHash,
        blockNumber: '0x66',
        logIndex: '0x1',
        data: `0x${transferUnits.toString(16).padStart(64, '0')}`,
      }])
    }
    if (rpc.method === 'eth_getTransactionReceipt') {
      return rpcResponse({ status: '0x1', blockNumber: '0x66' })
    }
    throw new Error(`Unexpected RPC method: ${rpc.method}`)
  }

  const confirmed = await request({
    chain: 'base',
    payer,
    recipient,
    amountUnits: transferUnits.toString(),
    fromBlock: '101',
    strict: true,
  })
  assert.equal(confirmed.statusCode, 200)
  assert.equal(confirmed.body.ok, true)
  assert.equal(confirmed.body.found, true)
  assert.equal(confirmed.body.txHash, txHash)
  assert.equal(confirmed.body.receiptStatus, 'success')
  assert.equal(logQueries, 1)

  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(String(init?.body || '{}'))
    if (rpc.method === 'eth_blockNumber') return rpcResponse('0x6e')
    if (rpc.method === 'eth_getLogs') return rpcResponse([{
      transactionHash: txHash,
      blockNumber: '0x66',
      logIndex: '0x1',
      data: `0x${transferUnits.toString(16).padStart(64, '0')}`,
    }])
    if (rpc.method === 'eth_getTransactionReceipt') return rpcResponse({ status: '0x0', blockNumber: '0x66' })
    throw new Error(`Unexpected RPC method: ${rpc.method}`)
  }

  const reverted = await request({
    chain: 'base',
    payer,
    recipient,
    amountUnits: transferUnits.toString(),
    fromBlock: '101',
  })
  assert.equal(reverted.body.ok, true)
  assert.equal(reverted.body.found, false)

  let queriedFutureLogs = false
  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(String(init?.body || '{}'))
    if (rpc.method === 'eth_blockNumber') return rpcResponse('0x6e')
    if (rpc.method === 'eth_getLogs') queriedFutureLogs = true
    throw new Error(`Unexpected RPC method: ${rpc.method}`)
  }
  const future = await request({
    chain: 'base',
    payer,
    recipient,
    amountUnits: transferUnits.toString(),
    fromBlock: '999',
  })
  assert.equal(future.body.ok, true)
  assert.equal(future.body.found, false)
  assert.equal(queriedFutureLogs, false)

  console.log('payment transaction lookup handler smoke passed')
} finally {
  globalThis.fetch = originalFetch
  if (originalRpcUrl === undefined) delete process.env.PRIVATE_RPC_URL
  else process.env.PRIVATE_RPC_URL = originalRpcUrl
}

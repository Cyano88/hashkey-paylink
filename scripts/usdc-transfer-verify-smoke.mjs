import assert from 'node:assert/strict'
import { formatUnits, pad, parseUnits } from 'viem'
import { verifyEvmUsdcTransfer } from '../api/usdc-transfer-verify.ts'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const payer = '0x2222222222222222222222222222222222222222'
const recipient = '0x1111111111111111111111111111111111111111'
const txHash = `0x${'a'.repeat(64)}`
const amount = '9007199254740993.123456'
const amountUnits = parseUnits(amount, 6)
const previousRpc = process.env.PRIVATE_RPC_URL
const previousFetch = globalThis.fetch

process.env.PRIVATE_RPC_URL = 'https://rpc.invalid'

function receipt(status) {
  return {
    ...(status ? { status } : {}),
    blockNumber: '0x10',
    logs: [{
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      topics: [TRANSFER_TOPIC, pad(payer, { size: 32 }), pad(recipient, { size: 32 })],
      data: `0x${amountUnits.toString(16)}`,
    }],
  }
}

let nextReceipt = receipt(undefined)
const createdAt = '2026-07-19T12:00:00.000Z'
let blockTimestamp = `0x${BigInt(Math.floor(Date.parse('2026-07-19T12:30:00.000Z') / 1_000)).toString(16)}`
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body ?? '{}'))
  const result = request.method === 'eth_getBlockByNumber'
    ? { timestamp: blockTimestamp }
    : nextReceipt
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ result }),
  }
}

await assert.rejects(
  verifyEvmUsdcTransfer({ chain: 'base', txHash, payer, recipient, minAmount: amount }),
  /Transaction did not succeed/,
)

nextReceipt = receipt('0x1')
const expiry = '2026-07-20T00:00:00.000Z'
const verified = await verifyEvmUsdcTransfer({ chain: 'base', txHash, payer, recipient, minAmount: amount, notBefore: createdAt, notAfter: expiry })
assert.equal(verified.amountUnits, amountUnits.toString())
assert.equal(verified.amount, formatUnits(amountUnits, 6))
assert.equal(verified.confirmedAt, new Date(Number(BigInt(blockTimestamp) * 1_000n)).toISOString())

blockTimestamp = `0x${(BigInt(Math.floor(Date.parse(createdAt) / 1_000)) - 1n).toString(16)}`
await assert.rejects(
  verifyEvmUsdcTransfer({ chain: 'base', txHash, payer, recipient, minAmount: amount, notBefore: createdAt, notAfter: expiry }),
  /confirmed before the checkout was created/,
)

blockTimestamp = `0x${(BigInt(Math.floor(Date.parse(expiry) / 1_000)) + 1n).toString(16)}`
await assert.rejects(
  verifyEvmUsdcTransfer({ chain: 'base', txHash, payer, recipient, minAmount: amount, notBefore: createdAt, notAfter: expiry }),
  /confirmed after the checkout expired/,
)

globalThis.fetch = previousFetch
if (previousRpc === undefined) delete process.env.PRIVATE_RPC_URL
else process.env.PRIVATE_RPC_URL = previousRpc

console.log('USDC transfer verification smoke tests passed.')

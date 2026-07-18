import assert from 'node:assert/strict'
import { createPocketEvmTransferStatusHandler } from '../api/pocket/evm-transfer-status.ts'
import { executePocketEvmTransfer } from '../src/pocket/api/pocketEvmTransferClient.ts'
import { readPocketEvmTransferStatus } from '../src/pocket/api/pocketEvmTransferStatusClient.ts'

const walletAddress = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const session = {
  userToken: 'circle-user-token-secret',
  encryptionKey: 'circle-encryption-key-secret',
  wallet: {
    id: 'circle-wallet-id',
    address: walletAddress,
    blockchain: 'BASE',
  },
  chain: 'base',
  appId: 'circle-app-id',
}
const calls = []
const executor = async input => {
  calls.push(input)
  return '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
}
const confirmationCalls = []
const confirmer = async input => {
  confirmationCalls.push(input)
  return 'confirmed'
}

const result = await executePocketEvmTransfer({
  session,
  linkedWalletAddress: walletAddress.toUpperCase().replace('0X', '0x'),
  recipient,
  amount: '1.25',
  executor,
  confirmer,
})
assert.deepEqual(result, {
  txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  status: 'confirmed',
})
assert.equal(calls.length, 1)
assert.deepEqual(calls[0], { session, recipient, amount: '1.25' })
assert.deepEqual(confirmationCalls, [{ chain: 'base', txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }])

await assert.rejects(() => executePocketEvmTransfer({
  session,
  linkedWalletAddress: '0x3333333333333333333333333333333333333333',
  recipient,
  amount: '1.25',
  executor,
  confirmer,
}), /does not match the linked Pocket wallet/)
assert.equal(calls.length, 1)

await assert.rejects(() => executePocketEvmTransfer({
  session,
  linkedWalletAddress: walletAddress,
  recipient: '0xinvalid',
  amount: '1.25',
  executor,
  confirmer,
}), /valid EVM destination/)
assert.equal(calls.length, 1)

await assert.rejects(() => executePocketEvmTransfer({
  session,
  linkedWalletAddress: walletAddress,
  recipient,
  amount: '0',
  executor,
  confirmer,
}), /greater than zero/)
assert.equal(calls.length, 1)

await assert.rejects(() => executePocketEvmTransfer({
  session,
  linkedWalletAddress: walletAddress,
  recipient,
  amount: '1.0000001',
  executor,
  confirmer,
}), /valid USDC withdrawal amount/)
assert.equal(calls.length, 1)

const fetchCalls = []
const confirmedStatus = await readPocketEvmTransferStatus({
  accessToken: 'privy-token',
  chain: 'base',
  txHash: result.txHash,
  recipient,
  amount: '1.25',
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ ok: true, status: 'confirmed' }) }
  },
})
assert.equal(confirmedStatus, 'confirmed')
assert.equal(fetchCalls[0].url, '/api/pocket/transfers/evm-status')
assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer privy-token')
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { chain: 'base', tx_hash: result.txHash, recipient, amount: '1.25' })

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}
async function statusRequest(handler, body) {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers: {} }, response)
  return response
}
const statusBody = { chain: 'base', tx_hash: result.txHash, recipient, amount: '1.25' }
const statusHandler = createPocketEvmTransferStatusHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  verifyTransfer: async input => ({ ok: true, amountUnits: '1250000', amount: input.minAmount }),
})
const serverConfirmed = await statusRequest(statusHandler, statusBody)
assert.equal(serverConfirmed.statusCode, 200)
assert.equal(serverConfirmed.body.status, 'confirmed')

const pendingHandler = createPocketEvmTransferStatusHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  verifyTransfer: async () => { throw new Error('Transaction receipt was not found yet.') },
})
const serverPending = await statusRequest(pendingHandler, statusBody)
assert.equal(serverPending.statusCode, 202)
assert.equal(serverPending.body.status, 'pending')

const revertedHandler = createPocketEvmTransferStatusHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  verifyTransfer: async () => { throw new Error('Transaction did not succeed.') },
})
const serverReverted = await statusRequest(revertedHandler, statusBody)
assert.equal(serverReverted.statusCode, 400)
assert.match(serverReverted.body.error, /did not succeed/)

console.log('Circle Pocket EVM transfer client smoke tests passed.')

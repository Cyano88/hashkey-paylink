import assert from 'node:assert/strict'
import { executePocketEvmTransfer } from '../src/pocket/api/pocketEvmTransferClient.ts'

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

console.log('Circle Pocket EVM transfer client smoke tests passed.')

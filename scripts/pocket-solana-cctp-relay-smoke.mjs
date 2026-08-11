import assert from 'node:assert/strict'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  SOLANA_TOKEN_PROGRAM_ID,
} from '../api/solana-token.ts'
import {
  preparePocketSolanaCctpTransaction,
  validatePocketSolanaCctpSignedTransaction,
} from '../api/pocket/solana-cctp-relay.ts'

const relayer = Keypair.generate()
const wallet = Keypair.generate()
const messageSender = Keypair.generate()
process.env.RELAYER_PRIVATE_KEY_SOLANA = JSON.stringify([...relayer.secretKey])

const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const bridgeProgram = new PublicKey('DFaauJEjmiHkPs1JG89A4p95hDWi9m9SAEERY1LQJiC3')
const tokenMessenger = new PublicKey('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe')
const messageTransmitter = new PublicKey('CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC')
const recipient = '0x1111111111111111111111111111111111111111'
const expected = { destination: 'base', destinationAddress: recipient, amount: '1' }

function randomMeta({ signer = false, writable = false } = {}) {
  return { pubkey: Keypair.generate().publicKey, isSigner: signer, isWritable: writable }
}

function bridgeData({ amount = 1_053_591n, domain = 6, bridgingKitFee = 0n } = {}) {
  const data = Buffer.alloc(140)
  Buffer.from('f2113f250ab3a918', 'hex').copy(data, 0)
  data.writeBigUInt64LE(amount, 8)
  data.writeUInt32LE(domain, 16)
  Buffer.from(recipient.slice(2), 'hex').copy(data, 32)
  data.writeBigUInt64LE(53_591n, 84)
  data.writeUInt32LE(1_000, 92)
  data.writeUInt32LE(32, 96)
  Buffer.from('cctp-forward', 'utf8').copy(data, 100)
  data.writeBigUInt64LE(bridgingKitFee, 132)
  return data
}

async function bridgeInstructions(overrides = {}) {
  const sourceAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey, true)
  const keys = Array.from({ length: 23 }, () => randomMeta())
  keys[1] = { pubkey: wallet.publicKey, isSigner: true, isWritable: true }
  keys[2] = { pubkey: relayer.publicKey, isSigner: true, isWritable: true }
  keys[4] = { pubkey: sourceAta, isSigner: false, isWritable: true }
  keys[12] = { pubkey: usdcMint, isSigner: false, isWritable: true }
  keys[13] = { pubkey: messageSender.publicKey, isSigner: true, isWritable: true }
  keys[14] = { pubkey: messageTransmitter, isSigner: false, isWritable: false }
  keys[15] = { pubkey: tokenMessenger, isSigner: false, isWritable: false }
  keys[16] = { pubkey: SOLANA_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
  keys[17] = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  keys[18] = { pubkey: tokenMessenger, isSigner: false, isWritable: false }
  keys[22] = { pubkey: bridgeProgram, isSigner: false, isWritable: false }
  const transaction = new Transaction({
    feePayer: relayer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: relayer.publicKey,
      toPubkey: messageSender.publicKey,
      lamports: 3_900_000,
    }),
    new TransactionInstruction({
      programId: bridgeProgram,
      keys,
      data: bridgeData(overrides),
    }),
  )
  return { instructions: transaction.instructions, messageSender, additionalRentLamports: 0n }
}

const healthyConnection = {
  getLatestBlockhash: async () => ({
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 123,
  }),
  getFeeForMessage: async () => ({ value: 5_000 }),
  getBalance: async () => 10_000_000,
}

const prepared = await preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(),
  expected,
  connection: healthyConnection,
  buildBridge: async () => bridgeInstructions(),
})
assert.equal(prepared.lastValidBlockHeight, 123)
const sponsored = Transaction.from(Buffer.from(prepared.transaction, 'base64'))
assert.ok(sponsored.feePayer?.equals(relayer.publicKey))
assert.ok(sponsored.instructions[0].keys[0].pubkey.equals(relayer.publicKey))
assert.ok(sponsored.instructions.at(-1).keys[1].pubkey.equals(wallet.publicKey))
assert.ok(sponsored.instructions.at(-1).keys[2].pubkey.equals(relayer.publicKey))
sponsored.partialSign(wallet)
await assert.doesNotReject(() => validatePocketSolanaCctpSignedTransaction({
  transaction: sponsored.serialize().toString('base64'),
  walletAddress: wallet.publicKey.toBase58(),
  expected,
}))

await assert.rejects(() => preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(),
  expected,
  connection: healthyConnection,
  buildBridge: async () => bridgeInstructions({ amount: 2_000_000n }),
}), /amount did not match/)

await assert.rejects(() => preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(),
  expected,
  connection: healthyConnection,
  buildBridge: async () => bridgeInstructions({ domain: 3 }),
}), /destination domain did not match/)

await assert.rejects(() => preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(),
  expected,
  connection: healthyConnection,
  buildBridge: async () => bridgeInstructions({ bridgingKitFee: 1n }),
}), /bridging kit fee was not zero/)

await assert.rejects(() => preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(),
  expected,
  connection: { ...healthyConnection, getBalance: async () => 3_081_535 },
  buildBridge: async () => bridgeInstructions(),
}), /replenishing its SOL fee wallet/)

console.log('Pocket Solana CCTP relay smoke checks passed.')

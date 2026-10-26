import {sealSolanaBridgeApproval,openSolanaBridgeApproval,assertSolanaBridgeMessage} from '../api/pocket/solana-bridge-approval.ts'
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
  createPocketSolanaCctpPrepareHandler,
  createPocketSolanaCctpSubmitHandler,
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
let feeReads = 0
let blockReads = 0
const recovered = await preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(), expected,
  connection: {
    ...healthyConnection,
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: ++blockReads + 123 }),
    getFeeForMessage: async () => ({ value: ++feeReads === 1 ? null : 5_000 }),
  },
  buildBridge: async () => bridgeInstructions(),
})
assert.equal(feeReads, 2)
assert.equal(blockReads, 2)
assert.equal(recovered.lastValidBlockHeight, 125)
const recoveredTx = Transaction.from(Buffer.from(recovered.transaction, 'base64'))
recoveredTx.partialSign(wallet)
assert.ok(recoveredTx.verifySignatures(true), 'refreshed message must retain valid sponsor signatures')
let unavailableReads = 0
await assert.rejects(() => preparePocketSolanaCctpTransaction({
  walletAddress: wallet.publicKey.toBase58(), expected,
  connection: { ...healthyConnection, getFeeForMessage: async () => { unavailableReads++; return { value: null } } },
  buildBridge: async () => bridgeInstructions(),
}), /Unable to estimate the Solana network fee/)
assert.equal(unavailableReads, 2, 'unavailable RPC must not create an endless loading loop')
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
}), /Solana network fees are temporarily unavailable/)

console.log('Pocket Solana CCTP relay smoke checks passed.')

// Both preparation and relay reject an external destination before touching providers.
for (const createHandler of [createPocketSolanaCctpPrepareHandler, createPocketSolanaCctpSubmitHandler]) {
  let relayed = false
  const handler = createHandler({verifyUser:async()=>({userId:'fixture-owner'}), readLink:async()=>({chain:'solana',purpose:'payment',circleWalletAddress:wallet.publicKey.toBase58()}), relay:async()=>{relayed=true}})
  const response = {statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
  await handler({method:'POST',body:{...expected,transaction:'fixture',lastValidBlockHeight:123}},response)
  assert.equal(response.statusCode,403, JSON.stringify(response.body))
  assert.match(response.body.error.message,/your linked Pocket wallet/)
  assert.equal(relayed,false)
}
console.log('External Solana bridge destinations rejected without relaying.')

process.env.SOLANA_TREASURY=Keypair.generate().publicKey.toBase58()
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-only-bridge-signing-key-1234567890'
let reimbursementFeeReads=0
const quoted=await preparePocketSolanaCctpTransaction({walletAddress:wallet.publicKey.toBase58(),expected,reimburse:true,connection:{...healthyConnection,getFeeForMessage:async()=>({value:++reimbursementFeeReads===2?null:5000}),getAccountInfo:async()=>({owner:SOLANA_TOKEN_PROGRAM_ID}),getTokenAccountBalance:async()=>({value:{amount:'1000000000'}})},buildBridge:async()=>bridgeInstructions(),readRate:async()=>10000000000n})
assert.equal(reimbursementFeeReads,3)
assert.equal(quoted.networkFeeUnits,'390500','Only 3900000 rent funding plus 5000 network lamports; reserve excluded')
assert.equal(quoted.providerFeeUnits,'53591')
const approval={...quoted,...expected,walletAddress:wallet.publicKey.toBase58(),expiresAt:Date.now()+30000}
const token=sealSolanaBridgeApproval(approval)
assert.deepEqual(openSolanaBridgeApproval(token,{...expected,walletAddress:wallet.publicKey.toBase58()}),approval)
const paid=Transaction.from(Buffer.from(quoted.transaction,'base64'))
assert.equal(paid.instructions.at(-1).data.readBigUInt64LE(1),390500n)
assertSolanaBridgeMessage(paid,approval,false)
assert.throws(()=>assertSolanaBridgeMessage(paid,approval,true))
paid.partialSign(wallet);assertSolanaBridgeMessage(paid,approval,true)
paid.instructions.at(-1).data.writeBigUInt64LE(390501n,1)
assert.throws(()=>assertSolanaBridgeMessage(paid,approval,false),/changed/)
for(const patch of [{amount:'2'},{walletAddress:relayer.publicKey.toBase58()},{destination:'arbitrum'},{destinationAddress:'0x'+'22'.repeat(20)}])assert.throws(()=>openSolanaBridgeApproval(token,{...expected,walletAddress:wallet.publicKey.toBase58(),...patch}))
assert.throws(()=>openSolanaBridgeApproval(token+'x',{...expected,walletAddress:wallet.publicKey.toBase58()}))
const expired=sealSolanaBridgeApproval({...approval,expiresAt:1})
assert.throws(()=>openSolanaBridgeApproval(expired,{...expected,walletAddress:wallet.publicKey.toBase58()}),/expired/)
assert.doesNotThrow(()=>openSolanaBridgeApproval(expired,{...expected,walletAddress:wallet.publicKey.toBase58()},true))
console.log('PASS: exact gas reimbursement, no service fee or reserve markup; signed quote and exact transaction integrity; completed signatures required.')


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
import {build} from 'esbuild'
await build({entryPoints:['api/pocket/solana-cctp-relay.ts'],outfile:'.codex-temp/solana-cctp-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'pause-state',setup(b){b.onResolve({filter:/render-durable-store\.js$/},a=>a.importer.endsWith('emergency-pause.ts')?{path:a.path,namespace:'pause-fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'pause-fixture'},()=>({contents:`export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>({paused:false,revision:0,history:[]});export const mutateDurableJson=async()=>{throw Error('Unexpected pause mutation')}`}))}}]})
const {createPocketSolanaCctpPrepareHandler,createPocketSolanaCctpSubmitHandler,preparePocketSolanaCctpTransaction,validatePocketSolanaCctpSignedTransaction}=await import('../.codex-temp/solana-cctp-fixture.mjs')

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
  const handler = createHandler({verifyUser:async()=>({userId:'fixture-owner'}), readLink:async()=>({privyUserId:'fixture-owner',circleBlockchain:'SOL',chain:'solana',purpose:'payment',circleWalletAddress:wallet.publicKey.toBase58()}), relay:async()=>{relayed=true}})
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
for(const [balance,maximum] of [['1000000','555909'],['444091','0'],['0','0']]){
 await assert.rejects(()=>preparePocketSolanaCctpTransaction({walletAddress:wallet.publicKey.toBase58(),expected,reimburse:true,connection:{...healthyConnection,getAccountInfo:async()=>({owner:SOLANA_TOKEN_PROGRAM_ID}),getTokenAccountBalance:async()=>({value:{amount:balance}})},buildBridge:async()=>bridgeInstructions(),readRate:async()=>10000000000n}),e=>e.code==='insufficient_balance'&&e.maximumAmountUnits===maximum&&e.status===400)
}
const sourceAtaForMax=await getAssociatedTokenAddress(usdcMint,wallet.publicKey,true)
await assert.rejects(()=>preparePocketSolanaCctpTransaction({walletAddress:wallet.publicKey.toBase58(),expected,reimburse:true,connection:{...healthyConnection,getAccountInfo:async account=>account.equals(sourceAtaForMax)?null:{owner:SOLANA_TOKEN_PROGRAM_ID},getTokenAccountBalance:async()=>({value:{amount:'1000000000'}})},buildBridge:async()=>bridgeInstructions(),readRate:async()=>10000000000n}),e=>e.code==='insufficient_balance'&&e.maximumAmountUnits==='0')
const rpcFailure=Error('RPC unavailable')
await assert.rejects(()=>preparePocketSolanaCctpTransaction({walletAddress:wallet.publicKey.toBase58(),expected,reimburse:true,connection:{...healthyConnection,getAccountInfo:async account=>{if(account.equals(sourceAtaForMax))throw rpcFailure;return {owner:SOLANA_TOKEN_PROGRAM_ID}},getTokenAccountBalance:async()=>({value:{amount:'1000000000'}})},buildBridge:async()=>bridgeInstructions(),readRate:async()=>10000000000n}),e=>e===rpcFailure&&!e.maximumAmountUnits)
console.log('PASS Solana Max hints: provider fee plus reimbursement reserved exactly, zero/missing balance bounded, RPC errors never labeled insufficient.')
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

// Exercise endpoint orchestration against the actual reservation engine/journal.
await import('./pocket-shared-action-reservation-smoke.mjs')
const journal=await import('../.codex-temp/shared-action-fixture.mjs')
const {createSolanaCctpReservations}=await import('../api/pocket/solana-cctp-reservation.ts')
const {randomUUID}=await import('node:crypto')
const {validatePocketSolanaBridgeSigning}=await import('../.codex-temp/solana-cctp-fixture.mjs')
const owner=randomUUID(),walletId=randomUUID(),id=randomUUID()
let sends=0,proof=null,proofError=false
const reservations=createSolanaCctpReservations({durable:()=>true,claim:journal.claimCirclePocketAction,broadcastClaim:journal.claimSolanaCctpBroadcast,find:journal.findCirclePocketAction,record:journal.recordCirclePocketAction,
 dispatch:async()=>{sends++;throw Error('Lost relay response')},prove:async()=>{if(proofError)throw Error('RPC unavailable');return proof}})
const deps={reservations,verifyUser:async req=>({userId:req.owner??owner}),readLink:async key=>key.includes('solana')?{privyUserId:owner,circleWalletId:walletId,circleWalletAddress:wallet.publicKey.toBase58(),chain:'solana',circleBlockchain:'SOL',purpose:'payment'}:{privyUserId:owner,circleWalletAddress:recipient,chain:'base',purpose:'payment'},
 relay:async()=>{throw Error('Managed path bypassed reservations')},listPending:async()=>{const rows=await journal.listCirclePocketActions(owner,500,'reservation.solana-cctp',true);return rows.map(r=>({walletAddress:r.metadata.walletAddress,reservationReleased:false}))}}
const prepHandler=createPocketSolanaCctpPrepareHandler(deps),submitHandler=createPocketSolanaCctpSubmitHandler(deps)
const call=async(handler,body,extra={})=>{const res={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};await handler({method:'POST',body,...extra},res);return res}
const approvedNow={...approval,expiresAt:Date.now()+120000},quoteToken=sealSolanaBridgeApproval(approvedNow)
const request={...expected,quoteToken,idempotencyKey:id,reservationVersion:1}
const signed=Transaction.from(Buffer.from(approvedNow.transaction,'base64'));signed.partialSign(wallet)
const signedRaw=signed.serialize().toString('base64')
process.env.POCKET_SOLANA_CCTP_RESERVATIONS_ENABLED='true'
assert.equal((await call(prepHandler,{...expected,quoteToken})).statusCode,400)
assert.equal((await call(prepHandler,{...request,reservationVersion:0})).statusCode,409)
assert.equal((await call(submitHandler,{...request,transaction:signedRaw,lastValidBlockHeight:approvedNow.lastValidBlockHeight})).statusCode,409,'submit requires prepare')
const preparedManaged=await call(prepHandler,request);assert.equal(preparedManaged.statusCode,200,JSON.stringify(preparedManaged.body));assert.equal(preparedManaged.body.managed,true)
const signParams={...request,reservationVersion:'1',walletId,rawTransaction:approvedNow.transaction}
await validatePocketSolanaBridgeSigning({body:{}},signParams,deps)
await assert.rejects(validatePocketSolanaBridgeSigning({body:{}},{...signParams,idempotencyKey:randomUUID()},deps),/binding/)
const submission={...request,transaction:signedRaw,lastValidBlockHeight:approvedNow.lastValidBlockHeight}
const responses=await Promise.all([call(submitHandler,submission),call(submitHandler,submission)])
assert.equal(sends,1);for(const res of responses){assert.equal(res.statusCode,200);assert.equal(res.body.managed,true);assert.equal(res.body.reservationReleased,false)}
await assert.rejects(validatePocketSolanaBridgeSigning({body:{}},signParams,deps),/already submitted/)
delete process.env.POCKET_SOLANA_CCTP_RESERVATIONS_ENABLED
await call(submitHandler,submission);assert.equal(sends,1,'rollback retains managed deduplication')
assert.equal((await call(submitHandler,{...submission,idempotencyKey:undefined})).statusCode,409,'legacy cannot bypass pending reservation')
const recover={action:'recover',idempotencyKey:id}
proofError=true;const pending=await call(submitHandler,recover);assert.equal(pending.body.verificationPending,true);assert.equal(pending.body.txHash,responses[0].body.txHash)
assert.equal((await call(submitHandler,recover,{owner:'foreign'})).statusCode,500)
proofError=false;proof={outcome:'source_confirmed',txHash:responses[0].body.txHash,slot:1,blockHash:'fixture'}
const done=await call(submitHandler,recover);assert.equal(done.body.status,'completed');assert.equal(done.body.reservationReleased,true);assert.equal(sends,1)
assert.equal((await call(submitHandler,{action:'recover',idempotencyKey:randomUUID()})).body.managed,false)
console.log('PASS managed Solana endpoints: version gate, prepare before signing/submit, atomic duplicate suppression, lost response, rollback, legacy bypass guard, owner binding, read-only recovery.')
await build({entryPoints:['api/pocket/solana-cctp-reservation.ts'],outfile:'.codex-temp/solana-inventory-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'durable-fixture',setup(b){b.onResolve({filter:/render-durable-store\.js$/},a=>/circle-pocket-action-journal\.ts|solana-cctp-reservation\.ts/.test(a.importer)?{path:'store',namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const f=globalThis.sharedActionFixture;export const hasRenderDurableStore=f.ready,readDurableJson=f.read,mutateDurableJson=f.mutate;export const writeDurableJson=async()=>{throw Error('Unexpected fallback write')}`,loader:'js'}))}}]})
const inventory=await import('../.codex-temp/solana-inventory-fixture.mjs')
const listed=await inventory.listSolanaCctpPending(owner);assert.equal(listed.length,1);assert.equal(listed[0].id,id);assert.equal(listed[0].reservationReleased,true)
assert.equal((await inventory.listSolanaCctpPending('foreign')).length,0)
await inventory.acknowledgeSolanaCctpDelivery(owner,'base',done.body.txHash)
assert.equal((await inventory.listSolanaCctpPending(owner)).length,1)
await inventory.acknowledgeSolanaCctpDelivery(owner,'solana',done.body.txHash.toLowerCase())
if(done.body.txHash!==done.body.txHash.toLowerCase())assert.equal((await inventory.listSolanaCctpPending(owner)).length,1,'Solana signatures are case sensitive')
await inventory.acknowledgeSolanaCctpDelivery(owner,'solana',done.body.txHash)
assert.equal((await inventory.listSolanaCctpPending(owner)).length,0)
console.log('PASS Solana inventory: owner isolation, completed source remains discoverable until delivery acknowledgement, exact network and case-sensitive signature.')


// Cash is a signed purpose on the ordinary owned Base destination.
const cashApproval={...approvedNow,purpose:'cash',expiresAt:Date.now()+120000}
const cashToken=sealSolanaBridgeApproval(cashApproval)
assert.throws(()=>openSolanaBridgeApproval(cashToken,{...expected,walletAddress:wallet.publicKey.toBase58()}),/purpose changed/)
assert.throws(()=>openSolanaBridgeApproval(quoteToken,{...expected,walletAddress:wallet.publicKey.toBase58(),purpose:'cash'}),/purpose changed/)
assert.throws(()=>openSolanaBridgeApproval(sealSolanaBridgeApproval({...cashApproval,destination:'arbitrum'}),{...expected,destination:'arbitrum',walletAddress:wallet.publicKey.toBase58(),purpose:'cash'}),/purpose changed/)
const cashId=randomUUID(),cashRequest={...request,idempotencyKey:cashId,purpose:'cash',quoteToken:cashToken}
process.env.POCKET_SOLANA_CCTP_RESERVATIONS_ENABLED='true'
assert.notEqual((await call(prepHandler,{...cashRequest,purpose:undefined})).statusCode,200)
assert.equal((await call(prepHandler,{...cashRequest,destination:'arbitrum'})).statusCode,400)
assert.equal((await call(prepHandler,cashRequest)).statusCode,200)
await validatePocketSolanaBridgeSigning({body:{}},{...signParams,idempotencyKey:cashId,purpose:'cash',quoteToken:cashToken},deps)
await assert.rejects(validatePocketSolanaBridgeSigning({body:{}},{...signParams,idempotencyKey:cashId,quoteToken:cashToken},deps),/purpose changed/)
assert.notEqual((await call(submitHandler,{...submission,idempotencyKey:cashId,quoteToken:cashToken})).statusCode,200)
proof=null
assert.equal((await call(submitHandler,{...submission,...cashRequest})).statusCode,200)
delete process.env.POCKET_SOLANA_CCTP_RESERVATIONS_ENABLED
assert.equal((await call(submitHandler,{action:'recover',idempotencyKey:cashId})).body.managed,true)
const cashInventory=await inventory.listSolanaCctpPending(owner)
assert.equal(cashInventory.find(r=>r.id===cashId).purpose,'cash','Server-only recovery preserves Cash attribution')
assert.equal(cashInventory.find(r=>r.id===cashId).destination,'base')
console.log('PASS Cash Solana purpose: sealed quote binding, no adding/removing purpose after approval, Base-only validation, signing/submit consistency and rollback/server-only inventory recovery.')

const {createPocketBridgeHandler}=await import('../api/pocket/bridge.ts')
let quotedPurpose='unset',quoteCalls=0
const quoteHandler=createPocketBridgeHandler({verifyUser:deps.verifyUser,readLink:deps.readLink,solanaQuote:async(address,route)=>{quoteCalls++;quotedPurpose=route.purpose;assert.equal(address,wallet.publicKey.toBase58());return {...cashApproval,...route,quoteToken:'fixture'}}})
assert.equal((await call(quoteHandler,{action:'quote',source:'solana',destination:'base',amount:'1',purpose:'cash'})).statusCode,200)
assert.equal(quotedPurpose,'cash')
assert.equal((await call(quoteHandler,{action:'quote',source:'solana',destination:'arbitrum',amount:'1',purpose:'cash'})).statusCode,400)
assert.equal(quoteCalls,1)
assert.equal((await call(quoteHandler,{action:'quote',source:'solana',destination:'base',amount:'1'})).statusCode,200)
assert.equal(quotedPurpose,undefined)
console.log('PASS quote endpoint: Cash forwarded to sealed Solana quote, non-Base Cash rejected before quote construction, ordinary bridge compatibility retained.')

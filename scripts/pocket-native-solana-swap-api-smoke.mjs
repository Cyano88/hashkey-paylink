import assert from 'node:assert/strict'
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js'
import bs58 from 'bs58'
import {createNativeSolanaSwapHandler} from '../api/pocket/native-solana-swap.ts'
import {sealSolSwap,openSolSwap} from '../api/pocket/native-solana-swap-quote.ts'
import {reconcileNativeSolanaSwap,solSwapReceiptOutput} from '../api/pocket/native-solana-swap-reconciliation.ts'
import {removeRedundantSolanaSwapSetup} from '../api/pocket/native-solana-swap-setup.ts'
import {stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='solana-swap-api-fixture-'.repeat(3)
const signer=Keypair.generate(),wallet=signer.publicKey.toBase58(),other=Keypair.generate().publicKey,now=Date.now(),owner='fixture'
const tx=new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:other.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:other,lamports:1})]}).compileToV0Message())
const raw=Buffer.from(tx.serialize()).toString('base64'),q={version:1,network:'solana',id:'11111111-1111-4111-8111-111111111111',ownerId:owner,walletId:'wallet',walletAddress:wallet,from:'SOL',to:'USDC',amount:'0.01',amountUnits:'10000000',expectedOutUnits:'1000000',minimumOutUnits:'995000',feeUnits:'5000',rentUnits:'0',transaction:raw,lastValidBlockHeight:1000,instructions:[],lookupAddresses:[],issuedAt:now,expiresAt:now+45000}
const token=sealSolSwap(q);assert.deepEqual(openSolSwap(token,owner,false,now),q);assert.throws(()=>openSolSwap(token,'foreign'));assert.throws(()=>openSolSwap(token+'x',owner));assert.throws(()=>openSolSwap(token,owner,false,now+45001));assert.ok(openSolSwap(token,owner,true,now+45001))
tx.sign([signer]);const signed=Buffer.from(tx.serialize()).toString('base64'),hash=bs58.encode(tx.signatures[0])
let record=null,writes=0,broadcasts=0,enabled=true,approval=true,height=900,challengeFail=false,preflightChanged=false
const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getBlockHeight:async()=>height,getTransaction:async()=>null,getSignatureStatuses:async()=>({value:[null]}),sendRawTransaction:async bytes=>{assert.equal(record.metadata.signedTransaction,signed,'signature saved before broadcast');assert.equal(record.metadata.txHash,hash);assert.equal(bytes.toString('base64'),signed);broadcasts++;return hash}}
const deps={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'solana',purpose:'payment',circleBlockchain:'SOL',circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>enabled,now:()=>now,rpc:()=>rpc,approval:async()=>approval,find:async()=>record,list:async()=>record?[record]:[],claim:async input=>{if(record)return {claimed:false,record};record={...input,status:'started'};return {claimed:true,record}},record:async input=>{record=input;return input},preflight:async()=>({transaction:raw,networkFeeLamports:preflightChanged?'5001':'5000',effects:{newAccountRentLamports:'0'}}),challenge:async()=>{assert.equal(record.status,'started');writes++;if(challengeFail)throw Error('timeout');return {challengeId:'challenge'}}}
const handler=createNativeSolanaSwapHandler(deps)
async function call(body,method='POST'){let code=200,result;await handler({method,body,headers:{}},{setHeader(){},status(s){code=s;return this},json(v){result=v;return this}});return {code,result}}
enabled=false;assert.equal((await call({action:'execute',quoteToken:token})).code,409);assert.equal((await call({},'GET')).result.enabled,false);enabled=true
approval=false;assert.equal((await call({action:'execute',quoteToken:token})).code,403);assert.equal(writes,0);approval=true
preflightChanged=true;assert.equal((await call({action:'execute',quoteToken:token})).code,409);assert.equal(writes,0);preflightChanged=false
challengeFail=true;assert.equal((await call({action:'execute',quoteToken:token})).code,503);assert.equal(writes,1);await call({action:'execute',quoteToken:token});assert.equal(writes,1,'ambiguous request cannot create another challenge')
height=1001;assert.equal((await call({action:'status',quoteToken:token})).result.status,'not_submitted');assert.equal(broadcasts,0)
record=null;height=900;challengeFail=false;assert.equal((await call({action:'execute',quoteToken:token})).code,200);assert.equal(writes,2)
assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:raw})).code,503);assert.equal(broadcasts,0)
enabled=false;assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:signed})).code,200);assert.ok(broadcasts>0,'already approved recovery remains available while disabled');assert.equal(record.metadata.txHash,hash)
height=1001;assert.equal((await call({action:'status',quoteToken:token})).result.status,'failed')
console.log('PASS Solana owner/expiry/seal, PIN, exact preflight fee, durable-before-challenge, no duplicate after timeout, signature verification, durable-before-broadcast and expiry recovery')

const ATA=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),TOKEN=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),mint=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const ata=PublicKey.findProgramAddressSync([other.toBuffer(),TOKEN.toBuffer(),mint.toBuffer()],ATA)[0],data=Buffer.alloc(165);mint.toBuffer().copy(data);other.toBuffer().copy(data,32);data[108]=1
const instruction={programId:ATA.toBase58(),data:'AQ==',accounts:[[wallet,true,true],[ata.toBase58(),false,true],[other.toBase58(),false,false],[mint.toBase58(),false,false],[SystemProgram.programId.toBase58(),false,false],[TOKEN.toBase58(),false,false]].map(([pubkey,isSigner,isWritable])=>({pubkey,isSigner,isWritable}))}
const account={owner:TOKEN,data,executable:false,lamports:2039280}
assert.deepEqual(await removeRedundantSolanaSwapSetup(wallet,[instruction],{getAccountInfo:async()=>account}),[])
for(const bad of [null,{...account,executable:true},{...account,owner:other},{...account,data:Buffer.alloc(165)}])await assert.rejects(()=>removeRedundantSolanaSwapSetup(wallet,[instruction],{getAccountInfo:async()=>bad}))
const changed=structuredClone(instruction);changed.accounts[0].pubkey=other.toBase58();await assert.rejects(()=>removeRedundantSolanaSwapSetup(wallet,[changed],{getAccountInfo:async()=>account}))
console.log('PASS only existing canonical initialized foreign ATA setup can be omitted; missing/foreign/frozen/mutated account setup rejected')

const userAta=PublicKey.findProgramAddressSync([signer.publicKey.toBuffer(),TOKEN.toBuffer(),mint.toBuffer()],ATA)[0]
const message={serialize:()=>tx.message.serialize(),getAccountKeys:()=>({get:i=>[signer.publicKey,userAta,other][i]})}
const balance=(amount,index=1)=>({owner:wallet,mint:mint.toBase58(),accountIndex:index,uiTokenAmount:{amount,decimals:6}})
const receipt={transaction:{message},meta:{err:null,fee:5000,preBalances:[20000000],postBalances:[9995000],preTokenBalances:[balance('0')],postTokenBalances:[balance('1000000')]}}
assert.equal(solSwapReceiptOutput(q,receipt),1000000n)
assert.equal(solSwapReceiptOutput(q,{...receipt,meta:{...receipt.meta,postBalances:[9994999]}}),null,'unexpected native debit cannot confirm')
assert.equal(solSwapReceiptOutput(q,{...receipt,meta:{...receipt.meta,postTokenBalances:[balance('990000')]}}),null,'minimum output enforced')
assert.equal(solSwapReceiptOutput(q,{...receipt,meta:{...receipt.meta,preTokenBalances:[balance('0'),balance('10',2)],postTokenBalances:[balance('1000000'),balance('9',2)]}}),null,'unrelated token debit cannot confirm')
record={ownerId:owner,action:'wallet.native-swap',idempotencyKey:'pocket:native-swap:'+q.id,status:'submitted',metadata:{network:'solana',walletAddress:wallet,quoteToken:token,signedTransaction:signed,txHash:hash}};height=900
const completed=await reconcileNativeSolanaSwap(record,{rpc:()=>({...rpc,getTransaction:async()=>receipt}),record:deps.record});assert.equal(completed.status,'completed');assert.equal(completed.amountOut,'1')
console.log('PASS exact approved receipt, actual output, exact input and fee, no unrelated debit, canonical signed recovery')
record={ownerId:owner,action:'wallet.native-swap',idempotencyKey:'pocket:native-swap:'+q.id,status:'submitted',metadata:{network:'solana',walletAddress:wallet,quoteToken:token,challengeId:'challenge'}}
assert.equal((await call({action:'cancel',quoteToken:token})).result.status,'not_submitted')
assert.equal(record.status,'cancelled')
assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:signed})).result.status,'not_submitted','late signature cannot revive cancelled draft')
assert.equal((await call({},'GET')).result.pending.length,0)
console.log('PASS Solana swap cancellation: durable, absent from pending, and late signed submission rejected.')

// Cancellation wins after submit read but before the atomic signed write.
record={ownerId:owner,action:'wallet.native-swap',idempotencyKey:'pocket:native-swap:'+q.id,status:'submitted',metadata:{network:'solana',walletAddress:wallet,quoteToken:token,challengeId:'challenge'}}
const beforeBroadcasts=broadcasts
const raceHandler=createNativeSolanaSwapHandler({...deps,record:async input=>input.metadata?.submissionClaim==='true'?{...record,status:'cancelled'}:deps.record(input)})
let raceResult
await raceHandler({method:'POST',body:{action:'submit',quoteToken:token,signedTransaction:signed},headers:{}},{setHeader(){},status(){return this},json(v){raceResult=v;return this}})
assert.equal(raceResult.status,'not_submitted');assert.equal(broadcasts,beforeBroadcasts)
console.log('PASS cancellation wins concurrent local submission without a broadcast.')

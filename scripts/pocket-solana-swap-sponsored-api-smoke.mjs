import assert from 'node:assert/strict'
import {Keypair,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js'
import bs58 from 'bs58'
import {sealSolSwap} from '../api/pocket/native-solana-swap-quote.ts'
import {createNativeSolanaSwapHandler} from '../api/pocket/native-solana-swap.ts'
import {verifyNativeSolanaSwapSignature} from '../api/pocket/native-solana-swap-preflight.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='sponsored-api-fixture-'.repeat(3)
const wallet=Keypair.generate(),sponsor=Keypair.generate(),now=Date.now(),address=wallet.publicKey.toBase58()
const tx=new VersionedTransaction(new TransactionMessage({payerKey:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:sponsor.publicKey,lamports:2049280})]}).compileToV0Message()),encode=t=>Buffer.from(t.serialize()).toString('base64'),raw=encode(tx)
const q={version:1,network:'solana',id:'22222222-2222-4222-8222-222222222222',ownerId:'owner',walletId:'wallet',walletAddress:address,from:'USDC',to:'SOL',amount:'1',amountUnits:'1000000',expectedOutUnits:'10000000',minimumOutUnits:'9950000',feeUnits:'10000',rentUnits:'0',transaction:raw,lastValidBlockHeight:1000,instructions:[],lookupAddresses:[],issuedAt:now,expiresAt:now+45000,sponsorship:{sponsor:sponsor.publicKey.toBase58(),temporaryFundingLamports:'2039280'}}
const token=sealSolSwap(q);tx.sign([wallet]);const walletSigned=encode(tx)
let record=null,challenges=0,coSigns=0,broadcasts=0,approved=false,proofChanged=false,height=900,storageFail=false
const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getBlockHeight:async()=>height,getTransaction:async()=>null,getSignatureStatuses:async()=>({value:[null]}),sendRawTransaction:async bytes=>{const signed=verifyNativeSolanaSwapSignature(q.transaction,bytes.toString('base64'),address,q.sponsorship.sponsor,true);assert.equal(record.metadata.signedTransaction,bytes.toString('base64'));assert.equal(record.metadata.txHash,bs58.encode(signed.signatures[0]));broadcasts++;return record.metadata.txHash}}
const handler=createNativeSolanaSwapHandler({identity:async()=>({userId:'owner'}),readLink:async()=>({privyUserId:'owner',chain:'solana',purpose:'payment',circleBlockchain:'SOL',circleWalletId:'wallet',circleWalletAddress:address}),enabled:()=>true,now:()=>now,rpc:()=>rpc,approval:async()=>approved,find:async()=>record,claim:async input=>{assert.equal(record,null);record={...input,status:'started'};return {claimed:true,record}},record:async input=>{if(storageFail)throw Error('DB unavailable');record=input;return input},relayer:()=>{coSigns++;return sponsor},challenge:async()=>{challenges++;return {challengeId:'challenge'}},preflight:async(_input,_instructions,_tables,_policy,_rpc,_quote,sponsorship)=>{assert.deepEqual(sponsorship,q.sponsorship);return {transaction:raw,networkFeeLamports:proofChanged?'10001':'10000',effects:{newAccountRentLamports:'0'}}}})
async function call(action,signedTransaction){let code=200,data;await handler({method:'POST',body:{action,quoteToken:token,signedTransaction},headers:{}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this}});return {code,data}}
assert.equal((await call('submit',walletSigned)).data.status,'not_submitted');assert.equal(coSigns,0)
assert.equal((await call('execute')).code,403);assert.equal(challenges,0);approved=true
assert.equal((await call('execute')).code,200);assert.equal(challenges,1);assert.equal(coSigns,0,'Challenge does not expose sponsor signature')
assert.equal((await call('submit',raw)).code,503);assert.equal(coSigns,0,'Wallet signature required')
proofChanged=true;assert.equal((await call('submit',walletSigned)).code,503);assert.equal(coSigns,0);proofChanged=false
storageFail=true;assert.equal((await call('submit',walletSigned)).code,503);assert.equal(broadcasts,0,'Never broadcast before durable full signature');storageFail=false
assert.equal((await call('submit',walletSigned)).code,200);assert.equal(coSigns,2);assert.ok(broadcasts>0)
const savedRaw=record.metadata.signedTransaction,savedHash=record.metadata.txHash
await call('submit',walletSigned);await call('execute');assert.equal(coSigns,2);assert.equal(challenges,1);assert.equal(record.metadata.signedTransaction,savedRaw);assert.equal(record.metadata.txHash,savedHash)
height=1001;assert.equal((await call('status')).data.status,'failed')
console.log('PASS sponsored API: PIN then wallet signature, current preflight, durable full signatures before broadcast, same hash on retry, one challenge, no second sponsor signing, expired-attempt recovery')

import {Connection} from '@solana/web3.js'
import bs58 from 'bs58'
import {getRpc,loadRelayer} from '../relay-solana.js'
import {hasRenderDurableStore} from '../render-durable-store.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {revalidateCrossBridgeWallets} from './cross-bridge-wallets.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {createCrossBridgeOperations,type CrossBridgeOperationDependencies} from './cross-bridge-operations.js'
import {crossBridgeReservationStore} from './cross-bridge-reservation.js'
import {prepareCrossBridgeSolanaTransaction,CROSS_BRIDGE_SOLANA_GENESIS} from './cross-bridge-solana-transaction.js'
import {validateCrossBridgeSolanaTransaction} from './cross-bridge-solana-source.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const fail=():never=>{throw Error('Solana bridge state changed. Check Activity.')}
const defaults={now:Date.now,durable:hasRenderDurableStore,store:crossBridgeReservationStore,open:openCrossBridgeReview,wallets:revalidateCrossBridgeWallets,approve:consumePocketPaymentApproval,rpc:()=>new Connection(getRpc(),'confirmed'),
 prepare:(review:Review)=>prepareCrossBridgeSolanaTransaction(review,new Connection(getRpc(),'confirmed'),loadRelayer()),
 challenge:async(input:{userToken:string;walletId:string;walletAddress:string;rawTransaction:string})=>(await import('../circle-solana-email.js')).createCircleNativeSolanaChallenge(input),
}
/** Raw Circle signing never broadcasts. Fully signed bytes are durably recorded
 * before broadcast; retries may only rebroadcast those identical bytes. */
export function createCrossBridgeSolanaRuntime(ownerId:string,userToken:string,preflight:(r:Review)=>Promise<void>,overrides:Partial<Omit<typeof defaults,'store'>>&{store?:CrossBridgeOperationDependencies['store']}={}){
 if(!ownerId||ownerId.length>256||userToken.length>8000||typeof preflight!=='function')return fail()
 const d={...defaults,...overrides},store=d.store!
 const ready=()=>{if(!d.durable())throw Error('Bridge recovery storage is unavailable.')}
 const open=async(token:string,owner:string,recovery:boolean)=>{ready();if(owner!==ownerId)return fail();const r=await d.open(token,owner,{recovery,now:d.now()});if(r.quote.input.source!=='solana'||r.quote.wallets.source.provider!=='circle'||r.charged.plan.kind!=='solana')return fail();return r}
 const service=createCrossBridgeOperations({store,now:d.now,open,approve:(owner,approval)=>d.approve(approval,owner,d.now()),preflight:async r=>{await d.wallets(r.quote.wallets);await preflight(r)},
  dispatch:async(r,op,authorization)=>{
   if(authorization!==userToken||typeof op.solanaTransaction!=='string')return fail()
   validateCrossBridgeSolanaTransaction(r,op.solanaTransaction,op.solanaTransaction,false)
   const rpc=d.rpc();if(await rpc.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS||typeof op.lastValidBlockHeight!=='number'||await rpc.getBlockHeight('confirmed')>op.lastValidBlockHeight)return fail()
   const reply=await d.challenge({userToken,walletId:r.quote.wallets.source.walletId,walletAddress:r.quote.input.sender,rawTransaction:op.solanaTransaction})
   return reply.challengeId?{challengeId:reply.challengeId}:null
  },
  observe:async(_r,op)=>op.sourceHash?{sourceHash:op.sourceHash}:null,
 })
 async function broadcast(id:string){
  ready();const op=await service.read(ownerId,id)
  if(op.state!=='submitted'||typeof op.signedTransaction!=='string'||typeof op.solanaTransaction!=='string'||typeof op.lastValidBlockHeight!=='number')return op
  const r=await open(op.quoteToken,ownerId,true),tx=validateCrossBridgeSolanaTransaction(r,op.solanaTransaction,op.signedTransaction,true)
  if(!tx.signature||bs58.encode(tx.signature)!==op.sourceHash)return fail()
  const rpc=d.rpc();if(await rpc.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS)return fail()
  const observed=(await rpc.getSignatureStatuses([op.sourceHash!],{searchTransactionHistory:true})).value[0]
  if(observed||await rpc.getBlockHeight('confirmed')>op.lastValidBlockHeight)return op
  const hash=await rpc.sendRawTransaction(Buffer.from(op.signedTransaction,'base64'),{skipPreflight:false,maxRetries:2})
  if(hash!==op.sourceHash)return fail()
  return op
 }
 return {
  async prepare(token:string,approval:string){
   ready();let op=await service.prepare(token,ownerId,approval)
   if(op.state!=='prepared'||op.solanaTransaction)return op
   const reviewed=await open(op.quoteToken,ownerId,false),prepared=await d.prepare(reviewed)
   validateCrossBridgeSolanaTransaction(reviewed,prepared.transaction,prepared.transaction,false)
   await store.mutate(op.id,current=>{if(!current||current.ownerId!==ownerId||current.fingerprint!==op.fingerprint)return fail();if(current.state!=='prepared'||current.solanaTransaction)return current;return {...current,solanaTransaction:prepared.transaction,lastValidBlockHeight:prepared.lastValidBlockHeight,networkFeeLamports:prepared.networkFeeLamports,updatedAt:d.now()}})
   return service.read(ownerId,op.id)
  },
  async submit(id:string){ready();const op=await service.read(ownerId,id);if(!op.solanaTransaction)return fail();return service.submit(ownerId,id,userToken)},
  async signed(id:string,raw:string){
   ready();const op=await service.read(ownerId,id)
   if(typeof op.solanaTransaction!=='string'||!['submitting','pending','submitted','source_confirmed','completed','refunded','source_failed'].includes(op.state))return fail()
   const r=await open(op.quoteToken,ownerId,true),tx=validateCrossBridgeSolanaTransaction(r,op.solanaTransaction,raw,true),sourceHash=bs58.encode(tx.signature!)
   await store.mutate(id,current=>{
    if(!current||current.ownerId!==ownerId||current.fingerprint!==op.fingerprint||current.solanaTransaction!==op.solanaTransaction)return fail()
    if(current.signedTransaction){if(current.signedTransaction!==raw||current.sourceHash!==sourceHash)return fail();return current}
    if(!['pending','submitting'].includes(current.state))return fail()
    return {...current,signedTransaction:raw,sourceHash,state:'submitted',updatedAt:d.now()}
   })
   return broadcast(id)
  },
  async cancel(id:string){ready();await store.mutate(id,current=>{if(!current||current.ownerId!==ownerId)return fail();if(current.signedTransaction||current.sourceHash||!['prepared','submitting','pending'].includes(current.state))return current;return {...current,state:'cancelled',updatedAt:d.now()}});return service.read(ownerId,id)},
  status:(id:string)=>{ready();return service.status(ownerId,id)},read:(id:string)=>{ready();return service.read(ownerId,id)},broadcast,
 }
}

import {createHash} from 'node:crypto'
import type {Hex} from 'viem'
import {bscSwapRequest,validateBscSwap,type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'

export type BscOperationState='prepared'|'submitting'|'pending'|'completed'|'failed'|'cancelled'|'not_submitted'
export type BscOperation={quote:BscSwapQuote;fingerprint:string;state:BscOperationState;createdAt:number;updatedAt:number;hash?:Hex;transactionId?:string;userOperationHash?:Hex;amountOutUnits?:string;nativeFeeUnits?:string;publishedState?:BscOperationState;recoveryRequiredAt?:number;recoveryBlock?:string;recoveryCursor?:string}
export type BscOperationStore={operations:Record<string,BscOperation>}
export type BscOperationBinding=Pick<BscSwapQuote,'ownerId'|'walletId'|'walletAddress'>
export type BscSettlement={status:'pending'|'completed'|'failed';amountOutUnits?:string;nativeFeeUnits?:string}
type Dependencies={
 appId:string;now():number;
 // Must be durable, serialized, and transactional. No in-memory fallback.
 read():Promise<BscOperationStore|undefined>;
 mutate(fn:(store:BscOperationStore|undefined)=>BscOperationStore):Promise<unknown>;
 approve(ownerId:string,approval:string):Promise<boolean>;
 preflight(q:BscSwapQuote):Promise<void>;
 send(request:ReturnType<typeof bscSwapRequest>,authorization:string):Promise<{ok:boolean;status:number;body:any}>;
 transaction(id:string):Promise<any>;
 userOperation?(hash:Hex,wallet:string):Promise<Hex|null>;
 blockNumber?():Promise<string>;
 findUserOperation?(hash:Hex,wallet:string,fromBlock:string):Promise<{hash:Hex|null;nextBlock?:string}>;
 settle(q:BscSwapQuote,hash:Hex,userOperationHash?:Hex):Promise<BscSettlement>;
}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const hash=(s:unknown):s is Hex=>typeof s==='string'&&/^0x[0-9a-f]{64}$/i.test(s)
const providerId=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_-]{10,128}$/.test(s)
const fail=(message='Swap details changed. Reopen the swap.'):never=>{throw Error(message)}
const terminal=(s:BscOperationState)=>['completed','failed','cancelled','not_submitted'].includes(s)
function bound(op:BscOperation|undefined,b:BscOperationBinding){
 if(!op||op.quote.ownerId!==b.ownerId||op.quote.walletId!==b.walletId||!same(op.quote.walletAddress,b.walletAddress))return fail()
 return op
}
/** Internal service. The HTTP adapter must authenticate the caller and verify
 * Privy wallet ownership before supplying bindings or a server-sealed quote. */
export function createBscOperations(d:Dependencies){
 const read=async(id:string,b:BscOperationBinding)=>structuredClone(bound((await d.read())?.operations[id],b))
 async function prepare(quote:BscSwapQuote,approval:string){
  const q=structuredClone(validateBscSwap(quote,d.now())),fingerprint=createHash('sha256').update(JSON.stringify(q)).digest('hex')
  const existing=(await d.read())?.operations[q.id]
  if(existing){bound(existing,q);if(existing.fingerprint!==fingerprint)fail();return structuredClone(existing)}
  await d.preflight(q)
  if(!await d.approve(q.ownerId,approval))fail('Confirm with your PIN or fingerprint.')
  await d.mutate(current=>{
   validateBscSwap(q,d.now())
   const store=current||{operations:{}}
   const previous=store.operations[q.id]
   if(previous){bound(previous,q);if(previous.fingerprint!==fingerprint)fail();return store}
   // A quote expiring never releases a submitted operation. Only an unsigned
   // prepared review may expire and allow the user to create a fresh attempt.
   for(const op of Object.values(store.operations)){
    if(!same(op.quote.walletAddress,q.walletAddress)||terminal(op.state))continue
    if(op.state==='prepared'&&op.quote.expiresAt<=d.now()){op.state='cancelled';op.updatedAt=d.now();continue}
    fail('Your previous swap is still being confirmed.')
   }
   store.operations[q.id]={quote:q,fingerprint,state:'prepared',createdAt:d.now(),updatedAt:d.now()}
   return store
  })
  return read(q.id,q)
 }
 async function cancel(id:string,b:BscOperationBinding){
  await d.mutate(store=>{
   const op=bound(store?.operations[id],b)
   if(op.state==='prepared'){op.state='cancelled';op.updatedAt=d.now()}
   return store!
  })
  return read(id,b)
 }
 async function submit(id:string,b:BscOperationBinding,authorization:string){
  const before=await read(id,b)
  if(before.state!=='prepared')return before
  if(typeof authorization!=='string'||!authorization.trim()||authorization.length>20000)fail('Confirm the swap in your wallet.')
  validateBscSwap(before.quote,d.now())
  await d.preflight(before.quote)
  const request=bscSwapRequest(before.quote,d.appId,d.now())
  const recoveryBlock=before.quote.from!=='BNB'&&d.blockNumber?await d.blockNumber():undefined
  if(before.quote.from!=='BNB'&&d.blockNumber&&(typeof recoveryBlock!=='string'||!/^0x[0-9a-f]+$/i.test(recoveryBlock)))fail('Swap confirmation is still being verified.')
  let claimed=false
  await d.mutate(store=>{
   const op=bound(store?.operations[id],b)
   if(op.fingerprint!==before.fingerprint)fail()
   if(op.state==='prepared'){
    validateBscSwap(op.quote,d.now())
    op.state='submitting';op.updatedAt=d.now();claimed=true
    if(recoveryBlock)op.recoveryBlock=recoveryBlock
   }
   return store!
  })
  if(!claimed)return read(id,b)
  // Never store the authorization signature, and never submit this operation
  // again after a timeout, process crash, provider error or lost response.
  let response:Awaited<ReturnType<Dependencies['send']>>|undefined
  try{response=await d.send(request,authorization)}catch{/* unknown outcome remains reserved */}
  await d.mutate(store=>{
   const op=bound(store?.operations[id],b)
   if(op.fingerprint!==before.fingerprint)fail()
   if(op.state!=='submitting')return store!
   op.state='pending';op.updatedAt=d.now()
   const data=response?.body?.data
   // Reject evidence from a different network even if the HTTP request passed.
   if(response?.ok&&data?.caip2==='eip155:56'){
    if(hash(data.hash))op.hash=data.hash
    if(providerId(data.transaction_id))op.transactionId=data.transaction_id
    if(hash(data.user_operation_hash))op.userOperationHash=data.user_operation_hash
   }else if(response?.status===400&&response.body?.code==='transaction_broadcast_failure'&&!data?.hash&&!data?.transaction_id&&!data?.user_operation_hash){
    op.state='not_submitted'
   }
   return store!
  })
  return read(id,b)
 }
 async function status(id:string,b:BscOperationBinding){
  let op=await read(id,b)
  if(terminal(op.state)||op.state==='prepared')return op
  if(!op.hash&&op.transactionId){
   const tx=await d.transaction(op.transactionId).catch(error=>{if(op.userOperationHash&&d.userOperation)return null;throw error})
   if(tx!==null){
   if(tx?.id!==op.transactionId||tx.wallet_id!==b.walletId||tx.caip2!=='eip155:56'||op.userOperationHash&&tx.user_operation_hash&&!same(tx.user_operation_hash,op.userOperationHash))return fail('Swap confirmation is still being verified.')
   if(!op.userOperationHash&&hash(tx.user_operation_hash)){
    await d.mutate(store=>{const saved=bound(store?.operations[id],b);if(saved.fingerprint!==op.fingerprint||saved.transactionId!==op.transactionId)fail();if(saved.userOperationHash&&!same(saved.userOperationHash,tx.user_operation_hash))fail();saved.userOperationHash=tx.user_operation_hash;return store!})
    op=await read(id,b)
   }
   if(hash(tx.transaction_hash)){
    await d.mutate(store=>{
     const saved=bound(store?.operations[id],b)
     if(saved.fingerprint!==op.fingerprint||saved.transactionId!==op.transactionId||saved.hash&&!same(saved.hash,tx.transaction_hash))fail()
     saved.hash=tx.transaction_hash;saved.updatedAt=d.now();return store!
    })
    op=await read(id,b)
   }
   }
  }
  let recovered=false
  if(!op.hash&&op.userOperationHash&&d.userOperation){
   let candidate=await d.userOperation(op.userOperationHash,b.walletAddress).catch(error=>{if(op.recoveryBlock&&d.findUserOperation)return null;throw error})
   if(!candidate&&op.recoveryBlock&&d.findUserOperation){
    const start=op.recoveryCursor||op.recoveryBlock,found=await d.findUserOperation(op.userOperationHash,b.walletAddress,start)
    candidate=found.hash
    if(!candidate&&found.nextBlock){
     if(!/^0x[0-9a-f]+$/i.test(found.nextBlock)||BigInt(found.nextBlock)<=BigInt(start))fail()
     await d.mutate(store=>{const saved=bound(store?.operations[id],b);if(saved.fingerprint!==op.fingerprint)fail();if(!terminal(saved.state)&&!saved.hash&&(!saved.recoveryCursor||BigInt(saved.recoveryCursor)<BigInt(found.nextBlock!)))saved.recoveryCursor=found.nextBlock;return store!})
    }
   }
   if(candidate){if(!hash(candidate))fail();op={...op,hash:candidate};recovered=true}
  }
  if(!op.hash){
   if(!op.transactionId&&!op.userOperationHash&&!op.recoveryRequiredAt&&d.now()-op.createdAt>=120_000){
    await d.mutate(store=>{const saved=bound(store?.operations[id],b);if(!terminal(saved.state)&&!saved.hash&&!saved.transactionId&&!saved.userOperationHash)saved.recoveryRequiredAt=d.now();return store!})
    return read(id,b)
   }
   return op
  }
  const result=await d.settle(op.quote,op.hash,op.userOperationHash)
  if(!['pending','completed','failed'].includes(result.status))fail()
  // Do not persist a discovered hash until exact canonical settlement proves it.
  if(recovered&&result.status==='pending')return read(id,b)
  if(result.status==='completed'&&(typeof result.amountOutUnits!=='string'||!/^[1-9]\d{0,77}$/.test(result.amountOutUnits)||BigInt(result.amountOutUnits)<BigInt(op.quote.minimumOutUnits)||BigInt(result.amountOutUnits)>=2n**256n))fail('Swap amount is still being verified.')
  if(op.quote.from==='BNB'&&result.status!=='pending'&&(typeof result.nativeFeeUnits!=='string'||!/^[1-9]\d{0,77}$/.test(result.nativeFeeUnits)||BigInt(result.nativeFeeUnits)>BigInt(op.quote.nativeGasReserveUnits)))fail('Swap fee is still being verified.')
  await d.mutate(store=>{
   const saved=bound(store?.operations[id],b)
   if(saved.fingerprint!==op.fingerprint||(!recovered&&!same(saved.hash,op.hash!))||(recovered&&saved.hash&&!same(saved.hash,op.hash!)))fail()
   if(!terminal(saved.state)){
    if(recovered)saved.hash=op.hash
    delete saved.recoveryRequiredAt
    saved.state=result.status;saved.updatedAt=d.now()
    if(result.status==='completed')saved.amountOutUnits=result.amountOutUnits
    if(result.nativeFeeUnits)saved.nativeFeeUnits=result.nativeFeeUnits
   }
   return store!
  })
  return read(id,b)
 }
 async function list(b:BscOperationBinding){
  return Object.values((await d.read())?.operations||{}).filter(op=>op.quote.ownerId===b.ownerId&&op.quote.walletId===b.walletId&&same(op.quote.walletAddress,b.walletAddress)&&['pending','submitting'].includes(op.state)).map(op=>structuredClone(op))
 }
 return {prepare,cancel,submit,status,read,list}
}

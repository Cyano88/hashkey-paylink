import {checkXLayerBillingCoverage} from './xlayer-billing-guard.js'
import type {Request,Response} from 'express'
import {PrivyClient} from '@privy-io/server-auth'
import {formatUnits} from 'viem'
import {createHash} from 'node:crypto'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {createBscRuntime} from './bsc-runtime.js'
import {createBscOperations,type BscOperation,type BscOperationStore} from './bsc-operations.js'
import {createBscSwapHandler} from './bsc-swap.js'
import {createBscBillingGuard,bscBillingRecords,type BscBillingHalt} from './bsc-billing-guard.js'
import {createBscBillingSnapshots,type BscBillingSnapshot} from './bsc-billing-snapshot.js'
import {recoverBscUserOperation,findBscUserOperation} from './bsc-user-operation.js'
import {readBscSwapSettlement} from './bsc-settlement.js'
import {bscSponsoredSwapCalls,validateBscSwap} from '../../src/pocket/lib/pocketBscSwap.js'

const storeKey='pocket:bsc-operations:v1',haltKey='pocket:bsc-billing-halt:v1'
const billingKey=(wallet:string)=>'pocket:bsc-billing-snapshot:v1:'+createHash('sha256').update(wallet).digest('hex')
const unavailable=():never=>{throw Error('BNB Chain swaps are temporarily unavailable.')}
const defaults={sharedBilling:checkXLayerBillingCoverage,env:process.env,fetcher:fetch,now:Date.now,durable:hasRenderDurableStore,
 read:()=>readDurableJson<BscOperationStore>(storeKey),mutate:(fn:(s:BscOperationStore|undefined)=>BscOperationStore)=>mutateDurableJson(storeKey,fn),
 halted:()=>readDurableJson<BscBillingHalt>(haltKey),halt:(v:BscBillingHalt)=>mutateDurableJson<BscBillingHalt>(haltKey,old=>old||v),
 readBilling:(wallet:string)=>readDurableJson<BscBillingSnapshot>(billingKey(wallet)),
 writeBilling:(wallet:string,value:BscBillingSnapshot)=>mutateDurableJson<BscBillingSnapshot>(billingKey(wallet),old=>old&&old.checkedAt>value.checkedAt?old:value),
 approve:consumePocketPaymentApproval,identity:verifiedPrivyUser,journal:recordCirclePocketAction,
 runtime:createBscRuntime,settle:readBscSwapSettlement,
 user:(id:string,appId:string,secret:string)=>new PrivyClient(appId,secret).getUserById(id),
}
/** Lazy assembly: importing this module cannot change existing chain behavior.
 * New execution requires combined or transaction-scoped Privy billing mode. */
export function createBscService(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides},env=d.env,appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID||'',secret=env.PRIVY_APP_SECRET||''
 if(!d.durable()||!appId||!secret||(env.POCKET_SWAP_QUOTE_SECRET||'').length<32)return unavailable()
 const runtime=d.runtime(env,d.fetcher)
 const headers={'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')}
 const transaction=async(id:string)=>{
  if(!/^[a-zA-Z0-9_-]{10,128}$/.test(id))return unavailable()
  const r=await d.fetcher('https://api.privy.io/v1/transactions/'+id,{headers,redirect:'error',signal:AbortSignal.timeout(10000)})
  if(!r.ok)return unavailable();return r.json()
 }
 const snapshots=createBscBillingSnapshots({now:d.now,read:d.readBilling,write:d.writeBilling,transaction})
 const billingActive=new Map<string,number>()
 const billing=createBscBillingGuard({now:d.now,halted:d.halted,halt:d.halt,transaction,billed:snapshots.read,prices:runtime.readPrices})
 function warmBilling(walletId:string){
  billingActive.set(walletId,d.now())
  void d.read().then(store=>billing(Object.values(store?.operations||{}),walletId)).catch(()=>{})
 }
 async function refreshBillingWallet(walletId:string){
  const all=Object.values((await d.read())?.operations||{}),records=bscBillingRecords(all,walletId,d.now())
  if(records.some(o=>!['completed','failed'].includes(o.state)||!o.hash||!o.transactionId))return unavailable()
  await snapshots.refresh(records.map(o=>({transactionId:o.transactionId!,walletId,chainId:56,hash:o.hash!})))
  await billing(Object.values((await d.read())?.operations||{}),walletId)
 }
 const raw=createBscOperations({appId,now:d.now,read:d.read,mutate:d.mutate,approve:(owner,approval)=>d.approve(approval,owner,d.now()),transaction,userOperation:(hash,wallet)=>recoverBscUserOperation(runtime.rpc,hash,wallet),blockNumber:()=>runtime.rpc('eth_blockNumber',[]),findUserOperation:(hash,wallet,block)=>findBscUserOperation(runtime.rpc,hash,wallet,block),
  preflight:async q=>{
   validateBscSwap(q,d.now())
   if(!d.durable()||await runtime.chainId()!==56)return unavailable()
   if(q.from!=='BNB'){
    billingActive.set(q.walletId,d.now())
    if(env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED!=='true'&&env.POCKET_PRIVY_COMBINED_BILLING_ENABLED!=='true')return unavailable()
    if(env.POCKET_PRIVY_COMBINED_BILLING_ENABLED==='true')await d.sharedBilling(q.walletAddress)
    await billing(Object.values((await d.read())?.operations||{}),q.walletId)
    const fee=await runtime.estimateSponsored(q,bscSponsoredSwapCalls(q,d.now()))
    if(fee.expiresAt<=d.now()||BigInt(fee.feeUnits)>BigInt(q.reimbursementUnits))throw Error('Network fee changed. Review the swap again.')
   }else{
    const gas=await runtime.estimateNative(q)
    if(BigInt(gas.gasLimit)>BigInt(q.nativeGas!.gasLimit)||BigInt(gas.maxFeePerGas)>BigInt(q.nativeGas!.maxFeePerGas))throw Error('Network fee changed. Review the swap again.')
   }
   const needed=BigInt(q.totalInputUnits)+BigInt(q.nativeGasReserveUnits)
   if(await runtime.balance(q.from,q.walletAddress)<needed)throw Error('Insufficient '+q.from+'.')
   validateBscSwap(q,d.now())
  },
  send:async(request,authorization)=>{
   const r=await d.fetcher(request.url,{method:'POST',headers:{...request.headers,...headers,'Content-Type':'application/json','privy-authorization-signature':authorization},body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(30000)})
   return {ok:r.ok,status:r.status,body:await r.json()}
  },settle:(q,hash,userOp)=>d.settle(q,hash,runtime.rpc,userOp),
 })
 async function publish(op:BscOperation){
  if(['prepared','cancelled'].includes(op.state))return op
  const q=op.quote
  const feeUnits=op.state==='not_submitted'?'0':q.from==='BNB'?(op.nativeFeeUnits||q.nativeGasReserveUnits):op.state==='failed'?'0':q.reimbursementUnits
  await d.journal({ownerId:q.ownerId,idempotencyKey:'pocket:bsc-swap:'+q.id,action:'wallet.bsc-swap',status:op.state==='completed'?'completed':['failed','not_submitted'].includes(op.state)?'failed':'submitted',resourceId:op.hash||q.id,
   metadata:{network:'bsc',provider:'privy',operationId:q.id,walletAddress:q.walletAddress,from:q.from,to:q.to,amount:formatUnits(BigInt(q.totalInputUnits),18),feeAsset:q.from,fee:formatUnits(BigInt(feeUnits),18),feeEstimated:String(!['completed','failed','not_submitted'].includes(op.state)),feeIncludedInInput:String(q.from!=='BNB'),...(op.hash?{txHash:op.hash}:{}),...(op.amountOutUnits?{amountOut:formatUnits(BigInt(op.amountOutUnits),18)}:{})}})
  await d.mutate(store=>{
   const saved=store?.operations[op.quote.id]
   if(!saved||saved.fingerprint!==op.fingerprint)return unavailable()
   if(saved.state===op.state)saved.publishedState=op.state
   return store!
  })
  if(q.from!=='BNB'&&['completed','failed'].includes(op.state)&&op.publishedState!==op.state)void refreshBillingWallet(q.walletId).catch(()=>{})
  return op
 }
 const operations={...raw,submit:async(...args:Parameters<typeof raw.submit>)=>publish(await raw.submit(...args)),status:async(...args:Parameters<typeof raw.status>)=>publish(await raw.status(...args))}
 const enabled=()=>env.POCKET_BSC_SWAP_ENABLED==='true'&&(env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED==='true'||env.POCKET_PRIVY_COMBINED_BILLING_ENABLED==='true')&&d.durable()
 const handler=createBscSwapHandler({identity:d.identity,user:id=>d.user(id,appId,secret),enabled,appId,secret:env.POCKET_SWAP_QUOTE_SECRET!,runtime,operations,now:d.now,warmBilling})
 async function reconcile(limit=20){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)return unavailable()
  const pending=Object.values((await d.read())?.operations||{}).filter(o=>['submitting','pending'].includes(o.state)||['completed','failed','not_submitted'].includes(o.state)&&o.publishedState!==o.state).sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,limit)
  const result={checked:0,completed:0,failed:0,unresolved:0,billingChecked:0}
  for(const op of pending){
   result.checked++
   try{const next=await operations.status(op.quote.id,op.quote);if(next.state==='completed')result.completed++;else if(next.state==='failed')result.failed++;else result.unresolved++}catch{result.unresolved++}
  }
  // Warm active wallets, not every historical user forever. The full 28-day
  // invoice set is still checked for each selected wallet.
  for(const [wallet,at] of billingActive)if(at<d.now()-15*60_000)billingActive.delete(wallet)
  const all=Object.values((await d.read())?.operations||{}),wallets=[...new Set(all.filter(o=>o.quote.from!=='BNB'&&(o.createdAt>=d.now()-15*60_000||billingActive.has(o.quote.walletId))&&!['prepared','cancelled','not_submitted'].includes(o.state)).map(o=>o.quote.walletId))]
  for(let offset=0;offset<wallets.length;offset+=8)await Promise.all(wallets.slice(offset,offset+8).map(async wallet=>{result.billingChecked++;try{await refreshBillingWallet(wallet)}catch{result.unresolved++}}))
  return result
 }
 return {handler,operations,runtime,reconcile,enabled}
}
let service:ReturnType<typeof createBscService>|undefined
export default async function handler(req:Request,res:Response){
 try{service??=createBscService();return await service.handler(req,res)}catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({ok:false,error:'BNB Chain swaps are temporarily unavailable.'})}
}

export async function reconcileBscSwaps(limit=20){
 const store=await readDurableJson<BscOperationStore>(storeKey)
 if(!Object.values(store?.operations||{}).some(o=>['submitting','pending'].includes(o.state)||['completed','failed','not_submitted'].includes(o.state)&&o.publishedState!==o.state||o.quote.from!=='BNB'&&['completed','failed'].includes(o.state)&&o.createdAt>=Date.now()-28*86400000))return {checked:0,completed:0,failed:0,unresolved:0,billingChecked:0}
 service??=createBscService()
 return service.reconcile(limit)
}

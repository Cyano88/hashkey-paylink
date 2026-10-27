import type {Request,Response} from 'express'
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readBscCheckout,assertBscCheckoutPayable,settleBscCheckout} from '../hosted-bsc-checkouts.js'
import {readBscWallet} from './bsc-wallet.js'
import {bscConfiguredFeePolicy,createBscRuntime} from './bsc-runtime.js'
import {createBscPaymentFeeEstimator} from './bsc-fee-estimator.js'
import {createBscPaymentOperations,type BscPaymentOperationStore,type BscPaymentOperation} from './bsc-payment-operations.js'
import {validateBscPayment,bscPaymentRequest,type BscPaymentQuote} from '../../src/pocket/lib/pocketBscPayment.js'
import {readBscPaymentSettlement} from './bsc-payment-settlement.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {recoverBscUserOperation,findBscUserOperation} from './bsc-user-operation.js'
import {checkXLayerBillingCoverage} from './xlayer-billing-guard.js'
import {recordCirclePocketAction} from '../circle-pocket-action-journal.js'
const key='pocket:bsc-payment-operations:v1'
const unavailable=():never=>{throw Error('BNB Chain payments are temporarily unavailable.')}
const dependencies={env:process.env,fetcher:fetch,durable:hasRenderDurableStore,read:readDurableJson,mutate:mutateDurableJson,identity:verifiedPrivyUser,wallet:readBscWallet,runtime:createBscRuntime,readCheckout:readBscCheckout,assertPayable:assertBscCheckoutPayable,settleCheckout:settleBscCheckout,approval:consumePocketPaymentApproval,billing:checkXLayerBillingCoverage,journal:recordCirclePocketAction,estimate:createBscPaymentFeeEstimator,settlement:readBscPaymentSettlement}
export function createBscPaymentService(overrides:Partial<typeof dependencies>={}){
 const d={...dependencies,...overrides}
 const env=d.env,appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID||'',secret=env.PRIVY_APP_SECRET||'',quoteSecret=env.POCKET_SWAP_QUOTE_SECRET||''
 if(!d.durable()||!appId||!secret||quoteSecret.length<32)return unavailable()
 const runtime=d.runtime(d.env,d.fetcher),read=()=>d.read<BscPaymentOperationStore>(key)
 const estimate=d.estimate({rpc:runtime.rpc,policy:bscConfiguredFeePolicy(d.env),prices:async asset=>{const p=await runtime.readPrices();return {bnb:p.BNB,stable:p[asset]}}})
 const headers={'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')}
 const enabled=()=>env.HASHPAYLINK_BSC_CHECKOUT_ENABLED==='true'&&env.POCKET_PRIVY_COMBINED_BILLING_ENABLED==='true'&&d.durable()
 const transaction=async(id:string)=>{const r=await d.fetcher('https://api.privy.io/v1/transactions/'+encodeURIComponent(id),{headers,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)return unavailable();return r.json()}
 const seal=(q:BscPaymentQuote)=>{const body=Buffer.from(JSON.stringify(q)).toString('base64url');return body+'.'+createHmac('sha256',quoteSecret).update('bsc-payment:'+body).digest('hex')}
 const open=(token:unknown)=>{
  if(typeof token!=='string'||token.length>6000)return unavailable()
  const [body,sig,...rest]=token.split('.'),expected=createHmac('sha256',quoteSecret).update('bsc-payment:'+body).digest('hex')
  if(rest.length||! /^[a-f0-9]{64}$/.test(sig||'')||!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))return unavailable()
  return validateBscPayment(JSON.parse(Buffer.from(body,'base64url').toString()),Date.now())
 }
 async function checkout(q:BscPaymentQuote){
  const c=await d.readCheckout(q.checkoutId);if(!c)return unavailable();await d.assertPayable(c)
  if(c.asset!==q.asset||parseUnits(c.amount,18)!==BigInt(q.amountUnits)||c.recipient.toLowerCase()!==q.recipient.toLowerCase()||q.expiresAt>Date.parse(c.expiresAt))return unavailable()
  return c
 }
 const operations=createBscPaymentOperations({appId,now:Date.now,read,mutate:fn=>d.mutate(key,fn),approve:(owner,approval)=>d.approval(approval,owner),transaction,
 blockNumber:()=>runtime.rpc('eth_blockNumber',[]),userOperation:(hash,wallet)=>recoverBscUserOperation(runtime.rpc,hash,wallet),findUserOperation:(hash,wallet,block)=>findBscUserOperation(runtime.rpc,hash,wallet,block),
 preflight:async q=>{
  if(!enabled()||await runtime.chainId()!==56)return unavailable()
  await checkout(q);await d.billing(q.walletAddress)
  const fee=await estimate(q)
  if(BigInt(fee.coverageFeeUnits)>BigInt(q.reimbursementUnits))throw Error('Fees changed. Review the payment again.')
  if(await runtime.balance(q.asset,q.walletAddress)<BigInt(q.amountUnits)+BigInt(q.reimbursementUnits))throw Error('Insufficient '+q.asset+'.')
 },
 send:async(request,authorization)=>{const r=await d.fetcher(request.url,{method:'POST',headers:{...request.headers,...headers,'Content-Type':'application/json','privy-authorization-signature':authorization},body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(30000)});return {ok:r.ok,status:r.status,body:await r.json()}},
 settle:(q,hash,op)=>d.settlement(q,hash,runtime.rpc,op)})
 async function publish(op:BscPaymentOperation){
  if(['prepared','cancelled'].includes(op.state))return op
  const q=op.quote
  if(op.state==='completed')await d.settleCheckout({id:q.checkoutId,token:(await d.readCheckout(q.checkoutId,true))!.token.address,units:q.amountUnits,recipient:q.recipient,payer:q.walletAddress,hash:op.hash!.toLowerCase(),confirmedAt:new Date(op.updatedAt).toISOString(),paymentId:q.id})
  await d.journal({ownerId:q.ownerId,idempotencyKey:'pocket:bsc-payment:'+q.id,action:'wallet.bsc-payment',status:op.state==='completed'?'completed':['failed','not_submitted'].includes(op.state)?'failed':'submitted',resourceId:q.checkoutId,metadata:{network:'bsc',operationId:q.id,walletAddress:q.walletAddress,assetSymbol:q.asset,amount:formatUnits(BigInt(q.amountUnits),18),fee:['failed','not_submitted'].includes(op.state)?'0':formatUnits(BigInt(q.reimbursementUnits),18),feeAsset:q.asset,...(op.hash?{txHash:op.hash}:{})}})
  await d.mutate<BscPaymentOperationStore>(key,s=>{const saved=s?.operations[q.id];if(!saved)return unavailable();if(saved.state===op.state)saved.publishedState=op.state;return s!})
  return op
 }
 const response=(op:BscPaymentOperation)=>({ok:true,operationId:op.quote.id,checkoutId:op.quote.checkoutId,state:op.state,hash:op.hash,quote:op.quote})
 async function handler(req:Request,res:Response){
  res.setHeader('Cache-Control','no-store')
  try{
   if(req.method!=='POST')return res.sendStatus(405)
   const identity=await d.identity(req),wallet=await d.wallet(identity.userId)
   if(!wallet)throw Error('Open your Pocket wallet to continue.')
   const binding={ownerId:identity.userId,walletId:wallet.id,walletAddress:wallet.address}
   const action=req.body?.action
   if(action==='status'||action==='cancel'){
    const op=action==='cancel'?await operations.cancel(String(req.body.operationId),binding):await operations.status(String(req.body.operationId),binding)
    return res.json(response(await publish(op)))
   }
   if(action==='pending')return res.json({ok:true,operations:(await operations.list(binding)).map(response)})
   if(!enabled())return unavailable()
   if(action==='balance'){
    const c=await d.readCheckout(String(req.body.checkoutId));if(!c)return unavailable();await d.assertPayable(c)
    if(c.asset!=='USDC'&&c.asset!=='USDT')return unavailable()
    return res.json({ok:true,balanceUnits:String(await runtime.balance(c.asset,wallet.address)),address:wallet.address,fundingBufferUnits:String(bscConfiguredFeePolicy(d.env).maximumFeeUnits)})
   }
   if(action==='quote'){
    const c=await d.readCheckout(String(req.body.checkoutId));if(!c)return unavailable();await d.assertPayable(c)
    if(c.asset!=='USDC'&&c.asset!=='USDT')return unavailable()
    const now=Date.now(),q:BscPaymentQuote={version:1,chainId:56,id:randomUUID(),checkoutId:c.id,...binding,asset:c.asset,recipient:c.recipient as `0x${string}`,amountUnits:parseUnits(c.amount,18).toString(),reimbursementUnits:'1',issuedAt:now,expiresAt:Math.min(now+30000,Date.parse(c.expiresAt))}
    const fee=await estimate(q);q.reimbursementUnits=fee.feeUnits;q.expiresAt=fee.expiresAt
    let covered=false
    for(let i=0;i<3;i++){
     const finalFee=await estimate(q);q.expiresAt=Math.min(q.expiresAt,finalFee.expiresAt)
     if(BigInt(finalFee.coverageFeeUnits)<=BigInt(q.reimbursementUnits)){covered=true;break}
     q.reimbursementUnits=finalFee.feeUnits
    }
    if(!covered)throw Error('Fees changed. Please continue again.')
    validateBscPayment(q)
    const balance=await runtime.balance(q.asset,q.walletAddress)
    return res.json({ok:true,quote:q,quoteToken:seal(q),balanceUnits:String(balance)})
   }
   if(action==='prepare'){
    const q=open(req.body.quoteToken)
    if(q.ownerId!==binding.ownerId||q.walletId!==binding.walletId||q.walletAddress.toLowerCase()!==binding.walletAddress.toLowerCase())return unavailable()
    const op=await operations.prepare(q,String(req.headers['x-pocket-payment-approval']||''))
    return res.json({...response(op),request:bscPaymentRequest(q,appId)})
   }
   if(action==='submit')return res.json(response(await publish(await operations.submit(String(req.body.operationId),binding,req.body.authorization))))
   return res.status(400).json({ok:false,error:'Unknown payment action.'})
  }catch(error){return res.status(503).json({ok:false,error:(error as Error).message||'Payment could not be prepared.'})}
 }
 async function reconcile(){
  const pending=Object.values((await read())?.operations||{}).filter(o=>['submitting','pending'].includes(o.state)||['completed','failed','not_submitted'].includes(o.state)&&o.publishedState!==o.state).slice(0,20)
  for(const op of pending)try{await publish(await operations.status(op.quote.id,op.quote))}catch{/* retain for the next reconciliation */}
 }
 return {handler,reconcile}
}
let service:ReturnType<typeof createBscPaymentService>|undefined
export default async function handler(req:Request,res:Response){try{service??=createBscPaymentService();return await service.handler(req,res)}catch{return res.status(503).json({ok:false,error:'BNB Chain payments are temporarily unavailable.'})}}
export async function reconcileBscPayments(){if(!hasRenderDurableStore())return;const store=await readDurableJson<BscPaymentOperationStore>(key);if(!Object.keys(store?.operations||{}).length)return;service??=createBscPaymentService();return service.reconcile()}

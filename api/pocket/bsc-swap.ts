import type {Request,Response} from 'express'
import {getAddress,isAddress,parseUnits,formatUnits} from 'viem'
import {openBscSwap,quoteBscSwap,sealBscSwap} from './bsc-swap-quote.js'
import {bscSwapRequest,type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'
import {pocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import type {createBscRuntime} from './bsc-runtime.js'
import type {createBscOperations,BscOperation,BscOperationBinding} from './bsc-operations.js'

type Dependencies={
 identity(req:Request):Promise<{userId:string}>;
 user(id:string):Promise<{linkedAccounts:any[]}>;
 enabled():boolean;appId:string;secret:string;
 runtime:ReturnType<typeof createBscRuntime>;
 operations:ReturnType<typeof createBscOperations>;
 now():number;
 warmBilling?(walletId:string):void;
}
export function bscSwapReview(q:BscSwapQuote){
 const tokenIn=pocketBscAsset(q.from),tokenOut=pocketBscAsset(q.to)
 return {id:q.id,network:'bsc',walletAddress:q.walletAddress,tokenIn,tokenOut,amount:formatUnits(BigInt(q.totalInputUnits),18),expectedOut:formatUnits(BigInt(q.expectedOutUnits),18),minimumOut:formatUnits(BigInt(q.minimumOutUnits),18),fee:formatUnits(BigInt(q.from==='BNB'?q.nativeGasReserveUnits:q.reimbursementUnits),18),feeAsset:q.from,feeIncludedInInput:q.from!=='BNB',feeFromOutput:false,expiresAt:q.expiresAt,positiveSlippageFee:q.positiveSlippageFee}
}
function result(op:BscOperation){
 const feeUnits=op.state==='not_submitted'?'0':op.quote.from==='BNB'?op.nativeFeeUnits:['completed','failed'].includes(op.state)?(op.state==='failed'?'0':op.quote.reimbursementUnits):undefined
 return {ok:true,id:op.quote.id,status:op.state,quote:bscSwapReview(op.quote),...(feeUnits!==undefined?{fee:formatUnits(BigInt(feeUnits),18),feeAsset:op.quote.from}:{}),...(op.hash?{txHash:op.hash}:{}),...(op.amountOutUnits?{amountOut:formatUnits(BigInt(op.amountOutUnits),18)}:{})}
}
/** Authenticated boundary; runtime assembly supplies durable operations,
 * billing checks, canonical settlement and journal integration. */
export function createBscSwapHandler(d:Dependencies){
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  let attempted:{id:string;binding:BscOperationBinding}|undefined
  try{
   if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId}=await d.identity(req)
   const action=req.body?.action
   if(!['quote','prepare','submit','status','cancel','balances','capabilities'].includes(action))return res.status(400).json({ok:false,error:'Unsupported swap action.'})
   // Recovery and cancellation remain available when new execution is disabled.
   if(!['status','cancel','capabilities','balances'].includes(action)&&!d.enabled())return res.status(409).json({ok:false,error:'BNB Chain swaps are not available yet.'})
   const wallet=req.body?.wallet
   if(typeof wallet!=='string'||!isAddress(wallet))return res.status(400).json({ok:false,error:'Reconnect your wallet.'})
   const user=await d.user(userId)
   const linked=user.linkedAccounts.filter(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&typeof a.address==='string'&&a.address.toLowerCase()===wallet.toLowerCase())
   if(linked.length!==1||typeof linked[0].id!=='string'||!/^[a-zA-Z0-9]{10,64}$/.test(linked[0].id))return res.status(403).json({ok:false,error:'Reconnect your Pocket wallet.'})
   const binding={ownerId:userId,walletId:linked[0].id as string,walletAddress:getAddress(wallet)}
   if(action==='capabilities'||action==='quote')d.warmBilling?.(binding.walletId)
   if(action==='capabilities')return res.json({ok:true,enabled:d.enabled(),pending:(await d.operations.list(binding)).map(op=>({quote:bscSwapReview(op.quote),quoteToken:sealBscSwap(op.quote,d.secret,op.quote.issuedAt),startedAt:op.createdAt,sufficientBalance:true}))})
   if(action==='balances'){
    const balances=await Promise.all((['BNB','USDC','USDT'] as const).map(async asset=>[asset,formatUnits(await d.runtime.balance(asset,binding.walletAddress),18)]))
    return res.json({ok:true,network:'bsc',walletAddress:binding.walletAddress,balances:Object.fromEntries(balances)})
   }
   if(action==='quote'){
    const amount=req.body.amount
    if(typeof amount!=='string'||! /^(0|[1-9]\d{0,30})(?:\.\d{1,18})?$/.test(amount)||parseUnits(amount,18)<=0n)return res.status(400).json({ok:false,error:'Enter a valid amount.'})
    const q=await quoteBscSwap({...binding,from:req.body.from,to:req.body.to,totalInputUnits:String(parseUnits(amount,18))},d.runtime)
    const prices=await d.runtime.readPrices()
    return res.json({ok:true,sufficientBalance:true,quote:{...bscSwapReview(q),outputUsdPrice:Number(prices[q.to].scaled8)/1e8},quoteToken:sealBscSwap(q,d.secret,d.now())})
   }
   const q=openBscSwap(String(req.body.quoteToken||''),binding,d.secret,d.now(),action!=='prepare')
   if(action==='prepare'){
    const approval=req.headers['x-pocket-payment-approval']
    const op=await d.operations.prepare(q,typeof approval==='string'?approval:'')
    return res.json({...result(op),...(op.state==='prepared'?{request:bscSwapRequest(op.quote,d.appId,d.now()),executionQuote:op.quote}:{})})
   }
   if(action==='submit'){
    attempted={id:q.id,binding}
    return res.json(result(await d.operations.submit(q.id,binding,req.body.authorization)))
   }
   if(action==='cancel')return res.json(result(await d.operations.cancel(q.id,binding)))
   return res.json(result(await d.operations.status(q.id,binding)))
  }catch(error){
   if(attempted){
    try{
     const op=await d.operations.read(attempted.id,attempted.binding)
     if(['submitting','pending','completed','failed','not_submitted'].includes(op.state))return res.status(202).json(result(op))
     if(op.state==='prepared'){
      const message=error instanceof Error?error.message:''
      return res.status(409).json({ok:false,code:'swap_not_submitted',error:message==='Network fee changed. Review the swap again.'?message:'Could not prepare this swap. Refresh the quote.'})
     }
    }catch{return res.status(503).json({ok:false,status:'pending',code:'swap_outcome_unknown',error:'Still confirming your swap.'})}
   }
   if((error as any)?.status===401)return res.status(401).json({ok:false,error:'Sign in again to continue.'})
   // Never leak provider diagnostics, RPC credentials or wallet SDK payloads.
   const message=error instanceof Error?error.message:''
   const safe=/^(Insufficient (BNB|USDC|USDT)(\.| for the swap and network fee\.)|The amount is too small to cover the network fee\.|Confirm with your PIN or fingerprint\.|Your previous swap is still being confirmed\.|Swap confirmation is still being verified\.|Network fee changed\. Review the swap again\.|Swap fees are still being verified\.|BNB Chain sponsorship is paused for a fee review\.)$/.test(message)
   return res.status(409).json({ok:false,error:safe?message:'Could not update this swap. Try again.'})
  }
 }
}

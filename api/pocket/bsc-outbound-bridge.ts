import {isPocketBridgeDestination,validBridgeDestination,sameBridgeDestination,type PocketCircleBridgeNetwork} from '../../src/pocket/lib/pocketBridgeDestination.js'
import {cashBridgePurpose} from '../../src/pocket/lib/pocketCashBridgePurpose.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import type {Request,Response} from 'express'
import {PrivyClient} from '@privy-io/server-auth'
import {randomUUID} from 'node:crypto'
import {decodeFunctionData,getAddress,parseUnits,parseAbi,formatUnits} from 'viem'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {createBscRuntime,bscConfiguredFeePolicy} from './bsc-runtime.js'
import {createBscBridgeFeeEstimator} from './bsc-bridge-fee-estimator.js'
import {createBscBridgeOperations,type BscBridgeOperationStore,type BscBridgeOperation} from './bsc-bridge-operations.js'
import {createBscBridgeBillingGuard,type BscBillingHalt} from './bsc-bridge-billing.js'
import {recoverBscUserOperation,findBscUserOperation} from './bsc-user-operation.js'
import {createBscBridgeSettlement} from './bsc-bridge-settlement.js'
import {bscOutboundCalls,bscOutboundRequest,validateBscOutbound,type BscOutboundQuote} from '../../src/pocket/lib/pocketBscOutboundBridge.js'
import {quoteBscRelay} from './bsc-bridge-provider.js'
import {sealBscOutbound,openBscOutbound,bscOutboundPreview} from './bsc-outbound-bridge-quote.js'
const storeKey='pocket:bsc-bridge-operations:v1',haltKey='pocket:bsc-bridge-billing-halt:v1',ACTION='wallet.bsc-bridge'
const fail=(message:string,status=409):never=>{throw Object.assign(Error(message),{status})}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
export function createBscOutboundService(env:NodeJS.ProcessEnv=process.env,fetcher=fetch){
 const appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID||'',secret=env.PRIVY_APP_SECRET||'',seal=env.POCKET_SWAP_QUOTE_SECRET||''
 if(!hasRenderDurableStore()||!appId||!secret||seal.length<32)fail('Bridge configuration is unavailable.',503)
 const runtime=createBscRuntime(env,fetcher),privy=new PrivyClient(appId,secret)
 const enabled=()=>env.POCKET_BSC_BRIDGE_ENABLED==='true'&&(env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED==='true'||env.POCKET_PRIVY_COMBINED_BILLING_ENABLED==='true')&&!!env.RELAY_API_KEY
 const estimate=createBscBridgeFeeEstimator({rpc:runtime.rpc,policy:bscConfiguredFeePolicy(env),prices:async asset=>{const p=await runtime.readPrices();return {bnb:p.BNB,stable:p[asset]}}})
 const read=()=>readDurableJson<BscBridgeOperationStore>(storeKey)
 const mutate=(fn:(s:BscBridgeOperationStore|undefined)=>BscBridgeOperationStore)=>mutateDurableJson(storeKey,fn)
 const headers={'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')}
 const transaction=async(id:string)=>{if(!/^[a-zA-Z0-9_-]{10,128}$/.test(id))fail('Bridge confirmation is still being verified.');const r=await fetcher('https://api.privy.io/v1/transactions/'+id,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)fail('Bridge confirmation is still being verified.');return r.json()}
 const billing=createBscBridgeBillingGuard({now:Date.now,halted:()=>readDurableJson<BscBillingHalt>(haltKey),halt:v=>mutateDurableJson<BscBillingHalt>(haltKey,old=>old||v),transaction,prices:runtime.readPrices})
 const wallets=async(owner:string,network:PocketCircleBridgeNetwork='base')=>{const [user,base]=await Promise.all([privy.getUserById(owner),readCircleLink(circleLinkKey(owner,network,'payment'))]);const w=user.linkedAccounts.filter((a:any)=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy') as any[];if(w.length!==1||!w[0].id||!base||!validBridgeDestination(network,base.circleWalletAddress))fail('Open your destination and BNB Chain wallets to continue.');return {ownerId:owner,walletId:w[0].id as string,walletAddress:getAddress(w[0].address),destinationAddress:network==='solana'?base!.circleWalletAddress:getAddress(base!.circleWalletAddress)}}
 const operations=createBscBridgeOperations({appId,now:Date.now,read,mutate,approve:(owner,token)=>consumePocketPaymentApproval(token,owner,Date.now()),transaction,blockNumber:()=>runtime.rpc('eth_blockNumber',[]),userOperation:(h,w)=>recoverBscUserOperation(runtime.rpc,h,w),findUserOperation:(h,w,b)=>findBscUserOperation(runtime.rpc,h,w,b),
  preflight:async q=>{if(!enabled()||await runtime.chainId()!==56)fail('BNB Chain bridging is unavailable.');const w=await wallets(q.ownerId,q.destination);if(w.walletId!==q.walletId||!same(w.walletAddress,q.walletAddress)||!sameBridgeDestination(q.destination,w.destinationAddress,q.destinationAddress))fail('Linked wallets changed. Review the bridge again.');await billing(Object.values((await read())?.operations||{}),q.walletId);const priced=await estimate(q,bscOutboundCalls(q));if(BigInt(priced.coverageFeeUnits)>BigInt(q.reimbursementUnits))fail('Network fee changed. Review the bridge again.');if(await runtime.balance(q.asset,q.walletAddress)<BigInt(q.totalInputUnits))fail('Insufficient '+q.asset+'.')},
  send:async(request,authorization)=>{const r=await fetcher(request.url,{method:'POST',headers:{...request.headers,...headers,'content-type':'application/json','privy-authorization-signature':authorization},body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(30000)});return {ok:r.ok,status:r.status,body:await r.json()}},settle:createBscBridgeSettlement(env,fetcher)})
 const result=(op:BscBridgeOperation)=>({ok:true,id:op.quote.id,status:op.state==='prepared'?'awaiting_approval':op.state,quote:bscOutboundPreview(op.quote),...(op.hash?{txHash:op.hash}:{}),...(op.destinationTxHash?{destinationTxHash:op.destinationTxHash}:{}),...(op.state==='refunded'?{refundAsset:op.quote.asset,refundNetwork:op.refundNetwork,refundAmount:op.refundAmount,refundTxHash:op.destinationTxHash}:{})})
 async function publish(op:BscBridgeOperation){
  if(['prepared','cancelled','not_submitted'].includes(op.state))return op
  const q=op.quote
  await recordCirclePocketAction({ownerId:q.ownerId,idempotencyKey:'pocket:bsc-outbound-bridge:'+q.id,action:ACTION,status:op.state==='completed'?'completed':['failed','refunded'].includes(op.state)?'failed':'submitted',resourceId:q.id,metadata:{...cashBridgePurpose(q.purpose,q.destination),...(op.state==='completed'&&op.amountOutUnits?{cashReceivedAmount:formatUnits(BigInt(op.amountOutUnits),6)}:{}),execution:'privy',quoteToken:sealBscOutbound(q,seal),source:q.source,destination:q.destination,assetSymbol:q.asset,amount:formatUnits(BigInt(q.amountUnits),18),walletAddress:q.walletAddress,destinationAddress:q.destinationAddress,paymentState:op.state,...(op.hash?{txHash:op.hash}:{}),...(op.destinationTxHash?{destinationTxHash:op.destinationTxHash}:{}),...(op.refundAmount?{refundAmount:op.refundAmount,refundNetwork:op.refundNetwork||'',refundAsset:q.asset}:{})}})
  if(['completed','refunded'].includes(op.state))await appendPocketMoneyLedgerEvent({eventKey:'pocket:bsc-outbound-bridge:'+q.id+':'+op.state,ownerId:q.ownerId,executionId:q.id,rail:'wallet_bridge',state:op.state as 'completed'|'refunded',asset:q.asset,amount:op.state==='refunded'?op.refundAmount||'0':formatUnits(BigInt(q.amountUnits),18),sourceNetwork:'bsc',settlementNetwork:op.state==='refunded'?op.refundNetwork||'bsc':q.destination,resourceId:q.id,transactionHash:op.hash,metadata:{destinationTxHash:op.destinationTxHash!,provider:'relay'},recordedAt:op.updatedAt})
  await mutate(store=>{const saved=store?.operations[q.id];if(saved&&saved.state===op.state)saved.publishedState=op.state;return store!})
  return op
 }
 const handler=async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');let claimed:{q:BscOutboundQuote}|undefined
  try{
   const {userId}=await verifiedPrivyUser(req),action=req.method==='GET'?'capabilities':req.body?.action
   if(!['capabilities','quote','prepare','submit','cancel','status'].includes(action))fail('Unsupported bridge action.',400)
   const target=action==='quote'?req.body.destination:action==='capabilities'?'base':openBscOutbound(String(req.body.quoteToken||''),userId,seal).destination
   if(!isPocketBridgeDestination(target))fail('Choose a supported destination.',400)
   const w=await wallets(userId,target)
   if(action==='capabilities')return res.json({ok:true,enabled:enabled(),pending:(await operations.list(w)).map(op=>({quote:bscOutboundPreview(op.quote),quoteToken:sealBscOutbound(op.quote,seal),...(op.hash?{txHash:op.hash}:{})}))})
   if(action==='quote'){
    if(!enabled())fail('BNB Chain bridging is unavailable.')
    const purpose=cashBridgePurpose(req.body.purpose,req.body.destination);const asset=req.body.asset,amount=req.body.amount
    if(req.body.source!=='bsc'||!isPocketBridgeDestination(req.body.destination)||req.body.destination==='arc'&&asset==='USDT'||!['USDC','USDT'].includes(asset)||typeof amount!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(amount)||parseUnits(amount,18)<=0n)fail('Enter a valid bridge amount.',400)
    const units=String(parseUnits(amount,18)),route=await quoteBscRelay({asset,source:'bsc',destination:target,sender:w.walletAddress,recipient:w.destinationAddress,amountUnits:units},env.RELAY_API_KEY!,fetcher)
    const q:BscOutboundQuote={...purpose,version:1,id:randomUUID(),...w,source:'bsc',destination:target,asset,from:asset,amountUnits:units,minimumOutUnits:route.minimumUnits,receiveUnits:route.receiveUnits,reimbursementUnits:'1',totalInputUnits:String(BigInt(units)+1n),orderId:route.orderId as any,requestId:route.requestId as any,issuedAt:Date.now(),expiresAt:route.expiresAt}
    for(let n=0;n<3;n++){const fee=await estimate(q,bscOutboundCalls(q));q.expiresAt=Math.min(q.expiresAt,fee.expiresAt);if(BigInt(fee.feeUnits)<=BigInt(q.reimbursementUnits))break;q.reimbursementUnits=fee.feeUnits;q.totalInputUnits=String(BigInt(units)+BigInt(fee.feeUnits));if(n===2)fail('Network fee changed. Review the bridge again.')}
    validateBscOutbound(q);return res.json({ok:true,quote:bscOutboundPreview(q),quoteToken:sealBscOutbound(q,seal),sufficientBalance:await runtime.balance(asset,w.walletAddress)>=BigInt(q.totalInputUnits)})
   }
   const q=openBscOutbound(String(req.body.quoteToken||''),userId,seal)
   if(q.walletId!==w.walletId||!same(q.walletAddress,w.walletAddress))fail('Linked wallet changed.')
   if(action==='prepare'){const a=req.headers['x-pocket-payment-approval'];const op=await operations.prepare(q,typeof a==='string'?a:'');return res.json({...result(op),...(op.state==='prepared'?{status:'prepared',request:bscOutboundRequest(q,appId),executionQuote:q}:{})})}
   if(action==='submit'){claimed={q};return res.json(result(await publish(await operations.submit(q.id,w,req.body.authorization))))}
   if(action==='cancel')return res.json(result(await operations.cancel(q.id,w)))
   const known=(await read())?.operations[q.id];if(!known)return res.json({ok:true,status:'not_submitted'});let op=await operations.read(q.id,w);if(op.state==='prepared')op=await operations.cancel(q.id,w)
   return res.json(result(await publish(await operations.status(q.id,w))))
  }catch(e){
   if(claimed){const op=await operations.read(claimed.q.id,claimed.q).catch(()=>null);if(op&&op.state!=='prepared')return res.status(202).json(result(op));if(op)return res.status(409).json({ok:false,code:'bridge_not_submitted',error:'Bridge was not submitted. Continue to review it.'});return res.status(503).json({ok:false,error:'Still confirming your bridge.'})}
   const error=e as Error&{status?:number};return res.status(error.status||503).json({ok:false,error:error.status?error.message:actionMessage(req.body?.action)})
  }
 }
 async function reconcile(limit=20){const pending=Object.values((await read())?.operations||{}).filter(o=>['submitting','pending'].includes(o.state)||['completed','failed','refunded'].includes(o.state)&&o.publishedState!==o.state).slice(0,limit);for(const op of pending)try{await publish(await operations.status(op.quote.id,op.quote))}catch{}return {checked:pending.length}}
 return {handler,reconcile}
}
function actionMessage(action:unknown){return action==='quote'?'Could not update the bridge amount. Please try again.':'Bridge status is unavailable. Your transfer remains saved.'}
let service:ReturnType<typeof createBscOutboundService>|undefined
export default async function handler(req:Request,res:Response){try{service??=createBscOutboundService();return service.handler(req,res)}catch{return res.status(503).json({ok:false,error:'BNB Chain bridging is temporarily unavailable.'})}}
export async function reconcileBscOutboundBridges(limit=20){service??=createBscOutboundService();return service.reconcile(limit)}

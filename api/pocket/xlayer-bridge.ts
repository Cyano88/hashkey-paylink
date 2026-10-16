import {POCKET_XLAYER_MINIMUM_AMOUNT,POCKET_XLAYER_MINIMUM_UNITS} from '../../src/pocket/lib/pocketXLayerMinimum.js'
import type {Request,Response} from 'express'
import {xlayerBridgeWalletEligible} from './xlayer-bridge-access.js'
import {PrivyClient} from '@privy-io/server-auth'
import {createPublicClient,getAddress,http,parseAbi,parseUnits,formatUnits,type Hex} from 'viem'
import {base,xLayer} from 'viem/chains'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {createCircleGasStationEvmChallenge,readCircleEvmChallenge,quoteCircleEvmBatchRecovery} from '../circle-solana-email.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {evmActivity} from './wallet-chain-activity.js'
import {quoteRelayStablecoin,stablecoinAddress} from './xlayer-bridge-provider.js'
import {xlayerBridgeSourceProven,xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven,evmStablecoinDelta} from './xlayer-bridge-evidence.js'
import {xlayerBridgeQuote,sealXLayerBridgeQuote,openXLayerBridgeQuote,xlayerBridgePreview,type XLayerBridgeQuote} from './xlayer-bridge-quote.js'

const ACTION='wallet.xlayer-bridge'
const balanceAbi=parseAbi(['function balanceOf(address) view returns(uint256)'])
function fail(message:string,status=409):never {throw Object.assign(Error(message),{status})}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const client=(network:'base'|'xlayer')=>createPublicClient({chain:network==='base'?base:xLayer,transport:http(network==='base'?process.env.PRIVATE_RPC_URL_BASE||undefined:process.env.PRIVATE_RPC_URL_XLAYER||'https://rpc.xlayer.tech',{timeout:15000})})
async function wallets(owner:string){
 const appId=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID||'',secret=process.env.PRIVY_APP_SECRET||''
 const [from,user]=await Promise.all([readCircleLink(circleLinkKey(owner,'base','payment')),new PrivyClient(appId,secret).getUserById(owner)])
 const linked=user.linkedAccounts.filter(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum') as Array<{address:string}>
 if(!from||linked.length!==1)fail('Open your Base and X Layer wallets before bridging.')
 return {walletId:from.circleWalletId,walletAddress:getAddress(from.circleWalletAddress),destinationAddress:getAddress(linked[0].address)}
}
async function enabled(owner:string){
 if(process.env.POCKET_XLAYER_BRIDGE_ENABLED!=='true')return false
 const linked=await wallets(owner).catch(()=>null)
 return !!linked&&xlayerBridgeWalletEligible(linked.destinationAddress)
}
const defaults={identity:verifiedPrivyUser,wallets,client,quote:quoteRelayStablecoin,price:quoteCircleEvmBatchRecovery,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,challenge:createCircleGasStationEvmChallenge,readChallenge:readCircleEvmChallenge,activity:evmActivity,ledger:appendPocketMoneyLedgerEvent,fetch:globalThis.fetch,now:Date.now,enabled,usdtEnabled:()=>process.env.POCKET_XLAYER_USDT_BRIDGE_ENABLED==='true',apiKey:()=>process.env.RELAY_API_KEY||''}
const key=(q:XLayerBridgeQuote)=>'pocket:xlayer-bridge:'+q.id
const binding=(q:XLayerBridgeQuote)=>({...q,sender:q.walletAddress,recipient:q.destinationAddress})
const metadata=(q:XLayerBridgeQuote,quoteToken:string)=>({quoteToken,intentFingerprint:q.walletAddress.toLowerCase()+':base:xlayer',assetSymbol:q.asset,source:q.source,destination:q.destination,amount:q.amount,walletAddress:q.walletAddress,destinationAddress:q.destinationAddress,provider:'relay'})

export function createXLayerBridgeHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 async function verifyNetworks(){
  const [source,destination]=await Promise.all([d.client('base').getChainId(),d.client('xlayer').getChainId()])
  if(source!==8453||destination!==196)throw Error('Bridge network mismatch.')
 }
 async function receipt(network:'base'|'xlayer',hash:string){
  if(!/^0x[0-9a-f]{64}$/i.test(hash))return null
  const rpc=d.client(network)
  if(await rpc.getChainId()!==(network==='base'?8453:196))throw Error('Bridge network mismatch.')
  const r=await rpc.getTransactionReceipt({hash:hash as Hex}).catch(()=>null)
  if(!r)return null
  const block=await rpc.getBlock({blockNumber:r.blockNumber})
  return same(block.hash,r.blockHash)?r:null
 }
 async function reconcile(owner:string,q:XLayerBridgeQuote,token:string,input:{txHash?:string;circleUserToken?:string}){
  const existing=await d.find(owner,key(q),ACTION)
  if(!existing)return {ok:true,status:'not_submitted'}
  const meta:Record<string,string>={...metadata(q,token),...existing.metadata}
  if(existing.status==='completed'||existing.status==='failed'){
   const outcome=existing.status==='completed'?'completed':meta.paymentState==='refunded'?'refunded':'failed'
   if(outcome!=='failed')await d.ledger({eventKey:key(q)+':'+outcome,ownerId:owner,executionId:existing.id,rail:'wallet_bridge',state:outcome,asset:outcome==='refunded'?(meta.refundAsset||q.asset):q.asset,amount:outcome==='refunded'?meta.refundAmount:q.amount,sourceNetwork:'base',settlementNetwork:outcome==='refunded'?meta.refundNetwork:'xlayer',resourceId:q.id,transactionHash:meta.txHash,metadata:{destinationTxHash:meta.destinationTxHash,provider:'relay'},recordedAt:existing.updatedAt})
   return {ok:true,status:meta.paymentState==='not_submitted'?'not_submitted':outcome,...(meta.paymentState==='not_submitted'?{reason:'approval_expired'}:{}),txHash:meta.txHash,destinationTxHash:meta.destinationTxHash,...(outcome==='refunded'?{refundAsset:meta.refundAsset||q.asset,refundAmount:meta.refundAmount,refundNetwork:meta.refundNetwork,refundTxHash:meta.refundTxHash||meta.destinationTxHash}:{})}
  }
  let hash=meta.txHash||'',awaiting=false
  if(!hash&&meta.challengeId&&input.circleUserToken){
   const result=await d.readChallenge({chain:'base',userToken:input.circleUserToken,walletId:q.walletId,walletAddress:q.walletAddress,challengeId:meta.challengeId})
   hash=result.txHash||'';awaiting=result.status==='awaiting_approval'
   if(result.status==='failed'&&'notSubmitted' in result&&result.notSubmitted===true){
    await d.record({ownerId:owner,idempotencyKey:key(q),action:ACTION,status:'failed',resourceId:q.id,metadata:{...meta,paymentState:'not_submitted'}})
    return {ok:true,status:'not_submitted',reason:'approval_expired'}
   }
  }
  hash=hash||input.txHash||''
  if(!hash){
   const rows=await d.activity('base',q.walletAddress,AbortSignal.timeout(8000)).catch(()=>[])
   const candidates=[...new Set(rows.filter(r=>r.assetSymbol===q.asset&&r.direction==='out'&&r.ts>=q.expiresAt-120000).map(r=>r.txHash))].slice(0,8)
   for(const h of candidates){const r=await receipt('base',h);if(r&&xlayerBridgeSourceProven(binding(q),r,h)){hash=h;break}}
  }
  if(!hash)return {ok:true,status:awaiting?'awaiting_approval':'pending',challengeId:meta.challengeId}
  const source=await receipt('base',hash)
  if(!source)return {ok:true,status:'pending',challengeId:meta.challengeId}
  if(!xlayerBridgeSourceProven(binding(q),source,hash))return {ok:true,status:'needs_attention'}
  await d.record({ownerId:owner,idempotencyKey:key(q),action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,txHash:hash,sourceConfirmed:'true'}})
  const get=async(path:string)=>{if(!d.apiKey())throw Error('Bridge recovery is unavailable.');const r=await d.fetch('https://api.relay.link'+path,{headers:{'x-api-key':d.apiKey()},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Bridge status is unavailable.');return r.json()}
  const status=await get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId))
  if(!['success','refund','failure'].includes(status.status))return {ok:true,status:'pending',txHash:hash,sourceConfirmed:true}
  const requests=await get('/requests/v3?'+new URLSearchParams({id:q.requestId,orderId:q.orderId,limit:'1'}))
  const candidate=xlayerBridgeDeliveryCandidate(binding(q),hash,status,requests)
  if(candidate.status!=='verify_delivery')return {ok:true,...candidate,txHash:hash,sourceConfirmed:true}
  if(candidate.network!=='base'&&candidate.network!=='xlayer')return {ok:true,status:'needs_attention',txHash:hash}
  const destination=await receipt(candidate.network,candidate.hash)
  if(!destination)return {ok:true,status:'pending',txHash:hash,sourceConfirmed:true}
  const delta=evmStablecoinDelta(destination,candidate.network,candidate.asset,candidate.recipient,candidate.hash)
  if(!xlayerBridgeDeliveryProven(candidate,delta))return {ok:true,status:'needs_attention',txHash:hash,sourceConfirmed:true}
  await d.record({ownerId:owner,idempotencyKey:key(q),action:ACTION,status:candidate.outcome==='completed'?'completed':'failed',resourceId:q.id,metadata:{...meta,txHash:hash,sourceConfirmed:'true',destinationTxHash:candidate.hash,paymentState:candidate.outcome,...(candidate.outcome==='refunded'?{refundAsset:candidate.asset,refundTxHash:candidate.hash,refundNetwork:candidate.network,refundAmount:formatUnits(delta!,6)}:{})}})
  return reconcile(owner,q,token,input)
 }
 const handler=async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId}=await d.identity(req)
   if(req.method==='GET'){
    const rows=await d.list(userId,500,ACTION,true)
    return res.json({ok:true,enabled:await d.enabled(userId),usdtEnabled:await d.enabled(userId)&&d.usdtEnabled(),pending:rows.filter(r=>['started','submitted'].includes(r.status)&&r.metadata?.quoteToken).map(r=>({quote:xlayerBridgePreview(openXLayerBridgeQuote(r.metadata!.quoteToken,userId)),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,txHash:r.metadata?.txHash}))})
   }
   if(req.body?.action==='quote'){
    if(!await d.enabled(userId))fail('X Layer bridging is not available yet.')
    const asset=req.body.asset??'USDC'
    if(req.body.source!=='base'||req.body.destination!=='xlayer'||!['USDC','USDT'].includes(asset))fail('This bridge supports Base to X Layer stablecoins only.')
    if(asset==='USDT'&&!d.usdtEnabled())fail('USDT bridging to X Layer is not available yet.')
    const amount=String(req.body.amount||'')
    if(!/^\d{1,12}(\.\d{1,6})?$/.test(amount)||parseUnits(amount,6)<=0n)fail('Enter a '+asset+' amount.')
    await verifyNetworks()
    if(parseUnits(amount,6)<POCKET_XLAYER_MINIMUM_UNITS)fail('Minimum bridge amount is '+POCKET_XLAYER_MINIMUM_AMOUNT+' '+asset+'.')
    const w=await d.wallets(userId),amountUnits=parseUnits(amount,6).toString()
    const route=await d.quote({asset,source:'base',destination:'xlayer',sender:w.walletAddress,recipient:w.destinationAddress,amountUnits},d.apiKey(),d.fetch,{allowXLayerUsdcRefund:asset==='USDT'})
    if(route.execution.kind!=='evm')throw Error('Unsupported bridge execution.')
    const priced=await d.price({ownerId:userId,...w,source:'base',destination:'xlayer',asset,tokenAddress:getAddress(stablecoinAddress('base',asset)),amountUnits,bridgeDebitUnits:amountUnits,bridgeCallData:route.execution.callData,providerExpiresAt:route.expiresAt,userToken:String(req.body.circleUserToken||'')})
    const q=xlayerBridgeQuote(route,priced),balance=await d.client('base').readContract({address:getAddress(stablecoinAddress('base',q.asset)),abi:balanceAbi,functionName:'balanceOf',args:[q.walletAddress]})
    return res.json({ok:true,quote:xlayerBridgePreview(q),quoteToken:sealXLayerBridgeQuote(q),sufficientBalance:balance>=parseUnits(q.total,6)})
   }
   if(!['execute','status','resume'].includes(req.body?.action))fail('Unsupported bridge action.',400)
   const token=String(req.body.quoteToken||''),q=openXLayerBridgeQuote(token,userId)
   const existing=await d.find(userId,key(q),ACTION)
   if(req.body.action==='status')return res.json(await reconcile(userId,q,token,req.body))
   if(req.body.action==='resume'){
    const state=await reconcile(userId,q,token,req.body)
    if(state.status==='awaiting_approval'){
     const w=await d.wallets(userId)
     if(w.walletId!==q.walletId||!same(w.walletAddress,q.walletAddress)||!same(w.destinationAddress,q.destinationAddress))fail('Your linked wallets changed. This bridge remains saved for review.')
     // Only reopen the existing, fixed-amount challenge after simulation; never reprice or resubmit it.
     await d.client('base').call({account:q.walletAddress,to:q.walletAddress,data:q.callData})
    }
    return res.json(state)
   }
   if(existing){if(['completed','failed'].includes(existing.status))return res.json(await reconcile(userId,q,token,req.body));if(existing.metadata?.challengeId)return res.json({ok:true,challengeId:existing.metadata.challengeId});fail('This bridge is already saved. Check its status before retrying.')}
   if(!await d.enabled(userId))fail('X Layer bridging is not available yet.')
   if(q.asset==='USDT'&&!d.usdtEnabled())fail('USDT bridging to X Layer is not available yet.')
   if(q.expiresAt<=d.now())fail('Quote expired. Review a new quote.')
   const w=await d.wallets(userId)
   if(w.walletId!==q.walletId||!same(w.walletAddress,q.walletAddress)||!same(w.destinationAddress,q.destinationAddress))fail('Your linked wallets changed. Review a new quote.')
   const userToken=String(req.body.circleUserToken||'');if(!userToken||userToken.length>8000)fail('Unlock your Base wallet.')
   await verifyNetworks()
   const rpc=d.client('base')
   const balance=await rpc.readContract({address:getAddress(stablecoinAddress('base',q.asset)),abi:balanceAbi,functionName:'balanceOf',args:[q.walletAddress]})
   if(balance<parseUnits(q.total,6))fail('Insufficient '+q.asset+' on Base.')
   await rpc.call({account:q.walletAddress,to:q.walletAddress,data:q.callData})
   if(q.expiresAt<=d.now())fail('Quote expired. Review a new quote.')
   const meta=metadata(q,token)
   const claimed=await d.claim({ownerId:userId,idempotencyKey:key(q),action:ACTION,metadata:meta,dedupe:{metadataKey:'intentFingerprint',metadataValue:meta.intentFingerprint,statuses:['started','submitted']}})
   if(!claimed.claimed)fail('An earlier bridge is still pending. Check Activity first.')
   const result=await d.challenge({userToken,walletId:q.walletId,walletAddress:q.walletAddress,chain:'base',callData:q.callData,idempotencyKey:q.id,refId:key(q)})
   if(!result.challengeId)throw Error('Bridge submission result is unknown.')
   await d.record({ownerId:userId,idempotencyKey:key(q),action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,challengeId:result.challengeId}})
   return res.json({ok:true,challengeId:result.challengeId})
  }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Bridge status is unavailable. Any submitted transfer remains saved; check Activity before retrying.'})}
 }
 return Object.assign(handler,{reconcile:(owner:string,token:string)=>reconcile(owner,openXLayerBridgeQuote(token,owner),token,{})})
}
const handler=createXLayerBridgeHandler()
export const reconcileXLayerBridge=handler.reconcile
export default handler

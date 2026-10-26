import type {Request,Response} from 'express'
import {encodeFunctionData,formatUnits,getAddress,parseAbi} from 'viem'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {estimateCircleNativeSend,createCircleGasStationEvmChallenge,readCircleEvmChallenge,recoverCircleNativeSendChallenge} from '../circle-solana-email.js'
import {readEthUsdcRate,nativeFeeToUsdcUnits} from '../payment-network-fees.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {nativeSendRpc} from './native-send-reconciliation.js'
import {nativeSwapUnits} from './native-swap-quote.js'
import {CASH_CONVERSION_ACTION,CASH_CONVERSION_PREFIX,openCashConversion,quoteCashConversion,sealCashConversion,type CashConversionQuote} from './cash-conversion-quote.js'
import {reconcileCashConversion} from './cash-conversion-reconciliation.js'
import {cashFundingReference,cashDeliveredUnits} from '../../src/pocket/lib/pocketCashFundingReference.js'

const balanceAbi=parseAbi(['function balanceOf(address owner) view returns(uint256)'])
const defaults={multichain:()=>process.env.POCKET_CASH_MULTICHAIN_ENABLED==='true',identity:verifiedPrivyUser,readLink:readCircleLink,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,approval:consumePocketPaymentApproval,estimate:estimateCircleNativeSend,challenge:createCircleGasStationEvmChallenge,challengeStatus:readCircleEvmChallenge,recoverChallenge:recoverCircleNativeSendChallenge,rpc:nativeSendRpc,quote:quoteCashConversion,rate:readEthUsdcRate,now:Date.now,enabled:()=>process.env.POCKET_CASH_CONVERSION_ENABLED==='true'&&Boolean(process.env.PRIVATE_RPC_URL)}
export function cashConversionReview(q:CashConversionQuote){
 const asset=(symbol:'USDT'|'USDC')=>({symbol,...BASE_STABLECOINS[symbol],native:false})
 return {id:q.id,network:q.network,walletAddress:q.walletAddress,tokenIn:asset('USDT'),tokenOut:asset('USDC'),amount:q.amount,expectedOut:formatUnits(BigInt(q.expectedOutUnits)-BigInt(q.feeUnits),6),minimumOut:formatUnits(BigInt(q.minimumOutUnits)-BigInt(q.feeUnits),6),fee:formatUnits(BigInt(q.feeUnits),6),feeAsset:'USDC',feeFromOutput:true,...(q.positiveSlippageFee?{positiveSlippageFee:{capPercent:q.positiveSlippageFee.capPercent}}:{}),expiresAt:q.expiresAt}
}
export function createCashConversionHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId:ownerId}=await d.identity(req)
   if(req.method==='GET'){
    const fundingBridge=typeof req.query?.fundingBridge==='string'?req.query.fundingBridge:undefined
    const pending=(await d.list(ownerId,500,CASH_CONVERSION_ACTION,!fundingBridge)).filter(r=>r.metadata?.quoteToken&&(fundingBridge?r.metadata.fundingBridge===fundingBridge&&!['failed','cancelled','not_submitted'].includes(r.status):['started','submitted'].includes(r.status))).map(r=>({quote:cashConversionReview(openCashConversion(r.metadata!.quoteToken,ownerId,true,d.now())),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,status:r.status}))
    return res.json({ok:true,enabled:d.enabled(),multichainEnabled:d.enabled()&&d.multichain(),pending})
   }
   const action=req.body?.action,token=String(req.body?.quoteToken||'')
   if(!['quote','execute','status','cancel'].includes(action))return res.status(400).json({ok:false,error:'Unsupported cash funding action.'})
   // Rollback stops new quotes/execution, while already submitted funds keep recovery.
   if(!['status','cancel'].includes(action)&&!d.enabled())return res.status(409).json({ok:false,error:'Cash conversion is not available yet.'})
   const q=action==='quote'?null:openCashConversion(token,ownerId,true,d.now())
   if(action==='quote'&&(req.body.network!=='base'||req.body.from!=='USDT'||req.body.to!=='USDC'))return res.status(400).json({ok:false,error:'Choose USDT on Base to add to Cash.'})
   const link=await d.readLink(circleLinkKey(ownerId,'base','payment'))
   if(!link||link.privyUserId!==ownerId||link.chain!=='base'||(link.purpose??'payment')!=='payment'||link.circleBlockchain!=='BASE')return res.status(409).json({ok:false,error:'Reconnect your Base wallet.'})
   const walletId=link.circleWalletId,walletAddress=getAddress(link.circleWalletAddress),userToken=String(req.body.circleUserToken||'')
   if(q&&(q.walletId!==walletId||q.walletAddress.toLowerCase()!==walletAddress.toLowerCase()))return res.status(409).json({ok:false,error:'Your wallet changed. Reopen Cash funding.'})
   const estimate=(callData:CashConversionQuote['callData'])=>d.estimate({chain:'base',userToken,walletId,walletAddress,callData})
   const readBalance=async()=>{
    if(BigInt(await d.rpc<string>('base','eth_chainId',[]))!==8453n)throw Error('Cash funding network mismatch.')
    return BigInt(await d.rpc<string>('base','eth_call',[{to:BASE_STABLECOINS.USDT.address,data:encodeFunctionData({abi:balanceAbi,functionName:'balanceOf',args:[walletAddress]})},'pending']))
   }
   const fundingBridge=action==='quote'?req.body.fundingBridge:q?.fundingBridge
   const verifyFunding=async(units:bigint)=>{
    if(fundingBridge===undefined)return
    if(!d.multichain())throw Object.assign(Error('Cash funding from another network is not available yet.'),{status:409})
    const reference=cashFundingReference(fundingBridge)
    if(!reference)throw Object.assign(Error('Cash funding reference is invalid.'),{status:400})
    const bridge=await d.find(ownerId,reference.key,reference.action)
    const m=bridge?.metadata
    const external=reference.rail==='bsc'||reference.rail==='xlayer'
    const delivered=external?cashDeliveredUnits(m?.cashReceivedAmount):typeof m?.settledAmountUnits==='string'&&/^[1-9]\d*$/.test(m.settledAmountUnits)?BigInt(m.settledAmountUnits):null
    if(bridge?.status!=='completed'||m?.destination!=='base'||m?.destinationAddress?.toLowerCase()!==walletAddress.toLowerCase()||external&&(m?.source!==reference.rail||m?.assetSymbol!=='USDT'||m?.purpose!=='cash')||delivered!==units||!/^0x[0-9a-f]{64}$/i.test(m?.destinationTxHash||''))throw Object.assign(Error('Your top-up delivery is still being verified. Try again shortly.'),{status:409})
   }
   if(action==='quote'){
    const amount=req.body.amount,units=nativeSwapUnits(amount,6)
    await verifyFunding(units)
    if(await readBalance()<units)return res.status(409).json({ok:false,error:'Insufficient USDT for this amount.'})
    const quote=await d.quote({ownerId,walletId,walletAddress,network:'base',from:'USDT',to:'USDC',amount,...(fundingBridge?{fundingBridge}:{})},estimate,await d.rate(),undefined,d.now)
    return res.json({ok:true,quote:cashConversionReview(quote),quoteToken:sealCashConversion(quote),sufficientBalance:true})
   }
   const quote=q!,key=CASH_CONVERSION_PREFIX+quote.id
   let existing=await d.find(ownerId,key,CASH_CONVERSION_ACTION)
   if(existing&&['cancelled','not_submitted'].includes(existing.status)&&!existing.metadata?.txHash)return res.json({ok:true,status:'not_submitted',reason:'cancelled'})
   if(action==='execute'){
    if(existing)return res.json({ok:true,status:existing.status,challengeId:existing.metadata?.challengeId,txHash:existing.metadata?.txHash,amountOut:existing.metadata?.amountOut})
    openCashConversion(token,ownerId,false,d.now())
    await verifyFunding(BigInt(quote.amountUnits))
    if(!await d.approval(String(req.headers['x-pocket-payment-approval']||''),ownerId))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
    if(await readBalance()<BigInt(quote.amountUnits))return res.status(409).json({ok:false,error:'Insufficient USDT for this amount.'})
    if(nativeFeeToUsdcUnits(await estimate(quote.callData),await d.rate())>BigInt(quote.feeUnits)||quote.expiresAt<=d.now())return res.status(409).json({ok:false,error:'Network fees changed. Review the updated amount.'})
    const metadata={...(fundingBridge?{fundingBridge}:{}),quoteToken:token,network:'base',walletAddress,amount:quote.amount,feeAmount:formatUnits(BigInt(quote.feeUnits),6),feeAsset:'USDC',assetSymbol:'USDT',toAsset:'USDC',intentFingerprint:'base:'+walletId}
    const claim=await d.claim({ownerId,idempotencyKey:key,action:CASH_CONVERSION_ACTION,metadata,dedupe:{metadataKey:'intentFingerprint',metadataValue:metadata.intentFingerprint,statuses:['started','submitted']},...(fundingBridge?{dedupeAlso:[{metadataKey:'fundingBridge',metadataValue:fundingBridge,statuses:['started','submitted','completed'] as Array<'started'|'submitted'|'completed'>}]}:{})})
    if(!claim.claimed)return res.status(409).json({ok:false,error:'Your earlier cash conversion is still being checked.'})
    const result=await d.challenge({chain:'base',userToken,walletId,walletAddress,callData:quote.callData,idempotencyKey:quote.id,refId:key})
    if(!result.challengeId)throw Error('Missing cash confirmation.')
    const saved=await d.record({ownerId,idempotencyKey:key,action:CASH_CONVERSION_ACTION,status:'submitted',resourceId:quote.id,metadata:{...metadata,challengeId:result.challengeId}})
    return res.json({ok:true,status:saved.status,challengeId:saved.metadata?.challengeId,txHash:saved.metadata?.txHash})
   }
   if(!existing)return res.json({ok:true,status:'not_submitted'})
   const reconcile=()=>reconcileCashConversion(existing!,{rpc:d.rpc,record:d.record})
   if(['completed','failed'].includes(existing.status)||existing.metadata?.txHash)return res.json({ok:true,...await reconcile()})
   let challengeId=existing.metadata?.challengeId
   if(!challengeId&&userToken){const recovered=await d.recoverChallenge({chain:'base',userToken,walletId,walletAddress,refId:key});if(recovered){existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,challengeId:recovered}});challengeId=existing.metadata?.challengeId}}
   if(['completed','failed'].includes(existing.status)||existing.metadata?.txHash)return res.json({ok:true,...await reconcile()})
   if(!challengeId||!userToken)return res.json({ok:true,status:'pending',challengeId})
   const provider=await d.challengeStatus({chain:'base',userToken,walletId,walletAddress,challengeId})
   if(!provider.txHash&&((action==='cancel'&&provider.status==='awaiting_approval')||('notSubmitted' in provider&&provider.notSubmitted===true))){const saved=await d.record({...existing,status:action==='cancel'?'cancelled':'not_submitted',metadata:{...existing.metadata!,approvalOutcome:action==='cancel'?'cancelled':'expired'}});return res.json({ok:true,status:saved.metadata?.txHash?'pending':['cancelled','not_submitted'].includes(saved.status)?'not_submitted':saved.status,txHash:saved.metadata?.txHash,reason:action==='cancel'?'cancelled':'approval_expired'})}
   if(provider.status==='failed'){const saved=await d.record({...existing,status:'failed'});return res.json({ok:true,status:saved.status,txHash:saved.metadata?.txHash})}
   if(!provider.txHash)return res.json({ok:true,status:provider.status==='awaiting_approval'?'awaiting_approval':'pending',challengeId})
   if(!/^0x[0-9a-f]{64}$/i.test(provider.txHash))throw Error('Invalid cash conversion reference.')
   existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,txHash:provider.txHash}})
   return res.json({ok:true,...await reconcile(),challengeId})
  }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Could not verify this cash conversion yet. Try again shortly.'})}
 }
}
export default createCashConversionHandler()

import type {Request,Response} from 'express'
import {nativeEvmExecutionEnabled} from './native-evm-gas-policy.js'
import {encodeFunctionData,formatUnits,getAddress,parseAbi,type Hex} from 'viem'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {estimateCircleNativeSend,createCircleGasStationEvmChallenge,readCircleEvmChallenge,recoverCircleNativeSendChallenge} from '../circle-solana-email.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {nativeEvmNetworks,bufferedNativeFee,type NativeEvmNetwork} from './native-send-quote.js'
import {nativeSendRpc} from './native-send-reconciliation.js'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {openNativeEvmSwap,quoteNativeEvmSwap,sealNativeEvmSwap,type NativeEvmSwapQuote} from './native-evm-swap-quote.js'
import {reconcileNativeEvmSwap} from './native-evm-swap-reconciliation.js'
const actionName='wallet.native-swap',balanceAbi=parseAbi(['function balanceOf(address owner) view returns(uint256)'])
const defaults={identity:verifiedPrivyUser,readLink:readCircleLink,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,approval:consumePocketPaymentApproval,estimate:estimateCircleNativeSend,challenge:createCircleGasStationEvmChallenge,challengeStatus:readCircleEvmChallenge,recoverChallenge:recoverCircleNativeSendChallenge,rpc:nativeSendRpc,quote:quoteNativeEvmSwap,now:Date.now,enabled:(network?:NativeEvmNetwork)=>nativeEvmExecutionEnabled(process.env.POCKET_NATIVE_EVM_SWAP_ENABLED)&&(!network||Boolean(({ethereum:process.env.PRIVATE_RPC_URL_ETHEREUM,base:process.env.PRIVATE_RPC_URL,arbitrum:process.env.PRIVATE_RPC_URL_ARB,polygon:process.env.PRIVATE_RPC_URL_POLYGON})[network]))}
export function nativeSwapReview(q:NativeEvmSwapQuote){
 const {tokenIn,tokenOut}=nativeSwapPair(q.network,q.from,q.to),deduct=tokenOut.native?BigInt(q.feeUnits):0n
 return {id:q.id,network:q.network,walletAddress:q.walletAddress,tokenIn,tokenOut,amount:q.amount,expectedOut:formatUnits(BigInt(q.expectedOutUnits)-deduct,tokenOut.decimals),minimumOut:formatUnits(BigInt(q.minimumOutUnits)-deduct,tokenOut.decimals),fee:formatUnits(BigInt(q.feeUnits),18),feeAsset:nativeEvmNetworks[q.network].symbol,feeFromOutput:tokenOut.native,positiveSlippageFee:q.positiveSlippageFee,expiresAt:q.expiresAt}
}
export function createNativeEvmSwapHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId:ownerId}=await d.identity(req)
   if(req.method==='GET'){
    const pending=(await d.list(ownerId,500,actionName,true)).filter(r=>r.metadata?.network!=='solana'&&['started','submitted'].includes(r.status)&&r.metadata?.quoteToken).map(r=>({quote:nativeSwapReview(openNativeEvmSwap(r.metadata!.quoteToken,ownerId,true,d.now())),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,status:r.status}))
    const requested=req.query?.network
    if(requested!==undefined&&(typeof requested!=='string'||!Object.hasOwn(nativeEvmNetworks,requested)))return res.status(400).json({ok:false,error:'Choose a supported swap network.'})
    return res.json({ok:true,enabled:d.enabled(requested as NativeEvmNetwork|undefined),pending})
   }
   const action=req.body?.action,token=String(req.body?.quoteToken||'')
   if(!['quote','execute','status'].includes(action))return res.status(400).json({ok:false,error:'Unsupported swap action.'})
   if(action!=='status'&&!d.enabled())return res.status(409).json({ok:false,error:'Native swaps are not available yet.'})
   const q=action==='quote'?null:openNativeEvmSwap(token,ownerId,true,d.now()),network=(q?.network||req.body.network) as NativeEvmNetwork
   if(!Object.hasOwn(nativeEvmNetworks,network))return res.status(400).json({ok:false,error:'Choose a supported swap network.'})
   if(action!=='status'&&!d.enabled(network))return res.status(409).json({ok:false,error:'Swaps on this network are not available yet.'})
   const link=await d.readLink(circleLinkKey(ownerId,network,'payment'))
   if(!link||link.privyUserId!==ownerId||link.chain!==network||(link.purpose??'payment')!=='payment'||link.circleBlockchain!==nativeEvmNetworks[network].blockchain)return res.status(409).json({ok:false,error:'Reconnect your wallet on this network.'})
   const walletId=link.circleWalletId,walletAddress=getAddress(link.circleWalletAddress),userToken=String(req.body.circleUserToken||'')
   if(q&&(q.walletId!==walletId||q.walletAddress.toLowerCase()!==walletAddress.toLowerCase()))return res.status(409).json({ok:false,error:'Your wallet changed. Reopen this swap.'})
   const estimate=(callData:Hex)=>d.estimate({chain:network,userToken,walletId,walletAddress,callData})
   const preflight=async(quote:NativeEvmSwapQuote)=>{
    if(Number(BigInt(await d.rpc<string>(network,'eth_chainId',[])))!==nativeEvmNetworks[network].id)throw Error('Swap network mismatch.')
    const {tokenIn}=nativeSwapPair(network,quote.from,quote.to)
    if(tokenIn.native)return BigInt(await d.rpc<string>(network,'eth_getBalance',[walletAddress,'pending']))>=BigInt(quote.amountUnits)+BigInt(quote.feeUnits)
    const balance=await d.rpc<string>(network,'eth_call',[{to:tokenIn.address,data:encodeFunctionData({abi:balanceAbi,functionName:'balanceOf',args:[walletAddress]})},'pending'])
    // The native output covers reimbursement after the swap in the same atomic batch.
    return BigInt(balance)>=BigInt(quote.amountUnits)
   }
   if(action==='quote'){
    const quote=await d.quote({ownerId,walletId,walletAddress,network,from:req.body.from,to:req.body.to,amount:req.body.amount},estimate,undefined,d.now)
    return res.json({ok:true,quote:nativeSwapReview(quote),quoteToken:sealNativeEvmSwap(quote),sufficientBalance:await preflight(quote)})
   }
   const quote=q!,key='pocket:native-swap:'+quote.id
   let existing=await d.find(ownerId,key,actionName)
   if(action==='execute'){
    if(existing)return res.json({ok:true,status:existing.status,challengeId:existing.metadata?.challengeId,txHash:existing.metadata?.txHash,amountOut:existing.metadata?.amountOut})
    openNativeEvmSwap(token,ownerId,false,d.now())
    if(!await d.approval(String(req.headers['x-pocket-payment-approval']||''),ownerId))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
    if(!await preflight(quote))return res.status(409).json({ok:false,error:'Insufficient balance for this swap and fee.'})
    if(bufferedNativeFee(await estimate(quote.callData))>BigInt(quote.feeUnits)||quote.expiresAt<=d.now())return res.status(409).json({ok:false,error:'Network fees changed. Review the updated estimate.'})
    const metadata={quoteToken:token,network,walletAddress,amount:quote.amount,assetSymbol:quote.from,toAsset:quote.to,intentFingerprint:network+':'+walletId}
    const claim=await d.claim({ownerId,idempotencyKey:key,action:actionName,metadata,dedupe:{metadataKey:'intentFingerprint',metadataValue:metadata.intentFingerprint,statuses:['started','submitted']}})
    if(!claim.claimed)return res.status(409).json({ok:false,error:'A swap from this wallet is still being checked.'})
    const result=await d.challenge({chain:network,userToken,walletId,walletAddress,callData:quote.callData,idempotencyKey:quote.id,refId:key})
    if(!result.challengeId)throw Error('Missing swap confirmation.')
    const saved=await d.record({ownerId,idempotencyKey:key,action:actionName,status:'submitted',resourceId:quote.id,metadata:{...metadata,challengeId:result.challengeId}})
    return res.json({ok:true,status:saved.status,challengeId:saved.metadata?.challengeId,txHash:saved.metadata?.txHash})
   }
   if(!existing)return res.json({ok:true,status:'not_submitted'})
   if(['completed','failed'].includes(existing.status)||existing.metadata?.txHash)return res.json({ok:true,...await reconcileNativeEvmSwap(existing,{rpc:d.rpc,record:d.record})})
   let challengeId=existing.metadata?.challengeId
   if(!challengeId&&userToken){const recovered=await d.recoverChallenge({chain:network,userToken,walletId,walletAddress,refId:key});if(recovered){existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,challengeId:recovered}});challengeId=existing.metadata?.challengeId}}
   if(['completed','failed'].includes(existing.status)||existing.metadata?.txHash)return res.json({ok:true,...await reconcileNativeEvmSwap(existing,{rpc:d.rpc,record:d.record})})
   if(!challengeId||!userToken)return res.json({ok:true,status:'pending',challengeId})
   const provider=await d.challengeStatus({chain:network,userToken,walletId,walletAddress,challengeId})
   if(provider.status==='failed'){const saved=await d.record({...existing,status:'failed'});return res.json({ok:true,status:saved.status,txHash:saved.metadata?.txHash})}
   if(!provider.txHash)return res.json({ok:true,status:provider.status==='awaiting_approval'?'awaiting_approval':'pending',challengeId})
   if(!/^0x[0-9a-f]{64}$/i.test(provider.txHash))throw Error('Invalid swap reference.')
   existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,txHash:provider.txHash}})
   return res.json({ok:true,...await reconcileNativeEvmSwap(existing,{rpc:d.rpc,record:d.record}),challengeId})
  }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Could not verify this swap yet. Try again shortly.'})}
 }
}
export default createNativeEvmSwapHandler()

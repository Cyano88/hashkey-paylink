import type {Request,Response} from 'express'
import {nativeEvmExecutionEnabled} from './native-evm-gas-policy.js'
import {getAddress,isAddress,type Hex} from 'viem'
import {circleLinkKey,readCircleLink,verifiedPrivyUser} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {recoverCircleNativeSendChallenge,estimateCircleNativeSend,createCircleGasStationEvmChallenge,readCircleEvmChallenge} from '../circle-solana-email.js'
import {bufferedNativeFee,nativeEvmNetworks,openNativeSend,quoteNativeSend,sealNativeSend,type NativeEvmNetwork} from './native-send-quote.js'

import {nativeSendRpc,reconcileNativeSend} from './native-send-reconciliation.js'
export {nativeSendRpc} from './native-send-reconciliation.js'
const defaults={identity:verifiedPrivyUser,readLink:readCircleLink,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,approval:consumePocketPaymentApproval,estimate:estimateCircleNativeSend,challenge:createCircleGasStationEvmChallenge,challengeStatus:readCircleEvmChallenge,recoverChallenge:recoverCircleNativeSendChallenge,rpc:nativeSendRpc,now:Date.now,enabled:()=>nativeEvmExecutionEnabled(process.env.POCKET_NATIVE_SEND_ENABLED)}
const actionName='wallet.native-send'
export function createNativeSendHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  const identity=await d.identity(req)
  if(req.method==='GET'){
   const pending=(await d.list(identity.userId,500,actionName,true)).filter(a=>a.metadata?.network!=='solana'&&['started','submitted'].includes(a.status)&&a.metadata?.quoteToken).map(a=>({quote:openNativeSend(a.metadata!.quoteToken,identity.userId,true,d.now()),quoteToken:a.metadata!.quoteToken,challengeId:a.metadata?.challengeId,status:a.status}))
   return res.json({ok:true,enabled:d.enabled(),pending})
  }
  const action=req.body?.action
  if(!['quote','execute','status'].includes(action))return res.status(400).json({ok:false,error:'Unsupported transfer action.'})
  if(action!=='status'&&!d.enabled())return res.status(409).json({ok:false,error:'Native transfers are not available yet.'})
  const ownerId=identity.userId,token=String(req.body?.quoteToken||'')
  const q=action==='quote'?null:openNativeSend(token,ownerId,true,d.now())
  const network=(q?.network||req.body?.network) as NativeEvmNetwork
  if(!Object.hasOwn(nativeEvmNetworks,network))return res.status(400).json({ok:false,error:'Choose a supported network.'})
  const link=await d.readLink(circleLinkKey(ownerId,network,'payment'))
  if(!link||link.privyUserId!==ownerId||link.chain!==network||(link.purpose??'payment')!=='payment'||link.circleBlockchain!==nativeEvmNetworks[network].blockchain)return res.status(409).json({ok:false,error:'Reconnect your wallet on this network.'})
  const walletAddress=getAddress(link.circleWalletAddress),walletId=link.circleWalletId,userToken=String(req.body?.circleUserToken||'')
  if(q&&(q.walletId!==walletId||q.walletAddress.toLowerCase()!==walletAddress.toLowerCase()))return res.status(409).json({ok:false,error:'Your wallet changed. Reopen this transfer.'})
  const verifyNetwork=async()=>{if(Number(BigInt(await d.rpc<string>(network,'eth_chainId',[])))!==nativeEvmNetworks[network].id)throw Error('Transaction network mismatch.')}
  const estimate=(callData:Hex)=>d.estimate({chain:network,userToken,walletId,walletAddress,callData})
  if(action==='quote'){
   await verifyNetwork()
   if(!isAddress(String(req.body?.recipient||'')))return res.status(400).json({ok:false,error:'Enter a valid wallet address.'})
   const quote=await quoteNativeSend({ownerId,network,walletId,walletAddress,recipient:getAddress(String(req.body?.recipient||'')),amount:String(req.body?.amount||'')},estimate,d.now())
   const balance=BigInt(await d.rpc<string>(network,'eth_getBalance',[walletAddress,'pending']))
   return res.json({ok:true,quote,quoteToken:sealNativeSend(quote),sufficientBalance:balance>=BigInt(quote.totalUnits)})
  }
  const quote=q!,key='pocket:native-send:'+quote.id
  let existing=await d.find(ownerId,key,actionName)
  if(action==='execute'){
   if(existing)return res.json({ok:true,status:existing.status,challengeId:existing.metadata?.challengeId,transferId:quote.id})
   openNativeSend(token,ownerId,false,d.now())
   if(!await d.approval(String(req.headers['x-pocket-payment-approval']||''),ownerId))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
   await verifyNetwork()
   const balance=BigInt(await d.rpc<string>(network,'eth_getBalance',[walletAddress,'pending']))
   if(balance<BigInt(quote.totalUnits))return res.status(409).json({ok:false,error:'Insufficient '+quote.asset+' to cover the amount and fee.'})
   if(bufferedNativeFee(await estimate(quote.callData))>BigInt(quote.feeUnits)||quote.expiresAt<=d.now())return res.status(409).json({ok:false,error:'Network fees changed. Review the updated estimate.'})
   const metadata={quoteToken:token,network,walletAddress,recipient:quote.recipient,amount:quote.amount,assetSymbol:quote.asset,intentFingerprint:network+':'+walletId}
   const claim=await d.claim({ownerId,idempotencyKey:key,action:actionName,metadata,dedupe:{metadataKey:'intentFingerprint',metadataValue:metadata.intentFingerprint,statuses:['started','submitted']}})
   if(!claim.claimed)return res.status(409).json({ok:false,error:'A transfer from this wallet is still being checked.'})
   // Persist before any provider write. An ambiguous provider response never releases this claim.
   const result=await d.challenge({chain:network,userToken,walletId,walletAddress,callData:quote.callData,idempotencyKey:quote.id,refId:key})
   if(!result.challengeId)throw Error('Wallet confirmation unavailable.')
   await d.record({ownerId,idempotencyKey:key,action:actionName,status:'submitted',resourceId:quote.id,metadata:{...metadata,challengeId:result.challengeId}})
   return res.json({ok:true,challengeId:result.challengeId,transferId:quote.id})
  }
  if(!existing)return res.json({ok:true,status:'not_submitted'})
  if(['completed','failed'].includes(existing.status))return res.json({ok:true,status:existing.status,txHash:existing.metadata?.txHash})
  if(existing.metadata?.txHash)return res.json({ok:true,...await reconcileNativeSend(existing,{rpc:d.rpc,record:d.record})})
  let challengeId=existing.metadata?.challengeId
  if(!challengeId&&userToken){
   const recovered=await d.recoverChallenge({chain:network,userToken,walletId,walletAddress,refId:key})
   if(recovered){
    existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,challengeId:recovered}})
    if(['completed','failed'].includes(existing.status))return res.json({ok:true,status:existing.status,txHash:existing.metadata?.txHash})
    challengeId=existing.metadata?.challengeId
   }
  }
  if(!challengeId||!userToken)return res.json({ok:true,status:'pending',challengeId})
  const provider=await d.challengeStatus({chain:network,userToken,walletId,walletAddress,challengeId})
  if(provider.status==='failed'){
   const saved=await d.record({...existing,status:'failed'});return res.json({ok:true,status:saved.status,txHash:saved.metadata?.txHash})
  }
  if(!provider.txHash)return res.json({ok:true,status:provider.status==='awaiting_approval'?'awaiting_approval':'pending',challengeId})
  const hash=provider.txHash
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid transaction reference.')
  existing=await d.record({...existing,status:'submitted',metadata:{...existing.metadata!,txHash:hash}})
  return res.json({ok:true,...await reconcileNativeSend(existing,{rpc:d.rpc,record:d.record}),challengeId})
 }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Could not verify this transfer yet. Try again shortly.'})}
 }
}
export default createNativeSendHandler()

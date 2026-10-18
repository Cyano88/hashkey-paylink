import type {Request,Response} from 'express'
import {Connection} from '@solana/web3.js'
import bs58 from 'bs58'
import {getRpc} from '../relay-solana.js'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {createCircleNativeSolanaChallenge} from '../circle-solana-email.js'
import {quoteNativeSolanaSwap,openSolSwap,sealSolSwap,solSwapReview,solSwapIntent,SOL_SWAP_POLICY} from './native-solana-swap-quote.js'
import {verifiedNativeSolanaSwapPreflight} from './native-solana-swap-verified-preflight.js'
import {verifyNativeSolanaSwapSignature} from './native-solana-swap-preflight.js'
import {reconcileNativeSolanaSwap} from './native-solana-swap-reconciliation.js'
const actionName='wallet.native-swap'
const defaults={identity:verifiedPrivyUser,readLink:readCircleLink,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,approval:consumePocketPaymentApproval,challenge:createCircleNativeSolanaChallenge,rpc:()=>new Connection(getRpc(),'confirmed'),quote:quoteNativeSolanaSwap,preflight:verifiedNativeSolanaSwapPreflight,enabled:()=>process.env.POCKET_NATIVE_SOL_SWAP_ENABLED==='true',now:Date.now}
export function createNativeSolanaSwapHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId:ownerId}=await d.identity(req)
   if(req.method==='GET'){const pending=(await d.list(ownerId,500,actionName,true)).filter(r=>r.metadata?.network==='solana'&&['started','submitted'].includes(r.status)&&r.metadata.quoteToken).map(r=>({quote:solSwapReview(openSolSwap(r.metadata!.quoteToken,ownerId,true,d.now())),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId}));return res.json({ok:true,enabled:d.enabled(),pending})}
   const action=req.body?.action
   if(!['quote','execute','submit','status'].includes(action))return res.status(400).json({ok:false,error:'Unsupported swap action.'})
   if(action==='quote'&&req.body.network!=='solana')return res.status(400).json({ok:false,error:'Select the Solana network.'})
   if(['quote','execute'].includes(action)&&!d.enabled())return res.status(409).json({ok:false,error:'Solana swaps are not available yet.'})
   const link=await d.readLink(circleLinkKey(ownerId,'solana','payment'))
   if(!link||link.privyUserId!==ownerId||link.chain!=='solana'||(link.purpose??'payment')!=='payment'||link.circleBlockchain!=='SOL')return res.status(409).json({ok:false,error:'Reconnect your Solana wallet.'})
   const rpc=d.rpc();if(await rpc.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong Solana network.')
   if(action==='quote'){const q=await d.quote({ownerId,walletId:link.circleWalletId,walletAddress:link.circleWalletAddress,from:req.body.from,to:req.body.to,amount:req.body.amount},rpc);return res.json({ok:true,quote:solSwapReview(q),quoteToken:sealSolSwap(q),sufficientBalance:true})}
   const token=String(req.body.quoteToken||''),q=openSolSwap(token,ownerId,true,d.now()),key='pocket:native-swap:'+q.id
   if(q.walletId!==link.circleWalletId||q.walletAddress!==link.circleWalletAddress)return res.status(409).json({ok:false,error:'Your Solana wallet changed. Reopen this swap.'})
   const existing=await d.find(ownerId,key,actionName)
   if(action==='execute'){
    if(existing)return res.json({ok:true,status:existing.status,challengeId:existing.metadata?.challengeId,txHash:existing.metadata?.txHash,amountOut:existing.metadata?.amountOut})
    openSolSwap(token,ownerId,false,d.now())
    if(!await d.approval(String(req.headers['x-pocket-payment-approval']||''),ownerId))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
    if(await rpc.getBlockHeight('confirmed')>q.lastValidBlockHeight)return res.status(409).json({ok:false,error:'Swap estimate expired. Review a new amount.'})
    const proof=await d.preflight(solSwapIntent(q),q.instructions,q.lookupAddresses,SOL_SWAP_POLICY,rpc,q)
    if(proof.transaction!==q.transaction||proof.networkFeeLamports!==q.feeUnits||proof.effects.newAccountRentLamports!==q.rentUnits||q.expiresAt<=d.now())return res.status(409).json({ok:false,error:'Swap costs changed. Review a new estimate.'})
    const metadata={network:'solana',quoteToken:token,walletAddress:q.walletAddress,amount:q.amount,assetSymbol:q.from,toAsset:q.to,intentFingerprint:'solana:'+q.walletId}
    const claim=await d.claim({ownerId,idempotencyKey:key,action:actionName,metadata,dedupe:{metadataKey:'intentFingerprint',metadataValue:metadata.intentFingerprint,statuses:['started','submitted']}})
    if(!claim.claimed)return res.status(409).json({ok:false,error:'A swap from this wallet is still being checked.'})
    const challenge=await d.challenge({walletId:q.walletId,walletAddress:q.walletAddress,userToken:String(req.body.circleUserToken||''),rawTransaction:q.transaction,purpose:'swap'})
    if(!challenge.challengeId)throw Error('Missing swap approval.')
    await d.record({ownerId,idempotencyKey:key,action:actionName,status:'submitted',resourceId:q.id,metadata:{...metadata,challengeId:challenge.challengeId}})
    return res.json({ok:true,challengeId:challenge.challengeId})
   }
   if(!existing)return res.json({ok:true,status:'not_submitted'})
   if(['completed','failed'].includes(existing.status))return res.json({ok:true,status:existing.status,txHash:existing.metadata?.txHash,amountOut:existing.metadata?.amountOut})
   if(action==='submit'){
    if(!existing.metadata?.challengeId)throw Error('Swap approval is not ready.')
    const raw=String(req.body.signedTransaction||''),signed=verifyNativeSolanaSwapSignature(q.transaction,raw,q.walletAddress),hash=bs58.encode(signed.signatures[0])
    if(existing.metadata.txHash&&existing.metadata.txHash!==hash)throw Error('Swap signature changed.')
    const saved=await d.record({...existing,status:'submitted',metadata:{...existing.metadata,signedTransaction:raw,txHash:hash}})
    if(['completed','failed'].includes(saved.status))return res.json({ok:true,status:saved.status,txHash:saved.metadata?.txHash,amountOut:saved.metadata?.amountOut})
    if(await rpc.getBlockHeight('confirmed')<=q.lastValidBlockHeight)await rpc.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,maxRetries:3})
    return res.json({ok:true,...await reconcileNativeSolanaSwap(saved,{rpc:()=>rpc,record:d.record})})
   }
   return res.json({ok:true,...await reconcileNativeSolanaSwap(existing,{rpc:()=>rpc,record:d.record})})
  }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Could not verify this Solana swap. Try again shortly.'})}
 }
}
export default createNativeSolanaSwapHandler()

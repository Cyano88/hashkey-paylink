import {formatUnits} from 'viem'
import {reconcileNativeSend} from './native-send-reconciliation.js'
import type {Request,Response} from 'express'
import {Connection,PublicKey,Transaction} from '@solana/web3.js'
import {getRpc} from '../relay-solana.js'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {createCircleNativeSolanaChallenge} from '../circle-solana-email.js'
import {quoteNativeSolana,sealNativeSolana,openNativeSolana,validateNativeSolanaTransaction} from './native-solana-send-quote.js'
const actionName='wallet.native-send',genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
const defaults={identity:verifiedPrivyUser,readLink:readCircleLink,claim:claimCirclePocketAction,find:findCirclePocketAction,list:listCirclePocketActions,record:recordCirclePocketAction,approval:consumePocketPaymentApproval,challenge:createCircleNativeSolanaChallenge,rpc:()=>new Connection(getRpc(),'confirmed'),enabled:()=>process.env.POCKET_NATIVE_SOL_SEND_ENABLED==='true',now:Date.now}
export function createNativeSolanaSendHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 try{
  if(!['POST','GET'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  const {userId:ownerId}=await d.identity(req)
  if(req.method==='GET'){
   const pending=(await d.list(ownerId,500,actionName,true)).filter(r=>r.metadata?.network==='solana'&&['started','submitted'].includes(r.status)&&r.metadata.quoteToken).map(r=>({quote:openNativeSolana(r.metadata!.quoteToken,ownerId,true),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,status:r.status}))
   return res.json({ok:true,enabled:d.enabled(),pending})
  }
  const action=req.body?.action
  if(!['quote','execute','submit','status','cancel'].includes(action))return res.status(400).json({ok:false,error:'Unsupported transfer action.'})
  if(['quote','execute'].includes(action)&&!d.enabled())return res.status(409).json({ok:false,error:'SOL transfers are not available yet.'})
  const link=await d.readLink(circleLinkKey(ownerId,'solana','payment'))
  if(!link||link.privyUserId!==ownerId||link.chain!=='solana'||(link.purpose??'payment')!=='payment'||link.circleBlockchain!=='SOL')return res.status(409).json({ok:false,error:'Reconnect your Solana wallet.'})
  const rpc=d.rpc();if(await rpc.getGenesisHash()!==genesis)throw Error('Wrong Solana network.')
  if(action==='quote'){
   try{new PublicKey(String(req.body.recipient||''))}catch{return res.status(400).json({ok:false,error:'Enter a valid Solana address.'})}
   const quote=await quoteNativeSolana({ownerId,walletId:link.circleWalletId,walletAddress:link.circleWalletAddress,recipient:String(req.body.recipient||''),amount:String(req.body.amount||'')},rpc,d.now())
   const balance=await rpc.getBalance(new PublicKey(link.circleWalletAddress),'confirmed');return res.json({ok:true,quote,quoteToken:sealNativeSolana(quote),sufficientBalance:BigInt(balance)>=BigInt(quote.totalUnits)})
  }
  const token=String(req.body.quoteToken||''),q=openNativeSolana(token,ownerId,true,d.now()),key='pocket:native-send:'+q.id
  if(q.walletId!==link.circleWalletId||q.walletAddress!==link.circleWalletAddress)return res.status(409).json({ok:false,error:'Your Solana wallet changed. Reopen this transfer.'})
  const existing=await d.find(ownerId,key,actionName)
  if(action==='cancel'){if(!existing)return res.json({ok:true,status:'not_submitted'});const saved=await d.record({...existing,status:'cancelled'});return res.json({ok:true,status:['cancelled','not_submitted'].includes(saved.status)?'not_submitted':saved.status,txHash:saved.metadata?.txHash})}
  if(existing&&['cancelled','not_submitted'].includes(existing.status))return res.json({ok:true,status:'not_submitted'})
  if(action==='execute'){
   if(existing)return res.json({ok:true,status:existing.status,challengeId:existing.metadata?.challengeId})
   openNativeSolana(token,ownerId,false,d.now())
   if(!await d.approval(String(req.headers['x-pocket-payment-approval']||''),ownerId))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
   if(BigInt(await rpc.getBalance(new PublicKey(q.walletAddress),'confirmed'))<BigInt(q.totalUnits))return res.status(409).json({ok:false,error:'Insufficient SOL to cover the amount and fee.'})
   const tx=Transaction.from(Buffer.from(q.transaction,'base64')),fee=(await rpc.getFeeForMessage(tx.compileMessage(),'confirmed')).value
   if(fee===null||String(fee)!==q.feeUnits||q.expiresAt<=d.now()||await rpc.getBlockHeight('confirmed')>q.lastValidBlockHeight)return res.status(409).json({ok:false,error:'Network fees changed. Review a new estimate.'})
   const metadata={network:'solana',quoteToken:token,walletAddress:q.walletAddress,recipient:q.recipient,amount:q.amount,feeAmount:formatUnits(BigInt(q.feeUnits),9),assetSymbol:'SOL',intentFingerprint:'solana:'+q.walletId}
   const claim=await d.claim({ownerId,idempotencyKey:key,action:actionName,metadata,dedupe:{metadataKey:'intentFingerprint',metadataValue:metadata.intentFingerprint,statuses:['started','submitted']}})
   if(!claim.claimed)return res.status(409).json({ok:false,error:'A transfer from this wallet is still being checked.'})
   const challenge=await d.challenge({walletId:q.walletId,walletAddress:q.walletAddress,userToken:String(req.body.circleUserToken||''),rawTransaction:q.transaction})
   if(!challenge.challengeId)throw Error('Missing signing challenge.')
   await d.record({ownerId,idempotencyKey:key,action:actionName,status:'submitted',resourceId:q.id,metadata:{...metadata,challengeId:challenge.challengeId}})
   return res.json({ok:true,challengeId:challenge.challengeId})
  }
  if(!existing)return res.json({ok:true,status:'not_submitted'})
  if(['completed','failed'].includes(existing.status))return res.json({ok:true,status:existing.status,txHash:existing.metadata?.txHash})
  if(action==='submit'){
   if(!existing.metadata?.challengeId)throw Error('Transfer approval is not ready.')
   const raw=String(req.body.signedTransaction||''),{signature}=validateNativeSolanaTransaction(q,raw,true)
   if(!signature)throw Error('Missing signature.')
   if(existing.metadata?.txHash&&existing.metadata.txHash!==signature)throw Error('Transfer signature changed.')
   // Signed bytes and signature survive a timeout/crash before any broadcast.
   const saved=await d.record({...existing,status:'submitted',metadata:{...existing.metadata,signedTransaction:raw,txHash:signature,submissionClaim:'true'}})
   if(['cancelled','not_submitted'].includes(saved.status))return res.json({ok:true,status:'not_submitted'});
   if(saved.status==='failed'||saved.status==='completed')return res.json({ok:true,status:saved.status,txHash:saved.metadata?.txHash})
   await rpc.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,maxRetries:3})
   return res.json({ok:true,status:'pending',txHash:signature})
  }
  return res.json({ok:true,...await reconcileNativeSend(existing,{solana:()=>rpc,record:d.record})})
 }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Could not verify this transfer yet. Try again shortly.'})}
 }
}
export default createNativeSolanaSendHandler()

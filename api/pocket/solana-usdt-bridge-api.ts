import type {Request,Response} from 'express'
import {Connection,PublicKey} from '@solana/web3.js'
import {formatUnits,parseUnits} from 'viem'
import {getRpc,loadRelayer} from '../relay-solana.js'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {readDurableJson,queryDurablePostgres,hasRenderDurableStore} from '../render-durable-store.js'
import {relayUsdtRequest} from './usdt-relay-provider.js'
import {prepareSolanaUsdtRelayTransaction} from './solana-usdt-relay-transaction.js'
import {createSolanaUsdtBridgeState,type SolanaUsdtBridgeRecord} from './solana-usdt-bridge-state.js'
import {reconcileSolanaUsdtSettlement} from './solana-usdt-bridge-settlement.js'
import {recordCirclePocketAction} from '../circle-pocket-action-journal.js'

export const solanaUsdtBridgeEnabled=()=>process.env.POCKET_SOLANA_USDT_BRIDGE_ENABLED==='true'
export function solanaUsdtBridgePreview(r:SolanaUsdtBridgeRecord){const q=r.quote;return {
 quote:{id:r.id,source:'solana',destination:q.destination,walletAddress:r.walletAddress,destinationAddress:r.destinationAddress,amount:formatUnits(BigInt(q.amountUnits),6),receive:formatUnits(BigInt(q.receiveUnits),6),minimumReceive:formatUnits(BigInt(q.minimumUnits),6),fee:formatUnits(BigInt(q.providerFeeUnits)+BigInt(q.networkFeeUnits),6),total:formatUnits(BigInt(q.totalUnits),6),networkFeeUnits:q.networkFeeUnits,expiresAt:q.expiresAt},
 quoteToken:'solana:'+r.id,challengeId:r.challengeId,txHash:r.signature,sourceConfirmed:r.phase==='source_confirmed',awaitingApproval:r.phase==='awaiting_approval',
}}
export async function listPendingSolanaUsdtBridges(ownerId:string){
 if(!hasRenderDurableStore())return []
 await readDurableJson('hashpaylink:solana-usdt-bridge:schema-check')
 const rows=await queryDurablePostgres<{value:SolanaUsdtBridgeRecord}>("select value from render_durable_kv where store_key like 'hashpaylink:solana-usdt-bridge:v1:%' and value->>'ownerId'=$1 and value->>'phase' in ('authorizing','awaiting_approval','signed','submitted','source_confirmed') order by updated_at desc limit 20",[ownerId])
 return rows.rows.map(row=>solanaUsdtBridgePreview(row.value))
}
async function journal(r:SolanaUsdtBridgeRecord){
 if(!r.signedTransaction)return
 await recordCirclePocketAction({ownerId:r.ownerId,idempotencyKey:'pocket:solana-usdt-bridge:'+r.id,action:'wallet.usdt-bridge',status:r.phase==='completed'?'completed':['source_failed','refunded'].includes(r.phase)?'failed':'submitted',resourceId:r.id,metadata:{quoteToken:'solana:'+r.id,provider:'relay',assetSymbol:'USDT',source:'solana',destination:r.quote.destination,amount:formatUnits(BigInt(r.quote.amountUnits),6),txHash:r.signature||'',...(r.settlement?{destinationTxHash:r.settlement.transactionHash,...(r.phase==='refunded'?{paymentState:'refunded',refundTxHash:r.settlement.transactionHash,refundAmount:formatUnits(BigInt(r.settlement.amountUnits),6),refundNetwork:r.settlement.network}:{})}:{})}})
}
const defaultDependencies={verifyUser:verifiedPrivyUser,state:createSolanaUsdtBridgeState,readLink:readCircleLink,enabled:solanaUsdtBridgeEnabled,reconcile:reconcileSolanaUsdtSettlement,journal,rpc:()=>new Connection(getRpc(),'confirmed')}
export async function recoverSolanaUsdtBridge(ownerId:string,id:string,deps=defaultDependencies){
 const state=deps.state();let current=await state.read(ownerId,id)
 if(!current.signedTransaction&&['quoted','authorizing','awaiting_approval'].includes(current.phase)&&current.quote.expiresAt<=Date.now())current=await state.expireUnsigned(ownerId,id,await deps.rpc().getBlockHeight('confirmed'))
 // An expired unsigned approval never became a transfer. Do not report it as
 // a failed payment when a client recovers an old draft on page entry.
 if(current.phase==='source_failed'&&!current.signedTransaction&&!current.signature)return {ok:true,status:'not_submitted',reason:'approval_expired'}
 if(current.signedTransaction){await deps.journal(current);current=await state.submit(ownerId,id,deps.rpc())}
 if(['source_confirmed','completed','refunded'].includes(current.phase)){
  const result=await deps.reconcile(ownerId,id)
  await deps.journal(await state.read(ownerId,id))
  return {ok:true,...result,txHash:current.signature,sourceConfirmed:true,destinationTxHash:'settlement' in result?result.settlement?.transactionHash:undefined}
 }
 await deps.journal(current)
 return {ok:true,status:current.phase==='source_failed'?'failed':current.phase==='quoted'?'not_submitted':current.phase==='awaiting_approval'?'awaiting_approval':'pending',txHash:current.signature,challengeId:current.challengeId}
}
export function createSolanaUsdtBridgeHandler(overrides:Partial<typeof defaultDependencies>={}){
 const deps={...defaultDependencies,...overrides}
 return async function solanaUsdtBridgeHandler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
  const identity=await deps.verifyUser(req),state=deps.state(),body=req.body||{}
  if(body.action==='quote'){
   if(!deps.enabled())return res.status(409).json({ok:false,error:'Solana USDT bridging is not available yet.'})
   if(body.source!=='solana'||!['base','arbitrum'].includes(body.destination)||typeof body.amount!=='string'||!/^\d+(\.\d{1,6})?$/.test(body.amount)||parseUnits(body.amount,6)<=0n)throw Error('Choose a supported route and amount.')
   const [from,to]=await Promise.all(['solana',body.destination].map(n=>deps.readLink(circleLinkKey(identity.userId,n,'payment'))))
   if(!from||!to)throw Error('Open both Pocket wallets before bridging.')
   const route={source:'solana' as const,destination:body.destination as 'base'|'arbitrum',sender:from.circleWalletAddress,recipient:to.circleWalletAddress,amountUnits:String(parseUnits(body.amount,6))}
   const apiKey=process.env.RELAY_API_KEY?.trim();if(!apiKey)throw Error('Bridge provider is not configured.')
   const reply=await fetch('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey},body:JSON.stringify(relayUsdtRequest(route)),signal:AbortSignal.timeout(20000)})
   if(!reply.ok)throw Error('Could not refresh the bridge quote.')
   const quote=await prepareSolanaUsdtRelayTransaction({quote:await reply.json(),route,connection:new Connection(getRpc(),'confirmed'),relayer:loadRelayer(),treasury:new PublicKey(process.env.SOLANA_TREASURY||'')})
   const record=await state.register({ownerId:identity.userId,walletId:from.circleWalletId,walletAddress:from.circleWalletAddress,destinationAddress:to.circleWalletAddress,quote})
   return res.json({ok:true,...solanaUsdtBridgePreview(record),sufficientBalance:true})
  }
  if(!['execute','submit','status','resume'].includes(body.action)||typeof body.quoteToken!=='string'||!body.quoteToken.startsWith('solana:'))return res.status(400).json({ok:false,error:'Invalid bridge request.'})
  const id=body.quoteToken.slice(7),r=await state.read(identity.userId,id)
  if(body.action==='execute'||body.action==='resume'){
   const [from,to]=await Promise.all(['solana',r.quote.destination].map(n=>deps.readLink(circleLinkKey(identity.userId,n,'payment'))))
   if(!from||!to||from.circleWalletId!==r.walletId||from.circleWalletAddress!==r.walletAddress||to.circleWalletAddress.toLowerCase()!==r.destinationAddress.toLowerCase())throw Error('Linked bridge wallets changed.')
   if(r.quote.expiresAt<=Date.now())throw Error('Bridge quote expired. Check its saved status before retrying.')
   if(!['quoted','awaiting_approval'].includes(r.phase))throw Error('Bridge is already processing. Check its saved status.')
   return res.json({ok:true,status:r.phase==='quoted'?'not_submitted':'awaiting_approval',bridgeId:r.id,transaction:r.quote.transaction,challengeId:r.challengeId})
  }
  if(body.action==='submit')await state.saveSigned(identity.userId,id,body.transaction)
  return res.json(await recoverSolanaUsdtBridge(identity.userId,id,deps))
 }catch(error){return res.status((error as any)?.status===404?404:409).json({ok:false,error:error instanceof Error?error.message:'Bridge is temporarily unavailable. Your saved transfer is retained.',...((error as any)?.maximumAmountUnits?{maximumAmountUnits:(error as any).maximumAmountUnits}:{})})}
 }
}
export default createSolanaUsdtBridgeHandler()

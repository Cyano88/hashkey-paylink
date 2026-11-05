import type {Request,Response} from 'express'
import {parseUnits} from 'viem'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {hasRenderDurableStore} from '../render-durable-store.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {quoteCrossBridgeOwned} from './cross-bridge-quote.js'
import {crossBridgeReservationStore} from './cross-bridge-reservation.js'
import {crossBridgeEnabled,crossBridgePreview,crossBridgeResponse,crossBridgeRuntime,listCrossBridgeOperations,reconcileCrossBridge} from './cross-bridge-runtime.js'
import {crossBridgeNetwork,crossBridgePair,CROSS_BRIDGE_ROLLOUT_NETWORKS} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {CrossBridgeOperation} from './cross-bridge-operations.js'
import {readCrossBridgeCircleSourceState} from './cross-bridge-circle-source.js'
const defaults={identity:verifiedPrivyUser,durable:hasRenderDurableStore,enabled:crossBridgeEnabled,quote:quoteCrossBridgeOwned,open:openCrossBridgeReview,store:crossBridgeReservationStore,runtime:crossBridgeRuntime,list:listCrossBridgeOperations,reconcile:reconcileCrossBridge,response:crossBridgeResponse}
/** No client-supplied wallets, fee policy, calls, source proof or settlement. */
export function createCrossBridgeHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','private, no-store')
  const startedAt=Date.now()
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const {userId:owner}=await d.identity(req)
   if(!d.durable())return res.status(503).json({ok:false,error:'Bridge recovery storage is unavailable.'})
   if(req.method==='GET')return res.json({ok:true,enabled:d.enabled(owner),networks:CROSS_BRIDGE_ROLLOUT_NETWORKS,pending:await Promise.all((await d.list(owner)).filter(r=>!['prepared','cancelled','not_submitted'].includes(r.state)).slice(0,50).map(d.response))})
   const b=req.body||{},action=b.action
   if(!['quote','prepare','submit','signed','status','cancel'].includes(action))return res.status(400).json({ok:false,error:'Unsupported bridge action.'})
   if(['quote','prepare','submit'].includes(action)&&!d.enabled(owner))return res.status(409).json({ok:false,error:'This bridge is not enabled for this account.'})
   if(action==='quote'){
    const source=crossBridgeNetwork(b.source),destination=crossBridgeNetwork(b.destination),pair=crossBridgePair(source,destination,b.from,b.to)
    if(typeof b.amount!=='string'||!new RegExp('^\\d{1,20}(?:\\.\\d{1,'+pair.tokenIn.decimals+'})?$').test(b.amount))return res.status(400).json({ok:false,error:'Enter a valid amount.'})
    const saved=await d.quote({ownerId:owner,source,destination,from:b.from,to:b.to,amountUnits:String(parseUnits(b.amount,pair.tokenIn.decimals)),circleUserToken:typeof b.circleUserToken==='string'?b.circleUserToken:undefined,maximum:b.maximum===true})
    const opened=await d.open(saved.quoteToken,owner)
    return res.json({ok:true,quote:crossBridgePreview(opened),quoteToken:saved.quoteToken,sufficientBalance:true})
   }
   const token=typeof b.quoteToken==='string'?b.quoteToken:'',review=await d.open(token,owner,{recovery:!['prepare','submit'].includes(action)}),id=review.quote.id
   const existing=await d.store.read(id)
   if(existing&&(existing.ownerId!==owner||existing.quoteToken!==token))throw Error('Bridge owner or review changed.')
   const userToken=typeof b.circleUserToken==='string'?b.circleUserToken:''
   if(action==='prepare'){
    const combined=b.dispatch===true
    if(combined&&review.quote.wallets.source.provider!=='circle')throw Error('This bridge requires wallet authorization.')
    const approval=req.headers['x-pocket-payment-approval'],runtime=d.runtime(review,userToken,combined?{reuseEstimateMs:2000}:{})
    let op=await runtime.prepare(token,typeof approval==='string'?approval:'')
    if(combined&&op.state==='prepared')op=await runtime.submit(id,'')
    return res.json({...await d.response(op),...('request' in runtime&&op.state==='prepared'?{request:await runtime.request(id)}:{})})
   }
   if(!existing)return res.json({ok:true,status:'not_submitted'})
   let op=existing as CrossBridgeOperation
   if(action==='cancel'&&!op.sourceHash&&review.quote.wallets.source.provider==='circle'&&review.quote.input.source!=='solana'&&userToken)op=await d.runtime(review,userToken).status(id)
   if(action==='cancel'){
    const cancelled=await d.store.mutate(id,current=>{
     if(!current||current.ownerId!==owner||current.quoteToken!==token)throw Error('Bridge identity changed.')
     const unsigned=current.state==='prepared'||review.quote.input.source==='solana'&&['submitting','pending'].includes(current.state)&&!current.signedTransaction&&!current.sourceHash
     return unsigned?{...current,state:'cancelled',updatedAt:Date.now()}:current
    })
    return res.json(await d.response(cancelled as CrossBridgeOperation))
   }
   if(action==='submit'){
    const runtime=d.runtime(review,userToken)
    op=await runtime.submit(id,typeof b.authorization==='string'?b.authorization:'')
   }else if(action==='signed'){
    const runtime=d.runtime(review,userToken)
    if(!('signed' in runtime)||typeof runtime.signed!=='function'||typeof b.signedTransaction!=='string')return res.status(400).json({ok:false,error:'Invalid signed bridge.'})
    op=await runtime.signed(id,b.signedTransaction)
   }else if(action==='status'&&!op.sourceHash){
    if(review.quote.wallets.source.provider==='privy'||userToken)op=await d.runtime(review,userToken).status(id)
    if(!op.sourceHash&&review.quote.input.source!=='solana'&&review.quote.wallets.source.provider==='circle'&&typeof b.txHash==='string'&&/^0x[0-9a-f]{64}$/i.test(b.txHash)){
     try{await readCrossBridgeCircleSourceState(review,b.txHash);op=await d.store.mutate(id,current=>{if(!current||current.ownerId!==owner||current.quoteToken!==token)throw Error('Bridge changed.');if(!['pending','submitting'].includes(current.state))return current;return {...current,sourceHash:b.txHash,state:'submitted',updatedAt:Date.now()}}) as CrossBridgeOperation}catch{/* Candidate hash is not source proof. */}
    }
   }
   if(op.sourceHash){try{op=await d.reconcile(owner,id) as CrossBridgeOperation}catch{/* Keep the journaled state while proof is unavailable. */}}
   return res.json(await d.response(op))
  }catch(error){const e=error as Error&{status?:number;code?:string;maximumAmountUnits?:string;feeCheck?:unknown};if(['cross_bridge_fee_changed','cross_bridge_fee_unavailable','pocket_fee_limit'].includes(e.code||'')&&e.feeCheck)console.warn('pocket_bridge_fee_recheck',JSON.stringify({action:req.body?.action,check:e.feeCheck}));return res.status(e.status&&e.status>=400&&e.status<=599?e.status:409).json({ok:false,error:e.message||'Bridge is temporarily unavailable.',...(e.code?{code:e.code}:{}),...(e.maximumAmountUnits?{maximumAmountUnits:e.maximumAmountUnits}:{})})}finally{if(['quote','prepare','submit'].includes(req.body?.action))console.info('pocket_bridge_timing',JSON.stringify({action:req.body.action,combined:req.body.dispatch===true,durationMs:Date.now()-startedAt}))}
 }
}
export default createCrossBridgeHandler()

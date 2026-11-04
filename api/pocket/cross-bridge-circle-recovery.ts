import {crossBridgeReservationStore} from './cross-bridge-reservation.js'
import {crossBridgeDeliveryCandidate,crossBridgeHash} from './cross-bridge-evidence.js'
import {readCrossBridgeCircleSourceState} from './cross-bridge-circle-source.js'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
import type {CrossBridgeReservation} from './cross-bridge-reservation-guard.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
/** Provider hashes are discovery hints only. Recover after app termination without
 * wallet credentials; exact canonical source execution remains mandatory. */
export async function recoverCrossBridgeCircleHash(op:CrossBridgeReservation,r:Review,overrides:Partial<{provider:typeof provider;prove:typeof readCrossBridgeCircleSourceState;store:typeof crossBridgeReservationStore}>={}){
 const d={provider,prove:readCrossBridgeCircleSourceState,store:crossBridgeReservationStore,...overrides}
 if(op.sourceHash||!['pending','submitting'].includes(op.state)||r.quote.wallets.source.provider!=='circle'||r.quote.input.source==='solana')return op
 if(op.id!==r.quote.id||op.ownerId!==r.quote.ownerId||op.source!==r.quote.input.source||op.walletAddress.toLowerCase()!==r.quote.input.sender.toLowerCase())throw Error('Bridge recovery identity changed.')
 const {status,requests}=await d.provider(r),hash=status?.inTxHashes?.[0]
 if(!crossBridgeHash(r.route.source,hash)||!crossBridgeDeliveryCandidate({route:r.route,sender:r.quote.input.sender,recipient:r.quote.input.recipient},hash,status,requests))return op
 if(await d.prove(r,hash)!=='confirmed')return op
 return d.store.mutate(op.id,current=>{
  if(!current||current.ownerId!==op.ownerId||current.fingerprint!==op.fingerprint||current.quoteToken!==op.quoteToken)throw Error('Bridge recovery identity changed.')
  if(current.sourceHash||!['pending','submitting'].includes(current.state))return current
  return {...current,sourceHash:hash,state:'submitted',updatedAt:Date.now()}
 })
}
async function provider(r:Review){
 const key=(process.env.RELAY_API_KEY||'').trim();if(!key)throw Error('Bridge provider recovery is unavailable.')
 const get=async(path:string)=>{const response=await fetch('https://api.relay.link'+path,{headers:{'x-api-key':key},redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Bridge recovery unavailable.');return response.json()}
 const [status,requests]=await Promise.all([get('/intents/status/v3?requestId='+encodeURIComponent(r.route.requestId)),get('/requests/v3?'+new URLSearchParams({id:r.route.requestId,orderId:r.route.orderId,limit:'1'}))]);return {status,requests}
}

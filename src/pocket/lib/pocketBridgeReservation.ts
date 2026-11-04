import type {CircleEvmBridgeReservation} from '../../lib/circleEvmEmailWallet'
import type {PocketPendingBridge} from './pocketPendingBridge'

/** Source reservation completion is never destination payment completion. */
export function applyPocketBridgeReservation(active:PocketPendingBridge,state:CircleEvmBridgeReservation):PocketPendingBridge{
 if(!state.managed){if(active.managedReservation)throw Error('Bridge recovery is temporarily unavailable.');return active.txHash?{...active,reservationReleased:true}:active}
 const validHash=active.source==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,88}$/:/^0x[0-9a-f]{64}$/i
 const normalized=(hash:string)=>active.source==='solana'?hash:hash.toLowerCase()
 if(state.txHash&&!validHash.test(state.txHash))throw Error('Invalid bridge transaction reference.')
 if(active.txHash&&state.txHash&&normalized(active.txHash)!==normalized(state.txHash))throw Error('Bridge transaction reference changed.')
 if(active.challengeId&&state.challengeId&&active.challengeId!==state.challengeId)throw Error('Bridge approval reference changed.')
 const failed=state.status==='failed'&&state.sourceOutcome==='source_failed',unsigned=state.status==='not_submitted'&&!state.txHash&&!active.txHash
 const released=state.reservationReleased===true&&(failed||unsigned||state.status==='completed'&&state.sourceOutcome==='source_confirmed'&&!!state.txHash)
 return {...active,managedReservation:true,reservationReleased:!!active.reservationReleased||released,...(state.challengeId?{challengeId:state.challengeId}:{}),...(state.txHash?{txHash:state.txHash}:{}),...(failed||unsigned?{progress:'failed'}:state.txHash?{progress:active.progress==='completed'?'completed':'submitted'}:{})}
}

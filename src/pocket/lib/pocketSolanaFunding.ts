import {bridgeCircleSolanaWallet,readSolanaBridgeReservation} from './pocketSolanaBridge'
import {applyPocketBridgeReservation} from './pocketBridgeReservation'
import {runFundingAttempt} from './pocketFundingAttempt'

/** Reopen by the saved signed reference; never prepare or broadcast a retry. */
export async function movePocketSolanaFunding(params:Omit<Parameters<typeof bridgeCircleSolanaWallet>[0],'idempotencyKey'>&{owner:string;fundingKey:string}){
 const record=await runFundingAttempt({owner:params.owner,key:params.fundingKey,storage:localStorage,
  route:{source:'solana',destination:params.destination,amount:params.amount,walletAddress:params.session.wallet.address},
  execute:(id,_onChallenge,onTransaction,onReservation)=>bridgeCircleSolanaWallet({...params,idempotencyKey:id,onReservation:state=>{onReservation(state);params.onReservation?.(state)},onBeforeSubmit:hash=>{onTransaction(hash);params.onBeforeSubmit?.(hash)}}),
  // This reference proves neither broadcast nor settlement. The caller must
  // continue authenticated status verification before treating funds as arrived.
  recover:async active=>applyPocketBridgeReservation(active,await readSolanaBridgeReservation(active.id,params.accessToken)),
 })
 return record.txHash!
}

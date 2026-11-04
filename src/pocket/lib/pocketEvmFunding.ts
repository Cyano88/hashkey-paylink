import {bridgeCircleEvmEmailWallet,readCircleEvmBridgeReservation,readCircleEvmBridgeChallenge} from '../../lib/circleEvmEmailWallet'
import {applyPocketBridgeReservation} from './pocketBridgeReservation'
import {runFundingAttempt} from './pocketFundingAttempt'

export async function movePocketEvmFunding(params:Parameters<typeof bridgeCircleEvmEmailWallet>[0]&{owner:string;fundingKey:string}){
 if(!params.privyAccessToken)throw Error('Sign in again to recover this payment.')
 const record=await runFundingAttempt({owner:params.owner,key:params.fundingKey,storage:localStorage,
  route:{source:params.session.chain,destination:params.destination,amount:params.amount,walletAddress:params.session.wallet.address},
  execute:(id,onChallenge)=>bridgeCircleEvmEmailWallet({...params,idempotencyKey:id,onChallenge}),
  recover:async active=>{
   const state=await readCircleEvmBridgeReservation(params.session,active.id,params.privyAccessToken!)
   if(state.managed||active.managedReservation)return applyPocketBridgeReservation(active,state)
   if(active.txHash)return active
   const challengeId=state.challengeId||active.challengeId
   if(!challengeId)return active
   const legacy=await readCircleEvmBridgeChallenge(params.session,challengeId)
   return {...active,challengeId,...(legacy.txHash?{txHash:legacy.txHash,progress:'submitted' as const}:legacy.failedWithoutTransaction||legacy.sourceFailed?{progress:'failed' as const}:{})}
  }
 })
 return record.txHash!
}

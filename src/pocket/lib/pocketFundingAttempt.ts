import {readPocketBridgeTransfers,savePocketBridgeTransfer,type PocketPendingBridge} from './pocketPendingBridge'
import {applyPocketBridgeReservation} from './pocketBridgeReservation'
import type {CircleEvmBridgeReservation} from '../../lib/circleEvmEmailWallet'

export const FUNDING_ATTEMPT_PENDING='Your USDC move is saved. Check Activity before retrying.'
const running=new Map<string,Promise<PocketPendingBridge>>()
export function readFundingAttempt(owner:string,key:string,storage:Pick<Storage,'getItem'>){
 return readPocketBridgeTransfers(owner,storage).filter(row=>row.fundingKey===key&&row.progress!=='failed').sort((a,b)=>b.createdAt-a.createdAt)[0]
}
/** A saved attempt may only recover; an unknown response never permits redispatch. */
export function runFundingAttempt(input:{owner:string;key:string;storage:Pick<Storage,'getItem'|'setItem'>;route:Pick<PocketPendingBridge,'source'|'destination'|'amount'|'walletAddress'>;execute:(id:string,onChallenge:(id:string)=>void,onTransaction:(hash:string)=>void,onReservation:(state:CircleEvmBridgeReservation)=>void)=>Promise<string>;recover:(record:PocketPendingBridge)=>Promise<PocketPendingBridge>}){
 const lock=JSON.stringify([input.owner,input.key]);const prior=running.get(lock);if(prior)return prior
 const task=(async()=>{
  if(!input.owner||!input.key)throw Error('Sign in and reopen this payment.')
  let record=readFundingAttempt(input.owner,input.key,input.storage)
  if(record){
   const units=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))}
   const wallet=(value:string|undefined)=>record.source==='solana'?value:value?.toLowerCase()
   if(record.source!==input.route.source||record.destination!==input.route.destination||units(record.amount)!==units(input.route.amount)||wallet(record.walletAddress)!==wallet(input.route.walletAddress))throw Error(FUNDING_ATTEMPT_PENDING)
   const recovered=await input.recover(record)
   if(recovered.id!==record.id)throw Error('Bridge attempt changed.')
   savePocketBridgeTransfer(input.owner,recovered,input.storage)
   if(recovered.progress==='failed')throw Object.assign(Error('The USDC move was not completed. Review the payment before trying again.'),{fundingSourceFailed:true})
   if(!recovered.txHash)throw Error(FUNDING_ATTEMPT_PENDING)
   return recovered
  }
  if(readPocketBridgeTransfers(input.owner,input.storage).some(row=>row.progress!=='failed'&&row.progress!=='completed'))throw Error(FUNDING_ATTEMPT_PENDING)
  record={...input.route,id:crypto.randomUUID(),fundingKey:input.key,createdAt:Date.now(),progress:'needs_attention',reservationReleased:input.route.source==='solana'?undefined:false}
  const save=()=>savePocketBridgeTransfer(input.owner,record!,input.storage)
  save()
  try{
   const txHash=await input.execute(record.id,challengeId=>{record={...record!,challengeId};save()},hash=>{
    if(record!.txHash&&record!.txHash!==hash)throw Error('Bridge transaction reference changed.')
    record={...record!,txHash:hash};save()
   },state=>{record=applyPocketBridgeReservation(record!,state);save()})
   if(record.txHash&&record.txHash!==txHash)throw Error('Bridge transaction reference changed.')
   record={...record,txHash,progress:'submitted'};save();return record
  }catch{throw Error(FUNDING_ATTEMPT_PENDING)}
 })().finally(()=>{if(running.get(lock)===task)running.delete(lock)})
 running.set(lock,task);return task
}

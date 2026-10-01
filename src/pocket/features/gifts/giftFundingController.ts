import {giftUnits} from './pocketGift'
import {formatUnits} from 'viem'
import type {SavedGiftDraft} from './giftDraftVault'
import type {GiftApproval} from '../../api/pocketGiftsClient'
export type GiftFundingReview={id:string;principal:string;platformFee:string;totalDebit:string}
export type GiftFundingPhase='draft'|'review'|'preparing'|'approval'|'checking'|'unconfirmed'|'available'|'claimed'|'expired'|'refunded'
export type GiftFundingState={phase:GiftFundingPhase;message:string;review?:GiftFundingReview}
export function createGiftFundingFlow(deps:{draft:SavedGiftDraft;save(draft:SavedGiftDraft):Promise<void>;create(draft:SavedGiftDraft):Promise<GiftFundingReview>;status(id:string):Promise<string>;security():Promise<void>;prepare(id:string):Promise<GiftApproval>;approve(approval:GiftApproval):Promise<unknown>;prepareRefund?(id:string):Promise<GiftApproval>;changed(state:GiftFundingState):void}){
 let draft={...deps.draft},active=true,locked=false,state:GiftFundingState={phase:'draft',message:''}
 const set=(next:GiftFundingState)=>{if(active){state=next;deps.changed(next)}}
 async function status(){
  if(!active||!draft.giftId)return
  set({...state,phase:'checking',message:'Checking your gift.'})
  try{const result=await deps.status(draft.giftId);if(!active)return
   if(['available','claimed','expired','refunded'].includes(result))set({...state,phase:result as GiftFundingPhase,message:result==='available'?'Your gift is ready.':result==='claimed'?'Gift claimed.':result==='refunded'?'Gift refunded.':'Gift expired.'})
   else set({...state,phase:draft.approvalStarted?'unconfirmed':'review',message:draft.approvalStarted?'Funding is not confirmed yet. Check again shortly.':''})
  }catch{set({...state,phase:'unconfirmed',message:'Your gift is saved. Check its status again shortly.'})}
 }
 return {get state(){return state},get draft(){return draft},dispose(){active=false},async review(){
  if(!active||locked)return;locked=true;set({...state,phase:'preparing',message:'Preparing your gift.'})
  try{const review=await deps.create(draft);if(!active)return
   if(BigInt(review.principal)!==giftUnits(draft.amount)||BigInt(review.platformFee)!==giftUnits(draft.amount)*25n/10000n||BigInt(review.totalDebit)!==BigInt(review.principal)+BigInt(review.platformFee))throw Error('Invalid funding total')
   draft={...draft,giftId:review.id};await deps.save(draft);if(!active)return
   set({phase:'review',message:'',review});await status()
  }catch{set({...state,phase:'draft',message:'Could not prepare your gift. The saved draft is safe to retry.'})}finally{locked=false}
 },async fund(){
  if(!active||locked||state.phase!=='review'||!draft.giftId)return;locked=true
  try{set({...state,phase:'preparing',message:'Preparing approval.'});await deps.security();if(!active)return
   const approval=await deps.prepare(draft.giftId);if(!active)return
   draft={...draft,approvalStarted:true};await deps.save(draft);if(!active)return
   set({...state,phase:'approval',message:'Confirm in your wallet.'});await deps.approve(approval);if(active)await status()
  }catch{if(draft.approvalStarted)await status();else set({...state,phase:'review',message:'Approval did not finish. Your gift has not been confirmed.'})}finally{locked=false}
 },async refund(){
  if(!active||locked||state.phase!=='expired'||!draft.giftId||!deps.prepareRefund)return;locked=true
  try{set({...state,phase:'preparing',message:'Preparing your refund.'});await deps.security();if(!active)return;const approval=await deps.prepareRefund(draft.giftId);if(!active)return;set({...state,phase:'approval',message:'Confirm in your wallet.'});await deps.approve(approval);if(active)await status()}
  catch{await status()}finally{locked=false}
 },async recheck(){if(!active||locked)return;locked=true;try{await status()}finally{locked=false}}}
}
export const giftUsdc=(units:string)=>formatUnits(BigInt(units),6)+' USDC'

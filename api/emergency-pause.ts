import {randomUUID} from 'node:crypto'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import type {OperationsIdentity} from './operations-policy.js'

export const PAUSE_STORE='hashpaylink:emergency-pause:solana-sponsor:v1'
export type PauseState={revision:number;paused:boolean;resume?:{id:string;actor:string;email:string;reason:string};history:Array<{action:string;actor:string;email:string;reason:string;at:string;revision:number}>}
export const initialPauseState=():PauseState=>({revision:0,paused:false,history:[]})
function fail(message:string,status=409):never{throw Object.assign(Error(message),{status})}
export function transitionPause(current:PauseState|undefined,input:{action:string;revision:number;reason:string;proposalId?:string},actor:OperationsIdentity):PauseState{
 const state=current??initialPauseState()
 if(input.revision!==state.revision)fail('Controls changed. Refresh before continuing.')
 const reason=typeof input.reason==='string'?input.reason.trim():''
 if(reason.length<10||reason.length>1000)fail('Enter a reason between 10 and 1000 characters.',400)
 const next={...state,revision:state.revision+1}
 if(input.action==='pause'){next.paused=true;delete next.resume}
 else if(input.action==='request-resume'){
  if(!state.paused)fail('Sponsorship is already running.')
  if(state.resume)fail('A resume request is already awaiting approval.')
  next.resume={id:randomUUID(),actor:actor.userId,email:actor.email.toLowerCase(),reason}
 }else if(input.action==='approve-resume'){
  if(!state.paused||!state.resume||input.proposalId!==state.resume.id)fail('The resume request is no longer current.')
  if(state.resume.actor===actor.userId||state.resume.email===actor.email.toLowerCase())fail('A different authorized person must approve resuming.',403)
  next.paused=false;delete next.resume
 }else fail('Unsupported control action.',400)
 next.history=[...state.history,{action:input.action,actor:actor.userId,email:actor.email,reason,at:new Date().toISOString(),revision:next.revision}]
 return next
}
export async function readPauseState(){
 if(!hasRenderDurableStore())fail('Emergency controls are unavailable.',503)
 const state=await readDurableJson<PauseState>(PAUSE_STORE)
 if(state!==undefined&&(!state||typeof state.paused!=='boolean'||!Number.isSafeInteger(state.revision)||!Array.isArray(state.history)))fail('Emergency control state is invalid.',503)
 return state??initialPauseState()
}
export async function savePauseState(input:Parameters<typeof transitionPause>[1],actor:OperationsIdentity){
 return mutateDurableJson<PauseState>(PAUSE_STORE,state=>transitionPause(state,input,actor))
}
export async function assertSolanaSponsorshipRunning(read=readPauseState){
 // No cache: every signature checks the durable state, including background callers.
 let state:PauseState
 try{state=await read()}catch{fail('Payments are temporarily unavailable.',503)}
 if(state!.paused)throw Object.assign(Error('Payments are temporarily paused. Please try again later.'),{status:503,code:'PAYMENTS_PAUSED'})
}

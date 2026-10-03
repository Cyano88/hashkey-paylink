import type {GiftRecord} from './types.js'
export function giftReconciliationComplete(record:GiftRecord){
 if(record.state==='unfunded')return BigInt(record.observedTimestamp||'0')>=BigInt(record.expiresAt)
 if(record.version===2&&['claimed','refunded'].includes(record.state))return Boolean(record.fundingHash&&record.fundingAt&&Object.keys(record.settlements||{}).length===record.claimedCount&&(record.state==='claimed'||record.refundHash&&record.refundAt))
 if(record.state==='claimed')return Boolean(record.fundingHash&&record.fundingAt&&record.settlementHash&&record.settlementAt&&record.claimRecipient)
 if(record.state==='refunded')return Boolean(record.fundingHash&&record.fundingAt&&record.refundHash&&record.refundAt)
 return false
}
export function createGiftReconciler(deps:{list(now:number,limit:number):Promise<string[]>;refresh(id:string):Promise<GiftRecord>;schedule(id:string,next:number,complete:boolean):Promise<void>;now?:()=>number}){
 let running=false
 return async()=>{if(running)return {checked:0,deferred:0};running=true;let checked=0,deferred=0;const now=deps.now||Date.now
 try{for(const id of await deps.list(now(),10)){try{const record=await deps.refresh(id);const complete=giftReconciliationComplete(record);const catchingUp=BigInt(record.evidenceScanBlock||record.observedBlock||'0')<BigInt(record.observedBlock||'0');const activeAttempt=[record.funding,record.claim,record.refund,...Object.values(record.claims||{})].some(a=>a&&now()-a.startedAt<600000);await deps.schedule(id,now()+(catchingUp||activeAttempt?30000:300000),complete);checked++}catch{deferred++;await deps.schedule(id,now()+60000,false)}}return {checked,deferred}}finally{running=false}}
}

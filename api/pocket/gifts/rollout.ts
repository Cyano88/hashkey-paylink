import {giftUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import type {GiftIdentity,GiftNetwork} from './types.js'
// Pilot membership uses immutable authenticated IDs, never editable handles.
// A config response only reveals the caller's eligibility. Create and funding
// authorization independently enforce the same gate, including saved drafts.
export function baseGiftFundingAllowed(input:{publicEnabled:boolean;pilotUserIds:string;network:GiftNetwork;identity?:GiftIdentity;amount?:string}){
 if(input.network!=='base')return false
 if(input.publicEnabled)return true
 if(!input.identity?.userId)return false
 const allowed=new Set(input.pilotUserIds.split(',').map(value=>value.trim()).filter(Boolean))
 if(!allowed.has(input.identity.userId))return false
 if(input.amount===undefined)return true
 try{return giftUnits(input.amount)<=10000n}catch{return false}
}

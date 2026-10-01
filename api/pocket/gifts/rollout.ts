import {giftUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import type {GiftIdentity,GiftNetwork} from './types.js'
// Public Base rollout gate. Authentication and linked-wallet checks remain in
// the handler/service; no pilot membership or test amount cap applies.
export function baseGiftFundingAllowed(input:{publicEnabled:boolean;network:GiftNetwork;identity?:GiftIdentity;amount?:string}){
 if(!input.publicEnabled||input.network!=='base')return false
 if(input.amount===undefined)return true
 try{giftUnits(input.amount);return true}catch{return false}
}

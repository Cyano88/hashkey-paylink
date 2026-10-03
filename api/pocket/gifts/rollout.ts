import {giftUnits} from '../../../src/pocket/features/gifts/pocketGift.js'
import type {GiftIdentity,GiftNetwork} from './types.js'
// Public Base rollout gate. Authentication and linked-wallet checks remain in
// the handler/service; no pilot membership or test amount cap applies.
export function baseGiftFundingAllowed(input:{publicEnabled:boolean;network:GiftNetwork;identity?:GiftIdentity;amount?:string}){
 if(!input.publicEnabled||input.network!=='base')return false
 if(input.amount===undefined)return true
 try{giftUnits(input.amount);return true}catch{return false}
}

// Restricts new funding only. Claims and refunds must remain usable when the pilot closes.
export function stockGiftFundingAllowed(identity:GiftIdentity|undefined,env:Record<string,string|undefined>=process.env){
 if(!identity?.userId)return false
 if(env.POCKET_STOCK_GIFT_PUBLIC_ENABLED==='true')return true
 const handle=identity.handle.replace(/^@/,'').toLowerCase()
 if(!/^[a-z0-9]{3,20}$/.test(handle))return false
 const pilots=(env.POCKET_STOCK_GIFT_PILOT_IDS||'').split(',').map(s=>s.trim().replace(/^@/,'').toLowerCase()).filter(s=>/^[a-z0-9]{3,20}$/.test(s))
 return pilots.includes(handle)
}

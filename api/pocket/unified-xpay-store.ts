import {readDurableJson} from '../render-durable-store.js'
import type {XPayCheckout} from '../../src/pocket/lib/pocketUnifiedXPay.js'
export const UNIFIED_XPAY_KEY='pocket:unified-xpay:v1'
export type UnifiedXPayRecord=Omit<XPayCheckout,'destinations'>&{owner:string;destinationIds:string[];revisions:string[];key:string}
export type UnifiedXPayStore={checkouts:UnifiedXPayRecord[]}
export const readUnifiedXPayStore=async()=>await readDurableJson<UnifiedXPayStore>(UNIFIED_XPAY_KEY)||{checkouts:[]}
export async function assertUnifiedXPayDestination(id:unknown,destinationId:string,revision?:string,allowDeleted=false){
 if(typeof id!=='string'||!/^xp_[0-9a-f-]{36}$/.test(id))throw Object.assign(Error('Invalid XPay QR.'),{status:400})
 const checkout=(await readUnifiedXPayStore()).checkouts.find(c=>c.id===id&&(allowDeleted||!c.deletedAt))
 const index=checkout?.destinationIds.indexOf(destinationId)??-1
 if(!checkout||index<0)throw Object.assign(Error('This receiving option is not available for this QR.'),{status:409})
 if(revision!==undefined&&checkout.revisions[index]!==revision)throw Object.assign(Error('The receiving setup changed. Ask the merchant for a new QR.'),{status:409})
 return checkout
}

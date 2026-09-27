import {readDurableJson} from '../render-durable-store.js'
import type {XPayCheckout} from '../../src/pocket/lib/pocketUnifiedXPay.js'
export const UNIFIED_XPAY_KEY='pocket:unified-xpay:v1'
export type UnifiedXPayRecord=Omit<XPayCheckout,'destinations'>&{owner:string;destinationIds:string[];revisions:string[];key:string;version?:number;setupKeys?:Array<{key:string;kind:string}>;pastDestinations?:Array<{id:string;revision:string}>;legacyDestinationIds?:string[]}
export type UnifiedXPayStore={checkouts:UnifiedXPayRecord[]}
export const readUnifiedXPayStore=async()=>await readDurableJson<UnifiedXPayStore>(UNIFIED_XPAY_KEY)||{checkouts:[]}
export async function assertUnifiedXPayDestination(id:unknown,destinationId:string,revision?:string,allowDeleted=false){
 if(typeof id!=='string'||!/^xp_[0-9a-f-]{36}$/.test(id))throw Object.assign(Error('Invalid XPay QR.'),{status:400})
 const checkout=(await readUnifiedXPayStore()).checkouts.find(c=>c.id===id&&(allowDeleted||!c.deletedAt))
 const index=checkout?.destinationIds.indexOf(destinationId)??-1
 const past=allowDeleted&&checkout?.pastDestinations?.some(d=>d.id===destinationId&&(revision===undefined||d.revision===revision))
 if(!checkout||(index<0&&!past))throw Object.assign(Error('This receiving option is not available for this QR.'),{status:409})
 if(!past&&revision!==undefined&&checkout.revisions[index]!==revision)throw Object.assign(Error('Receiving options changed. Reopen this terminal before paying.'),{status:409})
 return checkout
}

// An old business QR can point to its own terminal, never to another business.
export async function legacyXPayTerminal(destinationId:string,setupKey?:string){
 const matches=(await readUnifiedXPayStore()).checkouts.filter(c=>c.legacyDestinationIds?.includes(destinationId)||c.destinationIds.includes(destinationId)||c.pastDestinations?.some(d=>d.id===destinationId)||(setupKey&&c.setupKeys?.some(k=>k.key===setupKey)))
 if(matches.length>1)throw Object.assign(Error('Ask the merchant for the QR for this business terminal.'),{status:409})
 return matches[0]?.id
}

export async function ownsTerminalSetupKey(owner:string,key:string,kind:string){
 return (await readUnifiedXPayStore()).checkouts.some(c=>c.owner===owner&&!c.deletedAt&&c.setupKeys?.some(k=>k.key===key&&k.kind===kind))
}

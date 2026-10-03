import type {MultiGiftAsset} from './pocketMultiGift'
import type {Address} from 'viem'
import {validateGiftDraft,giftAssetUnits} from './pocketGift'
import {createGiftCapability,giftCapabilitySigner} from './pocketGiftSigning'
export type SavedGiftDraft={version:1|2;claims?:number;createdAt?:number;requestId:string;network:'base'|'xlayer';asset?:MultiGiftAsset;amount:string;message:string;expiresAt:string;secret:string;signer:Address;giftId?:string;approvalStarted?:boolean}
export type GiftSecretStore={put(key:string,value:string):Promise<void>;get(key:string):Promise<string|null>;remove?(key:string):Promise<void>}
export function validateSavedGift(value:unknown):SavedGiftDraft{
 const d=value as SavedGiftDraft
 if(!d||![1,2].includes(d.version)||!['base','xlayer'].includes(d.network)||!/^[0-9a-f-]{36}$/i.test(d.requestId)||typeof d.message!=='string'||d.message.length>160||!/^\d{1,20}$/.test(d.expiresAt)||!/^0x[0-9a-fA-F]{40}$/.test(d.signer)||!/^[A-Za-z0-9_-]{43}$/.test(d.secret)||d.giftId!==undefined&&!/^g_[A-Za-z0-9_-]{22}$/.test(d.giftId))throw Error('Saved gift needs recovery. Do not fund it again.')
 if(d.version===1&&(d.network!=='base'||d.asset))throw Error('Invalid legacy gift asset.');
 if(giftCapabilitySigner(d.secret).toLowerCase()!==d.signer.toLowerCase())throw Error('Saved gift credential does not match. Do not fund it again.')
 if(d.version===2)validateGiftDraft({amount:d.amount,network:d.network,message:d.message,claims:d.claims!,asset:d.asset});else if(d.claims!==undefined&&d.claims!==1)throw Error('Invalid saved gift recipient count.');
 giftAssetUnits(d.amount,d.asset)
 return d
}
export function createGiftDraftVault(owner:string,secrets:GiftSecretStore,index:Pick<Storage,'getItem'|'setItem'>){
 if(!owner)throw Error('Sign in before creating a gift.')
 const prefix='com.hashpaylink.pocket.gift.'+encodeURIComponent(owner)+'.',indexKey=prefix+'index'
 function list(){const values=JSON.parse(index.getItem(indexKey)||'[]');if(!Array.isArray(values)||values.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw Error('Saved gifts could not be read.');return values as string[]}
 async function save(draft:SavedGiftDraft){
  validateSavedGift(draft)
  const payload=JSON.stringify(draft),key=prefix+draft.requestId
  await secrets.put(key,payload)
  if(await secrets.get(key)!==payload)throw Error('Pocket could not securely save this gift. No funding was started.')
  const ids=list();if(!ids.includes(draft.requestId))index.setItem(indexKey,JSON.stringify([...ids,draft.requestId]))
 }
 function archived(){const values=JSON.parse(index.getItem(prefix+'archived')||'[]');return Array.isArray(values)?values.filter((id:unknown)=>typeof id==='string'&&list().includes(id)):[]}
 const vault={list,save,archived,archive(id:string){if(!list().includes(id))throw Error('Gift not found.');index.setItem(prefix+'archived',JSON.stringify([...new Set([...archived(),id])]))},restore(id:string){index.setItem(prefix+'archived',JSON.stringify(archived().filter(value=>value!==id)))},async deleteDraft(id:string,serverConfirmed=false){const d=await vault.load(id);if(d.approvalStarted||d.giftId&&!serverConfirmed)throw Error('Check the gift before deleting.');if(!secrets.remove)throw Error('Secure deletion is unavailable.');await secrets.remove(prefix+id);index.setItem(indexKey,JSON.stringify(list().filter(value=>value!==id)));vault.restore(id)},async load(id:string){if(!list().includes(id))throw Error('Gift is not saved for this account.');const raw=await secrets.get(prefix+id);if(!raw)throw Error('Gift recovery data is unavailable. Do not fund it again.');return validateSavedGift(JSON.parse(raw))},async create(amount:string,message:string,claims=1,asset?:MultiGiftAsset){
  validateGiftDraft({amount,message,network:asset?'xlayer':'base',claims,asset})
  giftAssetUnits(amount,asset);if(message.trim().length>160)throw Error('Keep your message within 160 characters.')
  const capability=createGiftCapability()
  const draft:SavedGiftDraft={version:claims>1||asset?2:1,...(claims>1||asset?{claims}:{}),...(asset?{asset}:{}),createdAt:Date.now(),requestId:crypto.randomUUID(),network:asset?'xlayer':'base',amount,message:message.trim(),expiresAt:String(Math.floor(Date.now()/1000)+7*86400),secret:capability.secret,signer:capability.signer}
  await save(draft);return draft
 }}
 return vault
}

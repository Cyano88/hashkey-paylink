import {isAddress} from 'viem'
import type {CircleEvmEmailSession} from './circleEvmEmailWallet'
import {resolveArcTradeWalletSession} from './arcTradeWalletSession'

export type ArcTradeSessionOwner={userId:string;email:string;walletAppId:string}
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>
type Wallet=CircleEvmEmailSession['wallet']
type Saved={version:1;owner:ArcTradeSessionOwner;session:Omit<CircleEvmEmailSession,'encryptionKey'>}
const key=(owner:ArcTradeSessionOwner)=>'hashpaylink:arc-trade-session:v1:'+encodeURIComponent(owner.walletAppId)+':'+encodeURIComponent(owner.userId)
const ownerMatches=(a:ArcTradeSessionOwner,b:ArcTradeSessionOwner)=>a.userId===b.userId&&a.walletAppId===b.walletAppId&&typeof a.email==='string'&&a.email.toLowerCase()===b.email.toLowerCase()
const walletMatches=(a:Wallet,b:Pick<Wallet,'address'>&{id?:string})=>a.address.toLowerCase()===b.address.toLowerCase()&&(!b.id||a.id===b.id)
const invalidSession=(error:unknown)=>/HTTP (?:401|403)|(?:refresh|user|session) token.{0,60}(?:invalid|expired|revoked|already used)|(?:invalid|expired|revoked).{0,60}(?:refresh|user|session) token|session credentials are invalid|unauthori[sz]ed/i.test(String((error as Error)?.message??error))
const locks=new Map<string,Promise<unknown>>()

// Browser persistence follows Hash PayStream's existing renewal pattern: retain
// refresh credentials and wallet identity, never the Circle encryptionKey.
export function createArcTradeSessionPersistence(deps:{
 storage:()=>StorageLike;
 identity:()=>Promise<{appId:string;deviceId:string|null}>;
 refresh:(session:CircleEvmEmailSession)=>Promise<CircleEvmEmailSession>;
 resolve:(session:CircleEvmEmailSession,token:string,active:()=>boolean)=>Promise<CircleEvmEmailSession>;
}){
 const read=(owner:ArcTradeSessionOwner)=>{try{return deps.storage().getItem(key(owner))}catch{return null}}
 const clear=(owner:ArcTradeSessionOwner)=>{try{deps.storage().removeItem(key(owner))}catch{/* Storage may be disabled. */}}
 const save=(owner:ArcTradeSessionOwner,session:CircleEvmEmailSession)=>{
  if(!owner.userId||!owner.walletAppId||!owner.email||session.chain!=='arc'||session.wallet.blockchain!=='ARC'||!session.appId||!session.deviceId||!session.refreshToken)return
  // Whitelist only the Arc renewal data. Other network sessions and SDK keys
  // must not accidentally enter persistent browser storage.
  const value:Saved={version:1,owner,session:{chain:'arc',appId:session.appId,deviceId:session.deviceId,userToken:session.userToken,refreshToken:session.refreshToken,wallet:session.wallet}}
  try{deps.storage().setItem(key(owner),JSON.stringify(value))}catch{/* Current connection remains usable without persistence. */}
 }
 const restore=async(owner:ArcTradeSessionOwner,token:string,active:()=>boolean,accepted?:Pick<Wallet,'address'>)=>{
  const operation=async()=>{
   const raw=read(owner);if(!raw||!active())return undefined
   let saved:Saved
   try{saved=JSON.parse(raw)}catch{clear(owner);return undefined}
   const s=saved?.session
   if(saved?.version!==1||!saved.owner||!ownerMatches(saved.owner,owner)||s?.chain!=='arc'||s.wallet?.blockchain!=='ARC'||!isAddress(s.wallet?.address)||!s.wallet.id||!s.userToken||!s.refreshToken||!s.deviceId||!s.appId){clear(owner);return undefined}
   const identity=await deps.identity()
   if(!active())return undefined
   if(identity.appId!==s.appId||identity.deviceId!==s.deviceId){clear(owner);return undefined}
   if(accepted&&!walletMatches(s.wallet,accepted)){clear(owner);return undefined}
   let refreshed:CircleEvmEmailSession
   try{refreshed=await deps.refresh({...s,encryptionKey:''})}
   catch(error){if(invalidSession(error)&&read(owner)===raw){clear(owner);return undefined}throw error}
   if(!refreshed.encryptionKey||!refreshed.refreshToken||refreshed.appId!==s.appId||refreshed.deviceId!==s.deviceId||refreshed.chain!=='arc'||!walletMatches(refreshed.wallet,s.wallet))throw Error('Restored Arc wallet does not match the saved session.')
   // Persist rotated credentials before further reads. A navigation must not
   // lose the new refresh token, but logout/removal wins over a late response.
   if(read(owner)!==raw)return undefined
   save(owner,refreshed)
   if(!active())return undefined
   const resolved=await deps.resolve(refreshed,token,active)
   if(!active())return undefined
   if(accepted&&!walletMatches(resolved.wallet,accepted))throw Error('The restored wallet does not match the accepted Trade wallet.')
   return resolved
  }
  const name=key(owner),previous=locks.get(name)??Promise.resolve()
  const pending=previous.catch(()=>undefined).then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(name,operation):operation())
  locks.set(name,pending)
  try{return await pending}finally{if(locks.get(name)===pending)locks.delete(name)}
 }
 return {save,restore,clear}
}
const browserSessions=createArcTradeSessionPersistence({
 storage:()=>window.localStorage,
 identity:async()=>(await import('./circleEvmEmailWallet')).circleEvmEmailSessionIdentity('arc'),
 refresh:async session=>(await import('./circleEvmEmailWallet')).refreshCircleEvmEmailSession(session),
 resolve:(session,token,active)=>resolveArcTradeWalletSession(session,token,active,undefined,{allowLink:false}),
})
export const saveArcTradeSession=browserSessions.save
export const restoreArcTradeSession=browserSessions.restore
export const clearArcTradeSession=browserSessions.clear

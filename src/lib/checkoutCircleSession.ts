import type {CircleEvmEmailSession} from './circleEvmEmailWallet'
import type {ArcTradeSessionOwner} from './arcTradeSessionPersistence'
export type CheckoutSessionChain='base'|'arbitrum'|'arc'
type Wallet=CircleEvmEmailSession['wallet']
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>
const prefix=(owner:ArcTradeSessionOwner)=>'pocket:checkout-session:v1:'+encodeURIComponent(owner.walletAppId)+':'+encodeURIComponent(owner.userId)+':'
const invalid=(e:unknown)=>/HTTP (401|403)|(?:refresh|user|session) token.{0,60}(?:invalid|expired|revoked|already used)|(?:invalid|expired|revoked).{0,60}(?:refresh|user|session) token|unauthori[sz]ed/i.test(String((e as Error)?.message||e))
const matches=(a:Wallet,b:Wallet)=>a.id===b.id&&a.address.toLowerCase()===b.address.toLowerCase()&&a.blockchain===b.blockchain
export function createCheckoutSessionPersistence(deps:{storage:()=>StorageLike;identity:(chain:CheckoutSessionChain)=>Promise<{appId:string;deviceId:string|null}>;refresh:(s:CircleEvmEmailSession)=>Promise<CircleEvmEmailSession>;resolve:(s:CircleEvmEmailSession,token:string,chain:CheckoutSessionChain,wallet:Wallet,active:()=>boolean)=>Promise<CircleEvmEmailSession>}){
 const locks=new Map<string,Promise<unknown>>()
 const read=(key:string)=>{try{return deps.storage().getItem(key)}catch{return null}}
 const remove=(key:string)=>{try{deps.storage().removeItem(key)}catch{}}
 const save=(owner:ArcTradeSessionOwner,s:CircleEvmEmailSession)=>{
  if(!owner.userId||!owner.email||!owner.walletAppId||!s.appId||!s.deviceId||!s.refreshToken||!s.wallet?.id)return
  // Same renewal model as PayStream: no SDK encryption key is persisted.
  const session={chain:s.chain,appId:s.appId,deviceId:s.deviceId,userToken:s.userToken,refreshToken:s.refreshToken,wallet:s.wallet}
  try{deps.storage().setItem(prefix(owner)+s.appId,JSON.stringify({version:1,owner,session}))}catch{}
 }
 const clear=(owner:ArcTradeSessionOwner)=>{try{const storage=deps.storage();for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix(owner)))storage.removeItem(key)}}catch{}}
 const restore=async(owner:ArcTradeSessionOwner,token:string,chain:CheckoutSessionChain,wallet:Wallet,active:()=>boolean)=>{
  if(!token||!active())return undefined
  const identity=await deps.identity(chain),key=prefix(owner)+identity.appId
  const run=async()=>{
   const raw=read(key);if(!raw||!active())return undefined
   let saved;try{saved=JSON.parse(raw)}catch{remove(key);return undefined}
   const s=saved?.session
   if(saved?.version!==1||saved.owner?.userId!==owner.userId||saved.owner?.walletAppId!==owner.walletAppId||saved.owner?.email?.toLowerCase()!==owner.email.toLowerCase()||s?.appId!==identity.appId||s?.deviceId!==identity.deviceId||!s?.refreshToken||!s?.userToken||!s?.wallet?.id||!['base','arbitrum','arc','ethereum','polygon'].includes(s.chain)){remove(key);return undefined}
   let renewed:CircleEvmEmailSession
   try{renewed=await deps.refresh({...s,encryptionKey:''})}catch(e){if(invalid(e)&&read(key)===raw){remove(key);return undefined}throw e}
   if(!renewed.encryptionKey||!renewed.refreshToken||renewed.appId!==s.appId||renewed.deviceId!==s.deviceId||!matches(renewed.wallet,s.wallet))throw Error('The restored Circle session changed wallet identity.')
   if(read(key)!==raw)return undefined
   save(owner,renewed)
   const renewalRecord=read(key)
   if(!active())return undefined
   const resolved=await deps.resolve(renewed,token,chain,wallet,active)
   if(!active()||read(key)!==renewalRecord)return undefined
   if(resolved.chain!==chain||resolved.appId!==identity.appId||!matches(resolved.wallet,wallet))throw Error('The restored session does not match your Pocket wallet.')
   save(owner,resolved)
   return resolved
  }
  const previous=locks.get(key)||Promise.resolve(),pending=previous.catch(()=>undefined).then(run)
  locks.set(key,pending);try{return await pending}finally{if(locks.get(key)===pending)locks.delete(key)}
 }
 return{save,restore,clear}
}
const sessions=createCheckoutSessionPersistence({
 storage:()=>window.sessionStorage,
 identity:async chain=>(await import('./circleEvmEmailWallet')).circleEvmEmailSessionIdentity(chain),
 refresh:async s=>(await import('./circleEvmEmailWallet')).refreshCircleEvmEmailSession(s),
 resolve:async(s,token,chain,wallet,active)=>{
  const {restoreActivatedCircleEvmSession}=await import('./circleEvmEmailWallet')
  const {secureSessionForNetwork}=await import('../pocket/lib/pocketSecureWalletSession')
  const restored=await restoreActivatedCircleEvmSession(s,token)
  if(!active())throw Error('Your signed-in account changed.')
  const matching=secureSessionForNetwork(restored,chain,wallet.address)
  if(!matching||!matches(matching.wallet,wallet))throw Error('Reconnect the wallet linked to this Pocket account.')
  return matching
 }
})
export const saveCheckoutCircleSession=sessions.save
export const restoreCheckoutCircleSession=sessions.restore
export const clearCheckoutCircleSession=sessions.clear

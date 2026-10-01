import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {GiftError,type GiftIdentity,type GiftRecord} from './types.js'
import {giftCapabilitySigner} from '../../../src/pocket/features/gifts/pocketGiftSigning.js'
import {giftLink} from '../../../src/pocket/features/gifts/pocketGift.js'
import {GIFT_CODE_ALPHABET,normalizeGiftCode,formatGiftCode} from '../../../src/pocket/features/gifts/giftCode.js'
export type SealedGiftCode={giftId:string;hash:string;sealed:string}
export type GiftCodeStore={
 allocate(giftId:string,candidate:()=>SealedGiftCode):Promise<SealedGiftCode>;
 read(hash:string):Promise<SealedGiftCode|undefined>;
 consume(key:string,max:number,windowMs:number,now:number):Promise<void>;
}
export function createGiftCodeService(deps:{store:GiftCodeStore;key():string;gift(id:string):Promise<GiftRecord|undefined>;view(id:string):Promise<{status:string}>;now?:()=>number}) {
 const now=deps.now??Date.now
 const master=()=>{const value=deps.key();if(!/^[a-f0-9]{64}$/i.test(value))throw new GiftError(503,'Gift codes are temporarily unavailable. Use the gift link.');return Buffer.from(value,'hex')}
 const digest=(purpose:string,value:string)=>createHmac('sha256',master()).update(purpose+'\0'+value).digest('hex')
 const encryptionKey=()=>createHmac('sha256',master()).update('pocket-gift-code-encryption:v1').digest()
 function seal(giftId:string,code:string,secret:string):SealedGiftCode {
  const hash=digest('lookup',code),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),nonce)
  cipher.setAAD(Buffer.from(giftId+':'+hash))
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify({code,secret}),'utf8'),cipher.final()])
  return {giftId,hash,sealed:Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64')}
 }
 function open(record:SealedGiftCode){
  const bytes=Buffer.from(record.sealed,'base64'),decipher=createDecipheriv('aes-256-gcm',encryptionKey(),bytes.subarray(0,12))
  decipher.setAAD(Buffer.from(record.giftId+':'+record.hash));decipher.setAuthTag(bytes.subarray(12,28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) as {code:string;secret:string}
 }
 async function limits(identity:GiftIdentity,ip:string,action:'issue'|'resolve') {
  if(!identity.userId)throw new GiftError(401,'Sign in to claim a gift.')
  // Count valid and invalid attempts in shared durable buckets, including malformed codes.
  const time=now()
  await deps.store.consume(digest('limit',action+':user:'+identity.userId),action==='resolve'?5:10,900000,time)
  await deps.store.consume(digest('limit',action+':ip:'+ip),action==='resolve'?20:30,900000,time)
  await deps.store.consume(digest('limit',action+':global'),1000,3600000,time)
 }
 const unavailable=()=>new GiftError(404,'This code is invalid or the gift is no longer available.')
 return {
  async issue(identity:GiftIdentity,ip:string,id:string,secret:string) {
   await limits(identity,ip,'issue')
   const gift=await deps.gift(id)
   if(!gift||gift.ownerId!==identity.userId)throw unavailable()
   if(gift.state!=='available'||!gift.fundingHash||BigInt(gift.expiresAt)<=BigInt(Math.floor(now()/1000)))throw unavailable()
   let signer:string;try{signer=giftCapabilitySigner(secret)}catch{throw unavailable()}
   if(signer.toLowerCase()!==gift.claimSigner.toLowerCase())throw unavailable()
   const record=await deps.store.allocate(id,()=>seal(id,[...randomBytes(8)].map(v=>GIFT_CODE_ALPHABET[v&31]).join(''),secret))
   const saved=open(record)
   if(record.giftId!==id||giftCapabilitySigner(saved.secret).toLowerCase()!==gift.claimSigner.toLowerCase())throw new GiftError(503,'Gift code could not be verified.')
   return {code:formatGiftCode(saved.code)}
  },
  async resolve(identity:GiftIdentity,ip:string,input:string) {
   await limits(identity,ip,'resolve')
   const code=normalizeGiftCode(input);if(!code)throw unavailable()
   const record=await deps.store.read(digest('lookup',code));if(!record)throw unavailable()
   const saved=open(record)
   if(saved.code.length!==code.length||!timingSafeEqual(Buffer.from(saved.code),Buffer.from(code)))throw unavailable()
   const gift=await deps.gift(record.giftId)
   if(!gift||gift.state!=='available'||!gift.fundingHash||BigInt(gift.expiresAt)<=BigInt(Math.floor(now()/1000)))throw unavailable()
   if(giftCapabilitySigner(saved.secret).toLowerCase()!==gift.claimSigner.toLowerCase())throw unavailable()
   // Reconcile matched codes against chain truth before returning the existing claim link.
   if((await deps.view(record.giftId)).status!=='available')throw unavailable()
   return {link:giftLink(record.giftId,saved.secret)}
  },
 }
}

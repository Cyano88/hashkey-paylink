import assert from 'node:assert/strict'
import {createGiftCodeService} from '../api/pocket/gifts/codes.ts'
import {GiftError} from '../api/pocket/gifts/types.ts'
import {createGiftCapability} from '../src/pocket/features/gifts/pocketGiftSigning.ts'
import {parseGiftLink} from '../src/pocket/features/gifts/pocketGift.ts'
import {normalizeGiftCode,GIFT_CODE_ALPHABET} from '../src/pocket/features/gifts/giftCode.ts'
import {createGiftHandler} from '../api/pocket/gifts/handler.ts'
assert.equal(GIFT_CODE_ALPHABET.length,32)
assert.equal(normalizeGiftCode(' k7mx-9qdp '),'K7MX9QDP')
for(const code of ['ABCD-234O','1234-ABCD','ABCD234','ABCD23456','ABCD/2345'])assert.equal(normalizeGiftCode(code),null)
const cap=createGiftCapability(),other=createGiftCapability(),id='g_'+'a'.repeat(22),owner={userId:'owner',handle:'sender'},recipient={userId:'recipient',handle:'receiver'}
let time=1000000,lookups=0,viewState='available'
const gift={id,ownerId:'owner',state:'available',fundingHash:'0x'+'a'.repeat(64),expiresAt:'9999999',claimSigner:cap.signer}
const byGift=new Map(),byHash=new Map(),buckets=new Map()
const store={allocate:async(id,make)=>{if(!byGift.has(id)){const r=make();byGift.set(id,r);byHash.set(r.hash,r)}return byGift.get(id)},read:async hash=>{lookups++;return byHash.get(hash)},consume:async(key,max,window,now)=>{let b=buckets.get(key);if(!b||b.reset<=now)b={count:0,reset:now+window};if(b.count>=max)throw new GiftError(429,'Limited');b.count++;buckets.set(key,b)}}
const deps={store,key:()=> 'a'.repeat(64),gift:async key=>key===id?gift:undefined,view:async()=>({status:viewState}),now:()=>time}
const svc=createGiftCodeService(deps)
await assert.rejects(()=>svc.issue(recipient,'ip-r',id,cap.secret),e=>e.status===404)
await assert.rejects(()=>svc.issue(owner,'ip-o',id,other.secret),e=>e.status===404)
const issued=await svc.issue(owner,'ip-o',id,cap.secret);assert.match(issued.code,/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
assert.equal((await svc.issue(owner,'ip-o',id,cap.secret)).code,issued.code,'Issuance is idempotent')
const raw=JSON.stringify([...byHash.values()]);assert(!raw.includes(cap.secret));assert(!raw.includes(issued.code.replace('-','')),'Neither credential nor code is stored in plaintext')
assert.equal(parseGiftLink((await svc.resolve(recipient,'ip-r',issued.code.toLowerCase())).link).secret,cap.secret)
viewState='claimed';await assert.rejects(()=>svc.resolve(recipient,'ip-r',issued.code),e=>e.status===404);viewState='available'
gift.expiresAt='1';await assert.rejects(()=>svc.resolve(recipient,'ip-r',issued.code),e=>e.status===404);gift.expiresAt='9999999'
const sealed=byGift.get(id),original=sealed.sealed;sealed.sealed=Buffer.from('tampered').toString('base64');await assert.rejects(()=>svc.resolve(recipient,'ip-r',issued.code));sealed.sealed=original
const blocked={userId:'attacker',handle:''};for(let i=0;i<5;i++)await assert.rejects(()=>svc.resolve(blocked,'ip-a','bad'),e=>e.status===404)
const before=lookups;await assert.rejects(()=>svc.resolve(blocked,'ip-a',issued.code),e=>e.status===429);assert.equal(lookups,before,'Blocked attempts never query valid codes')
const second=createGiftCodeService(deps);await assert.rejects(()=>second.resolve(blocked,'ip-a',issued.code),e=>e.status===429,'Limits survive service instance replacement')
time+=900001;assert(parseGiftLink((await second.resolve(blocked,'ip-a',issued.code)).link))
await assert.rejects(()=>createGiftCodeService({...deps,key:()=>''}).resolve(recipient,'ip-r',issued.code),e=>e.status===503)
await assert.rejects(()=>svc.resolve({userId:'',handle:''},'ip',issued.code),e=>e.status===401)
let calls=0;const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.value=value;return this}})
const handler=createGiftHandler({service:{},codes:{resolve:async()=>{calls++;return{link:'fixture'}}},identity:async()=>{throw new GiftError(401,'Sign in')}}),res=response();await handler({method:'POST',body:{action:'resolve-code',code:issued.code}},res);assert.equal(res.statusCode,401);assert.equal(calls,0);assert.equal(res.headers['Cache-Control'],'no-store')
console.log('PASS gift codes: encrypted credentials, alphabet/format, owner and signer proof, idempotence, authenticated lookup, expiry/chain-state checks, tamper rejection, shared rate limits and fail-closed key configuration.')

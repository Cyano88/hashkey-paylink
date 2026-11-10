import assert from 'node:assert/strict'
import {createMarketplaceSellerIdentity} from '../api/marketplace/seller-identity.ts'
let store={sessions:[],links:[]},now=1000,authorized=true
let kyc={level:'basic',country:'NG',legalName:'Ada Test Seller',reference:'kyc_fixture'}
const service=createMarketplaceSellerIdentity({read:async()=>structuredClone(store),mutate:async fn=>{const next=fn(structuredClone(store));store=next;return structuredClone(next)},now:()=>now,authorize:async()=>authorized,kyc:async()=>kyc,project:async()=>({name:'Test marketplace',allowedOrigins:['https://shop.example']})})
const issue=()=>service.issue('project_a','seller_a','key_a','https://shop.example/seller')
for(const url of ['http://shop.example','https://evil.example','https://user:pass@shop.example','https://shop.example/#bad'])await assert.rejects(()=>service.issue('project_a','seller_a','key_a',url),/saved HTTPS/)
const link=await issue(),token=new URLSearchParams(new URL(link.verificationUrl).hash.slice(1)).get('token')
assert.equal(JSON.stringify(store).includes(token),false)
assert.equal((await service.inspect(token,'owner_a')).connected,false)
await assert.rejects(()=>service.scope(token,'owner_a'),/Connect/)
await assert.rejects(()=>service.connect(token,'owner_a',false),/Consent/)
assert.equal((await service.connect(token,'owner_a',true)).bankEligible,true)
assert.equal((await service.connect(token,'owner_a',true)).connected,true)
assert.equal(store.links.length,1)
assert.deepEqual(await service.scope(token,'owner_a'),{projectId:'project_a',sellerId:'seller_a'})
await assert.rejects(()=>service.inspect(token,'owner_b'),/invalid or expired/)
const second=await issue(),secondToken=new URLSearchParams(new URL(second.verificationUrl).hash.slice(1)).get('token')
await assert.rejects(()=>service.connect(secondToken,'owner_b',true),/replacement/)
await assert.rejects(()=>service.scope(secondToken,'owner_a'),/Connect/)
const request={projectId:'project_a',sellerId:'seller_a',bankCode:'TEST',accountNumber:'0123456789',accountName:'Seller Ada Test'}
assert.equal((await service.verifyBank(request)).verified,true)
await assert.rejects(()=>service.verifyBank({...request,accountName:'Other Person'}),/does not match/)
await assert.rejects(()=>service.verifyBank({...request,sellerId:'seller_b'}),/Connect/)
assert.deepEqual(await service.status('project_a','seller_a'),{sellerId:'seller_a',connected:true,bankEligible:true})
kyc={...kyc,level:'none'}
assert.equal((await service.inspect(token,'owner_a')).bankEligible,false)
await assert.rejects(()=>service.verifyBank(request),/Basic/)
kyc={...kyc,level:'advanced',country:'UG'}
assert.equal((await service.status('project_a','seller_a')).bankEligible,false)
await assert.rejects(()=>service.verifyBank(request),/Basic/)
kyc={...kyc,country:'NG',reference:''}
assert.equal((await service.status('project_a','seller_a')).bankEligible,false)
await assert.rejects(()=>service.verifyBank(request),/Basic/)
authorized=false
await assert.rejects(()=>service.inspect(token,'owner_a'),/invalid or expired/)
await assert.rejects(issue,/authorization/)
authorized=true;now+=3600001
await assert.rejects(()=>service.connect(token,'owner_a',true),/invalid or expired/)
console.log('PASS seller identity consent, Pocket reuse, session binding, expiry, revocation, name matching and privacy (fixtures).')

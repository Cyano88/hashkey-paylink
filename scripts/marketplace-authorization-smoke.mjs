import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createMarketplacePrincipalResolver,createMarketplaceExecutionAuthority} from '../api/marketplace/authorization.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'
const secret='fixture-portal-secret-at-least-32-characters',credential='hpl_live_'+ 'a'.repeat(48),id='dev_12345678'
const base={projects:{[id]:{id,ownerId:'owner_a',accountType:'business',operationalStatus:'active',capabilities:['marketplace_payments'],businessVerification:{status:'approved'},keys:[{id:'key_one',prefix:credential.slice(0,16),digest:createHmac('sha256',secret).update(credential).digest('hex'),environment:'live'}]}}}
let store,access,env,reads,unavailable=false,kycLevel='none',kycOwner,kycUnavailable=false
function reset(){store=structuredClone(base);access={requests:[{projectId:id,ownerId:'owner_a',status:'approved'}]};env={DEVELOPER_PORTAL_SECRET:secret,MARKETPLACE_INSTRUCTIONS_ENABLED:'true',MARKETPLACE_PROJECT_IDS:id};reads=0;kycLevel='none';kycUnavailable=false}
reset()
const dependencies={readProjects:async()=>{reads++;if(unavailable)throw Error('Store unavailable');return structuredClone(store)},readAccess:async()=>structuredClone(access),env:()=>env,now:()=>1000,readIndividualKyc:async owner=>{kycOwner=owner;if(kycUnavailable)throw Error('KYC unavailable');return {level:kycLevel}}}
const resolver=createMarketplacePrincipalResolver(dependencies)
const execution=createMarketplaceExecutionAuthority(dependencies)
assert.deepEqual(await resolver(credential),{projectId:id,credentialId:'key_one',active:true,capabilities:['marketplace_payments'],scopes:['marketplace:read','marketplace:create','marketplace:release','marketplace:payout','marketplace:refund']})
for(const change of [()=>env.MARKETPLACE_INSTRUCTIONS_ENABLED='false',()=>env.MARKETPLACE_PROJECT_IDS='',()=>env.MARKETPLACE_PROJECT_IDS='dev_other000',()=>env.DEVELOPER_PORTAL_SECRET='short',()=>store.projects[id].ownerId='new_owner',()=>store.projects[id].operationalStatus='suspended',()=>delete store.projects[id].operationalStatus,()=>store.projects[id].removal={status:'deleted'},()=>store.projects[id].accountType='individual',()=>store.projects[id].businessVerification.status='pending',()=>store.projects[id].capabilities=[],()=>store.projects[id].keys[0].revokedAt='now',()=>store.projects[id].keys[0].environment='test',()=>store.projects[id].keys[0].expiresAt=new Date(1000).toISOString(),()=>store.projects[id].keys[0].expiresAt='invalid',()=>store.projects[id].keys[0].scopes=[],()=>store.projects[id].keys[0].createdByGrant='grant',()=>store.projects[id].keys[0].digest='malformed',()=>store.projects[id].keys.push({...store.projects[id].keys[0]}),()=>access.requests[0].status='pending',()=>access.requests[0].status='rejected',()=>access.requests.push({...access.requests[0]}),()=>access=undefined]){reset();change();assert.equal(await resolver(credential),null)}
for(const invalid of ['hpl_test_'+ 'a'.repeat(48),'hpl_app_'+ 'a'.repeat(48),'hpl_cli_'+ 'a'.repeat(48),' '+credential,credential+' ','hpl_live_short',credential+'b']){reset();assert.equal(await resolver(invalid),null)}
reset();env.MARKETPLACE_INSTRUCTIONS_ENABLED='false';assert.equal(await resolver(credential),null);assert.equal(reads,0)
reset();unavailable=true;await assert.rejects(()=>resolver(credential),/Store unavailable/);unavailable=false
// Exercise the real instruction boundary: principal supplies project identity and
// approval is reloaded even when a developer retries a previous instruction.
reset();let calls=0
const service=createMarketplaceInstructions({enabled:true,resolvePrincipal:resolver,repository:{sellerBalances:async(projectId,sellerId)=>{calls++;assert.equal(projectId,id);return [{sellerId}]}}})
assert.deepEqual(await service.sellerBalances(credential,'seller_one'),[{sellerId:'seller_one'}]);assert.equal(calls,1)
access.requests[0].status='rejected';await assert.rejects(()=>service.sellerBalances(credential,'seller_one'),/denied/);assert.equal(calls,1)
reset();store.projects[id].keys[0].revokedAt='now';await assert.rejects(()=>service.sellerBalances(credential,'seller_one'),/denied/);assert.equal(calls,1)
console.log('PASS marketplace authorization: live key HMAC, explicit rollout, current-owner approval, business verification, app/key revocation, expiry, ambiguity, scoped key denial, storage failure and instruction isolation. No public routes enabled.')
const previousGate=process.env.MARKETPLACE_INSTRUCTIONS_ENABLED
try{process.env.MARKETPLACE_INSTRUCTIONS_ENABLED='false';const defaultService=createMarketplaceInstructions({enabled:true,repository:{sellerBalances:async()=>{throw Error('Unexpected repository access')}}});await assert.rejects(()=>defaultService.sellerBalances(credential,'seller_one'),/denied/)}finally{if(previousGate===undefined)delete process.env.MARKETPLACE_INSTRUCTIONS_ENABLED;else process.env.MARKETPLACE_INSTRUCTIONS_ENABLED=previousGate}
console.log('PASS default instruction adapter remains closed without explicit rollout gate.')

reset();assert.equal(await execution(id,'key_one'),true)
store.projects[id].accountType='individual'
store.projects[id].businessVerification.status='not_started'
store.projects[id].personalKycVerified=true
assert.equal(await resolver(credential),null,'cached KYC flag cannot authorize')
assert.equal(await execution(id,'key_one'),false)
for(const level of ['basic','advanced']){
 kycLevel=level
 assert.equal((await resolver(credential)).projectId,id)
 assert.equal(await execution(id,'key_one'),true)
 assert.equal(kycOwner,'owner_a')
}
kycLevel='none';assert.equal(await execution(id,'key_one'),false,'worker rechecks KYC after reservation')
kycLevel='basic';kycUnavailable=true
await assert.rejects(()=>resolver(credential),/KYC unavailable/)
await assert.rejects(()=>execution(id,'key_one'),/KYC unavailable/)
kycUnavailable=false
for(const change of [()=>store.projects[id].keys[0].revokedAt='now',()=>store.projects[id].keys[0].expiresAt=new Date(1000).toISOString(),()=>store.projects[id].keys[0].scopes=[],()=>access.requests[0].status='rejected',()=>store.projects[id].ownerId='new_owner',()=>store.projects[id].operationalStatus='suspended',()=>env.MARKETPLACE_INSTRUCTIONS_ENABLED='false',()=>env.MARKETPLACE_PROJECT_IDS='',()=>store.projects[id].businessVerification.status='rejected',()=>store.projects[id].keys.push({...store.projects[id].keys[0]})]){
 reset();store.projects[id].accountType='individual';kycLevel='basic';change()
 assert.equal(await execution(id,'key_one'),false)
}
reset();assert.equal(await execution('dev_other000','key_one'),false)
assert.equal(await execution(id,'missing'),false)
console.log('PASS individual pilot: current owner Basic/Advanced KYC, explicit approval and rollout; worker rechecks revocation, expiry, suspension, KYC failure and ambiguous key IDs.')

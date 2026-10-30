import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler} from '../api/developer-projects.ts'
import {createDeveloperSandboxHandler} from '../api/developer-sandbox.ts'
import {builderProfilesForProjects,projectBuilderProfileId} from '../src/lib/builderProfiles.ts'
const stores=new Map();let owner='owner-a',sequence=0
const deps={hasStore:()=>true,portalSecret:()=> 'builder-profile-test-secret-at-least-32-characters',read:async k=>structuredClone(stores.get(k)),mutate:async(k,fn)=>{const value=fn(structuredClone(stores.get(k)));stores.set(k,value);return value},verify:async()=>({userId:owner,email:'builder@example.test'}),requireVerification:()=>true,now:()=>new Date(),createProjectId:()=>`dev_profile${++sequence}12345678`,createKeyId:()=>`key_${++sequence}`,createSecret:p=>p+'_'+sequence,receivingWallets:async()=>({}),validateWebhook:async()=>{},adminEmails:()=>'',adminUserIds:()=>''}
const handler=createDeveloperProjectsHandler(deps)
const recorder=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}})
async function call(body,query={}){const r=recorder();await handler({method:body?'POST':'GET',body,query,headers:{}},r);return r}
let response=await call();assert.deepEqual(response.body.builderProfiles,[{id:'personal',name:'Personal',type:'individual'}])
const app=(name,extra={})=>call({action:'create',name,checkoutMode:'human',capabilities:['hosted_checkout'],...extra})
const personal=(await app('Personal app',{accountType:'individual',builderProfileId:'personal'})).body.project
assert.equal(personal.builderProfileId,'personal')
const legacy=(await app('Existing company')).body.project
assert.equal(legacy.builderProfileId,'business_'+legacy.id)
const business=(await call({action:'create-builder-profile',name:'Example Limited'})).body.builderProfile
assert.equal(business.type,'business')
const businessApp=(await app('Business app',{accountType:'business',builderProfileId:business.id})).body.project
assert.equal(businessApp.builderProfileId,business.id)
assert.equal(businessApp.businessVerification.status,'not_started')
assert.equal((await app('Mismatched type',{accountType:'individual',builderProfileId:business.id})).statusCode,400)
response=await call(undefined,{profileId:business.id});assert.deepEqual(response.body.projects.map(p=>p.id),[businessApp.id])
response=await call(undefined,{profileId:'personal'});assert.deepEqual(response.body.projects.map(p=>p.id),[personal.id])
assert.equal((await call({action:'revoke-key',projectId:businessApp.id,builderProfileId:'personal',keyId:'fake'})).statusCode,409)
assert.equal((await call({action:'create-builder-profile',name:'x'})).statusCode,400)
owner='owner-b'
assert.equal((await call(undefined,{profileId:business.id})).statusCode,404)
assert.equal((await app('Foreign profile',{builderProfileId:business.id})).statusCode,404)
assert.deepEqual((await call()).body.builderProfiles.map(p=>p.id),['personal'])
owner='owner-a'
response=await call();const unset=response.body.builderProfiles.find(p=>p.id===legacy.builderProfileId)
assert.equal(unset.name,'Business profile not set');assert.equal(unset.needsSetup,true);assert.equal(unset.legacyAppName,'Existing company')
assert.equal((await app('Blocked until named',{builderProfileId:legacy.builderProfileId})).statusCode,409)
owner='owner-b';assert.equal((await call({action:'setup-builder-profile',profileId:legacy.builderProfileId,name:'Stolen'})).statusCode,404);owner='owner-a'
assert.equal((await call({action:'setup-builder-profile',profileId:legacy.builderProfileId,name:'x'})).statusCode,400)
const before=structuredClone(stores.get('hashpaylink:developer-projects:v1'))
response=await call({action:'setup-builder-profile',profileId:legacy.builderProfileId,name:'Actual Company'})
assert.equal(response.statusCode,200);assert.equal(response.body.builderProfile.name,'Actual Company');assert.equal(response.body.builderProfile.needsSetup,undefined)
assert.deepEqual(stores.get('hashpaylink:developer-projects:v1'),before)
assert.equal((await call({action:'setup-builder-profile',profileId:legacy.builderProfileId,name:'Again'})).statusCode,409)
const sibling=(await app('Second app',{accountType:'business',builderProfileId:legacy.builderProfileId})).body.project
assert.equal(sibling.builderProfileId,legacy.builderProfileId)
const projectStore=stores.get('hashpaylink:developer-projects:v1');delete projectStore.projects[legacy.id]
response=await call();assert.ok(response.body.builderProfiles.some(p=>p.id===legacy.builderProfileId&&p.name==='Actual Company'))
const isolated=new Map()
const sandbox=createDeveloperSandboxHandler(deps.verify,{read:async k=>structuredClone(isolated.get(k)),mutate:async(k,fn)=>{const next=fn(structuredClone(isolated.get(k)));isolated.set(k,next);return next},resolveProfile:async(actor,id)=>{const profiles=builderProfilesForProjects(Object.values(projectStore.projects).filter(p=>p.ownerId===actor),Object.values(stores.get('hashpaylink:developer-business-profiles:v1').businessProfiles).filter(p=>p.ownerId===actor));if(!profiles.some(p=>p.id===id))throw Object.assign(Error('Profile not found'),{status:404});return id}})
async function simulation(body,profileId='personal',headers={}){const r=recorder();await sandbox({method:body?'POST':'GET',body,headers,query:profileId===undefined?{}:{profileId}},r);return r}
const sample={action:'create-checkout',amount:'1.50',network:'xlayer',asset:'USDT',title:'Test',reference:'order-1'}
assert.equal((await simulation(sample,'personal',{'idempotency-key':'order-1234'})).statusCode,201)
assert.equal((await simulation(undefined,business.id)).body.payments.length,0)
assert.equal((await simulation(sample,business.id,{'idempotency-key':'order-1234'})).statusCode,201)
const first=(await simulation(undefined,'personal')).body.payments[0].id,second=(await simulation(undefined,business.id)).body.payments[0].id
assert.notEqual(first,second)
assert.equal((await simulation({action:'simulate',id:first,status:'paid'},business.id)).statusCode,404)
const testKey=(await simulation({action:'create-key'},business.id)).body.apiKey
assert.equal((await simulation(undefined,'personal',{'x-api-key':testKey})).statusCode,400)
owner='owner-b';assert.equal((await simulation(undefined,business.id)).statusCode,404)
assert.equal(isolated.size,2)
console.log('Builder profiles: legacy preservation, personal/business app isolation, immutable type and context, foreign owner rejection, independent sandbox data and key binding passed.')

import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler} from '../api/developer-projects.ts'
import {authorizeOperations} from '../api/operations-policy.ts'
import {productionVerificationAllows} from '../src/lib/developerAccess.ts'
import {assertVerificationEditable} from '../api/developer-verification.ts'
const stores=new Map();let actor={userId:'builder',email:'builder@example.test'},counter=0
const deps={hasStore:()=>true,portalSecret:()=> 'profile-change-test-secret-at-least-32-characters',read:async k=>structuredClone(stores.get(k)),mutate:async(k,fn)=>{const v=fn(structuredClone(stores.get(k)));stores.set(k,v);return structuredClone(v)},verify:async()=>actor,now:()=>new Date(1793510000000+counter++),createProjectId:()=>`dev_change${++counter}12345678`,createKeyId:()=>`key_${++counter}`,createSecret:p=>p+'test'+(++counter),validateWebhook:async()=>{},paycrestReady:()=>true,listBanks:async()=>[],verifyBank:async()=> 'Builder',adminEmails:()=> 'owner@example.test',adminUserIds:()=>''}
const handler=createDeveloperProjectsHandler(deps)
async function call(body){const r={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await handler({method:'POST',query:{},headers:{},body},r);return r}
assert.equal((await call({action:'set-builder-country',profileId:'personal',country:'NG',fullName:'Example Builder'})).statusCode,200)
const business=(await call({action:'create-builder-profile',name:'Example Limited',country:'NG'})).body.builderProfile
const create=async name=>(await call({action:'create',name,checkoutMode:'human',capabilities:['hosted_checkout'],builderProfileId:business.id})).body.project
const app=await create('Main shop'),sibling=await create('Other shop'),key='hashpaylink:developer-projects:v1'
const stored=stores.get(key).projects[app.id]
stored.businessVerification={status:'approved',revision:7,required:true,cipher:'encrypted-original-application',documents:[{id:'doc-old'}],history:[{action:'approved',actor:'reviewer',at:'old',revision:7}]}
stored.personalKycVerified=true;stored.settlementMode='ngn';stored.bankVerifiedAt='old';stored.bankAccountCipher='bank-cipher';stored.webhookUrl='https://example.test/hook';stored.keys=[{id:'key-saved',digest:'secret-digest'}]
const unchanged=structuredClone(stores.get(key).projects[sibling.id]),original=structuredClone(stored)
assert.equal((await call({action:'admin-profile-options',projectId:app.id})).statusCode,403)
actor={userId:'another-builder',email:'another@example.test'}
const foreign=(await call({action:'create-builder-profile',name:'Other Owner Limited',country:'UG'})).body.builderProfile
actor={userId:'staff',email:'owner@example.test'}
const options=await call({action:'admin-profile-options',projectId:app.id});assert.equal(options.statusCode,200);assert.deepEqual(options.body.profiles.map(p=>p.id),['personal'])
const move={action:'admin-change-profile',projectId:app.id,targetProfileId:'personal',expectedUpdatedAt:original.updatedAt,reason:'Builder requested correction of their app profile.',confirmPause:true}
assert.equal((await call({...move,confirmPause:false})).statusCode,400)
assert.equal((await call({...move,targetProfileId:business.id})).statusCode,400)
assert.equal((await call({...move,expectedUpdatedAt:'stale'})).statusCode,409)
const changed=await call(move);assert.equal(changed.statusCode,200,changed.body.error)
const personal=stores.get(key).projects[app.id]
assert.equal(personal.accountType,'individual');assert.equal(personal.builderProfileId,'personal');assert.equal(personal.operationalStatus,'suspended');assert.equal(personal.personalKycVerified,false);assert.equal(personal.bankVerifiedAt,undefined);assert.equal(personal.settlementStatus,'review_required');assert.equal(productionVerificationAllows(personal),false)
assert.equal(personal.businessVerification.status,'not_started');assert.equal(personal.businessVerification.revision,8)
assert.throws(()=>assertVerificationEditable(personal.businessVerification,original.businessVerification.revision),e=>e.status===409)
assert.deepEqual(personal.profileChanges[0].verification,original.businessVerification)
assert.deepEqual(personal.keys,original.keys);assert.equal(personal.webhookUrl,original.webhookUrl);assert.deepEqual(stores.get(key).projects[sibling.id],unchanged)
assert.equal(changed.body.project.profileChanges,undefined,'Private archived evidence must not be returned in project payloads')
assert.equal((await call(move)).statusCode,400,'A repeat cannot repeat a completed move')
assert.equal((await call({...move,targetProfileId:foreign.id,expectedUpdatedAt:personal.updatedAt})).statusCode,400,'Another owner profile cannot receive this app')
const profileStore=stores.get('hashpaylink:developer-business-profiles:v1'),targetRecord=profileStore.businessProfiles[Object.keys(profileStore.businessProfiles).find(k=>profileStore.businessProfiles[k].id===business.id)]
const savedCountry=targetRecord.country;delete targetRecord.country
assert.equal((await call({...move,targetProfileId:business.id,expectedUpdatedAt:personal.updatedAt})).statusCode,400,'Incomplete destinations are blocked')
targetRecord.country=savedCountry
const back=await call({...move,targetProfileId:business.id,expectedUpdatedAt:personal.updatedAt});assert.equal(back.statusCode,200,back.body.error)
assert.equal(back.body.project.accountType,'business');assert.equal(back.body.project.businessVerification.status,'not_started');assert.equal(back.body.project.operationalStatus,'suspended')
// Authorization: explicit owner/compliance only, including options. No legacy role bypass.
const env={OPERATIONS_FOUNDER_EMAILS:'owner@example.test',OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'shop',name:'Shop',projectIds:[app.id]}])}
for(const role of ['compliance','administrator','engineering','support']){
 const config={...env,OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'staff@example.test',workspaceId:'shop',roles:[role]}])}
 for(const action of ['admin-profile-options','admin-change-profile']){
  const f=()=>authorizeOperations({userId:'staff',email:'staff@example.test'},{method:'POST',query:{workspace:'shop'},body:{action}},'projects',app.id,config)
  if(role==='compliance')assert.doesNotThrow(f);else assert.throws(f)
 }
}
console.log('PASS profile changes: both directions, owner/compliance roles, stale rejection, suspension, independent identity checks, private verification archive, key/history preservation and sibling isolation.')

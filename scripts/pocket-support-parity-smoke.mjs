import assert from 'node:assert/strict'
import {createSupportAttachmentHandler,createAttachmentResolver} from '../api/support-attachments.ts'
import {createPocketSupportPresenceHandler} from '../api/pocket/support-presence.ts'
import {createPocketSupportCasesHandler,publicCase} from '../api/pocket/support-cases.ts'
import {circlePocketIdentityId} from '../api/circle-pocket-identity.ts'
import {authorizeOperations} from '../api/operations-policy.ts'
const identity={kind:'privy',subject:'pocket-user',storageKey:'privy:pocket-user'},profileId=circlePocketIdentityId(identity)
let viewer=identity,staff='staff@example.test',now=1000,n=0,store={cases:{},staffNames:{staff:'Shy'},staffImages:{staff:'data:image/png;base64,aGVsbG8='}}
const db=new Map(),presence=new Map(),copy=x=>structuredClone(x)
const env={OPERATIONS_FOUNDER_EMAILS:'owner@example.test',OPERATIONS_GRANTS_JSON:JSON.stringify([{email:staff,workspaceId:'pocket',roles:['support']},{email:'legal@example.test',workspaceId:'pocket',roles:['legal']},{email:'builder-support@example.test',workspaceId:'builders',roles:['support']}])}
const staffIdentity=()=>({userId:'staff',email:staff})
const verifyStaff=async req=>{authorizeOperations(staffIdentity(),req,'support',undefined,env);return staffIdentity()}
const resolve=createAttachmentResolver(async key=>copy(db.get(key)))
const files=createSupportAttachmentHandler({pocketRead:async()=>copy(store),staff:async()=>staffIdentity(),env:()=>env,read:async key=>copy(db.get(key)),write:async(key,value)=>db.set(key,copy(value)),uuid:()=>String(++n).padStart(8,'0')+'-0000-0000-0000-000000000000'})
const cases=createPocketSupportCasesHandler({verifiedStaff:verifyStaff,store:async()=>copy(store),currentStore:async()=>copy(store),mutateDurableJson:async(_key,fn)=>{store=await fn(copy(store));return copy(store)},resolveCirclePocketIdentity:async()=>viewer,resolveSupportAttachments:resolve,privateCustomerIdentity:async()=>({fullName:'Fixture Customer',email:'fixture@example.test',pocketId:'fixture'}),notifySupportUpdate:async()=>{}})
const typing=createPocketSupportPresenceHandler({staff:verifyStaff,read:async()=>copy(store),now:()=>now,presence:{set:async(id,side,value,time)=>presence.set(id+side,value?time+8000:0),read:async(id,side,time)=>({expiresIn:Math.max(0,(presence.get(id+side)||0)-time)})}})
async function call(handler,method='POST',query={},body={}){const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}};await handler({method,query,body,headers:{}},res);return res}
const id='pcs_fixture_existing';store.cases[id]={id,profileId,status:'open',humanSupport:true,category:'other',priority:'normal',summary:'Existing Pocket conversation',messages:[{id:'user',author:'user',text:'Please help with my payment',createdAt:Date.now()}],createdAt:Date.now(),updatedAt:Date.now()}
for(const rejected of ['legal@example.test','builder-support@example.test']){staff=rejected;assert.equal((await call(files,'POST',{audience:'pocket-staff',workspace:'pocket',caseId:id,name:'staff.txt',mime:'text/plain'},Buffer.from('team'))).code,403);assert.equal((await call(typing,'POST',{workspace:'pocket'},{action:'staff-typing',caseId:id,typing:true})).code,403)}staff='staff@example.test'
const before=copy(store);assert.equal((await call(typing,'POST',{workspace:'pocket'},{action:'staff-typing',caseId:id,typing:true})).code,200);assert.deepEqual(store,before)
const staffFile=await call(files,'POST',{audience:'pocket-staff',workspace:'pocket',caseId:id,name:'staff.txt',mime:'text/plain'},Buffer.from('Team file'));assert.equal(staffFile.code,200)
const reply={action:'staff-reply',caseId:id,message:'',requestId:'pocket-staff-reply-0001',attachments:[staffFile.body.attachment.id]}
const sent=await call(cases,'POST',{workspace:'pocket'},reply);assert.equal(sent.code,200,JSON.stringify(sent.body));assert(sent.body.case.messages.find(m=>m.kind==='staff_joined').avatarDataUrl);const count=sent.body.case.messages.length;await call(cases,'POST',{workspace:'pocket'},reply);assert.equal(store.cases[id].messages.length,count)
const listed=await call(cases,'POST',{}, {action:'list-mine'});assert(!JSON.stringify(listed.body).includes('staffUserId'))
assert.equal((await call(files,'GET',{audience:'pocket-staff',workspace:'pocket',caseId:id,id:staffFile.body.attachment.id})).code,200)
await assert.rejects(()=>resolve([staffFile.body.attachment.id],{uploaderId:'staff',workspaceId:'pocket',caseId:'other-case'}));await assert.rejects(()=>resolve([staffFile.body.attachment.id],{uploaderId:'other-staff',workspaceId:'pocket',caseId:id}))
assert.equal((await call(cases,'GET',{workspace:'pocket',action:'staff-profile'},{displayName:'Not allowed'})).code,405)
store.cases[id].status='resolved';assert.equal((await call(typing,'POST',{workspace:'pocket'}, {action:'staff-presence',caseId:id})).body.expiresIn,0);assert.equal((await call(typing,'POST',{workspace:'pocket'}, {action:'staff-typing',caseId:id,typing:true})).code,409);assert.equal((await call(files,'POST',{audience:'pocket-staff',workspace:'pocket',caseId:id,name:'closed.txt',mime:'text/plain'},Buffer.from('closed'))).code,409)
console.log('PASS admin file upload/download, file-only reply, duplicate retry, profile avatar, public ID privacy, workspace/role/case/uploader isolation, staff presence without case mutation, closed cases and POST-only writes. Synthetic data only; Pocket app unchanged.')

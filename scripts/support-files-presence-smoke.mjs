import assert from 'node:assert/strict'
import {createSupportAttachmentHandler,createAttachmentResolver,validateSupportFile} from '../api/support-attachments.ts'
import {createDeveloperSupportHandler} from '../api/developer-support.ts'
import {createOperationsCasesHandler,BUSINESS_SUPPORT_KEY} from '../api/operations-cases.ts'
const db=new Map(),presence=new Map();let user='builder',staff='staff@example.test',now=100000,n=0
const read=async key=>structuredClone(db.get(key)),write=async(key,value)=>db.set(key,structuredClone(value))
const mutate=async fn=>{const value=fn(await read(BUSINESS_SUPPORT_KEY)||{cases:{}});await write(BUSINESS_SUPPORT_KEY,value);return value}
const env={OPERATIONS_FOUNDER_EMAILS:'owner@example.test',OPERATIONS_GRANTS_JSON:JSON.stringify([{email:staff,workspaceId:'builders',roles:['support']},{email:'legal@example.test',workspaceId:'builders',roles:['legal']}])}
const files=createSupportAttachmentHandler({identity:async()=>({userId:user}),staff:async()=>({userId:'staff-id',email:staff}),env:()=>env,read,write,uuid:()=>String(++n).padStart(8,'0')+'-0000-0000-0000-000000000000',now:()=>now})
const attachments=createAttachmentResolver(read)
const typing={set:async(id,side,on,t)=>presence.set(id+side,on?t+8000:0),read:async(id,side,t)=>({expiresIn:Math.max(0,(presence.get(id+side)||0)-t)})}
const builder=createDeveloperSupportHandler({profiles:async()=>undefined,identity:async()=>({userId:user,email:'builder@example.test'}),read:async()=>await read(BUSINESS_SUPPORT_KEY)||{cases:{}},mutate,attachments,presence:typing,now:()=>now++,uuid:()=>String(++n)})
const avatar='data:image/png;base64,iVBORw0KGgo='
const admin=createOperationsCasesHandler({profiles:async()=>undefined,verify:async()=>({userId:'staff-id',email:staff}),env:()=>env,read:async()=>await read(BUSINESS_SUPPORT_KEY),mutate:async(_w,fn)=>mutate(fn),attachments,presence:typing,staffProfile:async()=>({displayName:'Shy',avatarDataUrl:avatar}),now:()=>now++,uuid:()=>String(++n)})
async function call(handler,method,query={},body){const r={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}};await handler({method,query,body,headers:{}},r);return r}
const uploaded=await call(files,'POST',{name:'details.txt',mime:'text/plain'},Buffer.from('Fixture details only'));assert.equal(uploaded.code,200);const file=uploaded.body.attachment
assert(!JSON.stringify(file).includes('data'));assert.equal((await call(files,'POST',{name:'attack.png',mime:'image/png'},Buffer.from('<script>bad</script>'))).code,400)
assert.throws(()=>validateSupportFile(Buffer.alloc(5*1024*1024+1),'big.txt','text/plain'));assert.throws(()=>validateSupportFile(Buffer.from('hello'),'../private.txt','text/plain'))
assert.equal((await call(builder,'POST',{}, {action:'message',requestId:'attachment-start-000001',message:'',attachments:[file.id],newConversation:true})).code,200)
const stored=await read(BUSINESS_SUPPORT_KEY),id=Object.keys(stored.cases)[0];assert.equal(stored.cases[id].messages[0].attachments[0].name,'details.txt')
const downloaded=await call(files,'GET',{id:file.id,caseId:id});assert.equal(downloaded.code,200);assert.equal(downloaded.body.toString(),'Fixture details only');assert.match(downloaded.headers['Content-Disposition'],/^attachment/)
user='intruder';assert.equal((await call(files,'GET',{id:file.id,caseId:id})).code,404);assert.equal((await call(builder,'POST',{}, {action:'message',requestId:'attachment-foreign-00001',message:'steal',attachments:[file.id],newConversation:true})).code,404);user='builder'
assert.equal((await call(files,'GET',{id:file.id})).code,404)
await call(builder,'POST',{}, {action:'message',caseId:id,requestId:'attachment-human-000001',optionId:'human'})
const before=(await read(BUSINESS_SUPPORT_KEY)).cases[id]
assert.equal((await call(builder,'POST',{}, {action:'typing',caseId:id,typing:true})).code,200)
const peer=await call(admin,'GET',{workspace:'builders',presence:id});assert(peer.body.expiresIn>0)
assert.equal((await call(admin,'POST',{workspace:'builders'}, {action:'typing',caseId:id,typing:true})).code,200);assert((await call(builder,'GET',{presence:id})).body.expiresIn>0)
assert.deepEqual((await read(BUSINESS_SUPPORT_KEY)).cases[id],before,'Typing must not change messages, assignment, revision or audit')
now+=9000;assert.equal((await call(builder,'GET',{presence:id})).body.expiresIn,0)
user='intruder';assert.equal((await call(builder,'GET',{presence:id})).code,404);user='builder'
staff='legal@example.test';assert.equal((await call(admin,'POST',{workspace:'builders'},{action:'typing',caseId:id,typing:true})).code,403);assert.equal((await call(files,'POST',{audience:'staff',workspace:'builders',caseId:id,name:'staff.txt',mime:'text/plain'},Buffer.from('private'))).code,403);staff='staff@example.test'
const staffFile=await call(files,'POST',{audience:'staff',workspace:'builders',caseId:id,name:'staff.txt',mime:'text/plain'},Buffer.from('Team file'));assert.equal(staffFile.code,200)
const reply=await call(admin,'POST',{workspace:'builders'}, {action:'case-reply',caseId:id,updatedAt:before.updatedAt,attachments:[staffFile.body.attachment.id]});assert.equal(reply.code,200)
const join=reply.body.case.messages.find(m=>m.kind==='staff_joined');assert.equal(join.avatarDataUrl,avatar);assert.equal(join.displayName,'Shy')
assert.equal((await call(files,'GET',{id:staffFile.body.attachment.id,caseId:id})).body.toString(),'Team file')
assert.equal((await call(files,'GET',{audience:'staff',workspace:'builders',id:file.id,caseId:id})).code,200)
const final=await read(BUSINESS_SUPPORT_KEY);final.cases[id].status='resolved';await write(BUSINESS_SUPPORT_KEY,final)
assert.equal((await call(builder,'POST',{}, {action:'typing',caseId:id,typing:true})).code,409);assert.equal((await call(admin,'GET',{workspace:'builders',presence:id})).body.expiresIn,0)
console.log('PASS private file uploads/downloads, file-only messages, both directions, MIME/size/name rejection, cross-account rejection, staff permissions, typing TTL and isolation, unchanged history/revision, closed-case behavior and joined avatar. Fixtures only.')

assert.equal(validateSupportFile(Buffer.from('%PDF-1.7\n%%EOF'),'receipt.pdf','application/pdf').mime,'application/pdf');assert.throws(()=>validateSupportFile(Buffer.from('<svg/>'),'image.svg','image/svg+xml'));
await assert.rejects(()=>attachments([file.id,file.id],{uploaderId:'builder'}));await assert.rejects(()=>attachments(Array(4).fill(file.id),{uploaderId:'builder'}));
const denied=createSupportAttachmentHandler({identity:async()=>{throw Object.assign(Error('Sign in'),{status:401})},read:async()=>{throw Error('Unauthenticated storage read')}});assert.equal((await call(denied,'GET',{id:file.id,caseId:id})).code,401);
console.log('PASS PDF support, active image format rejection, attachment count/duplicate validation and authentication before file reads.');

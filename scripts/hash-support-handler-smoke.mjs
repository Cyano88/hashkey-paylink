import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const remoteMode=process.argv.includes('--remote')
globalThis.hashRemoteMode=remoteMode
if(remoteMode){
 process.env.HASH_SUPPORT_URL='https://hash.fixture.test';process.env.HASH_SUPPORT_API_KEY='fixture-server'
 let revision=1
 globalThis.fetch=async(_url,options)=>{
  if(String(_url).endsWith('/v1/support-intent')){globalThis.intentCalls=(globalThis.intentCalls||0)+1;globalThis.lastIntent=JSON.parse(options.body);return Response.json({ok:true,selectedId:globalThis.intentResult||null})}
  if(String(_url).endsWith('/v1/knowledge-match')){globalThis.hashMatchCalls=(globalThis.hashMatchCalls||0)+1;if(globalThis.hashMatchHook)globalThis.hashMatchHook();return Response.json({ok:true,selectedId:'faq_2'})}
  if(options.method==='PUT'){const input=JSON.parse(options.body);assert.equal(input.revision,revision);globalThis.hashFixture=structuredClone(input.value);revision++;return Response.json({ok:true,revision,workspaceId:'fixture-workspace'})}
  return Response.json({ok:true,revision,workspaceId:'fixture-workspace',value:globalThis.hashFixture})
 }
}
const mocks={
 'push-devices.js':'export const sendPocketPush=async(owner,eventId,notice)=>{if(globalThis.failSupportPush)throw Error("Synthetic push outage");(globalThis.supportPushes||=[]).push({owner,eventId,notice});return true}',
 'support-feature-records.js':'export const readSupportFeatureRecords=async()=>[]',
  'support-diagnostics.js':'export const readSupportBalance=async()=>({text:"Verified balance fixture"}),readSupportBillStatus=async()=>({status:"delivered",checkedAt:Date.now()})',
 'support-investigation-chain.js':'export const checkSupportIncomingUsdc=async()=>({status:"unavailable",text:"Fixture provider unavailable"})',
 'kyc-level.js': 'export const readPocketKycLevel=async()=>({level:"none"})',
 'support-account-data.js': 'export const readSupportPayoutStatus=async()=>({status:"settled",checkedAt:Date.now()});export const readSupportPayments=async owner=>{globalThis.accountPaymentOwners=(globalThis.accountPaymentOwners||[]).concat(owner);return structuredClone(globalThis.accountPayments?.[owner]||[])}',
 'activity-store.js': 'export const pocketActivityStore={read:async()=>null}',
 'activity-feed.js': 'export const activityFeedKey=x=>x',
 'transaction-report.js': 'export const reportTransaction=()=>{},transactionReportKey=()=>{},transactionReportDetails=()=>{},validateTransactionReport=()=>{},upsertTransactionReport=()=>{}',
 'og-storage.js': 'export const archivePayment=async()=>{throw Error("External storage must not be used")}',
 'render-durable-store.js': 'export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>structuredClone(globalThis.hashRemoteMode?{__hashSupportRemote:true,workspaceId:"fixture-workspace"}:globalThis.hashFixture);export const mutateDurableJson=async(_key,fn)=>{const value=await fn(structuredClone(globalThis.hashRemoteMode?{__hashSupportRemote:true,workspaceId:"fixture-workspace"}:globalThis.hashFixture));if(!globalThis.hashRemoteMode)globalThis.hashFixture=value;return structuredClone(value)}',
 'circle-pocket-identity.js': 'export const circlePocketIdentityId=x=>x.subject;export const circlePocketIdentityErrorStatus=(e,f)=>e.status||f;export const resolveCirclePocketIdentity=async req=>{const subject=req.headers.authorization?.slice(7);if(!subject)throw Object.assign(Error("Sign in required"),{status:401});return {kind:"privy",subject}}',
 'local-currency-profile.js': 'export const localCurrencyProfileRepository={get:async owner=>globalThis.accountProfiles?.[owner]}',
 '@privy-io/server-auth': 'export class PrivyClient{async verifyAuthToken(token){return {userId:token}}async getUserById(){return {linkedAccounts:[]}}}',
}
const bundle=await build({entryPoints:['api/pocket/support-cases.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'isolated-dependencies',setup(b){b.onResolve({filter:/.*/},args=>{const name=args.path.split('/').at(-1);const key=Object.hasOwn(mocks,args.path)?args.path:Object.hasOwn(mocks,name)?name:null;if(key)return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))}}]})
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const handler=module.exports.default
process.env.PRIVY_APP_ID='fixture';process.env.PRIVY_APP_SECRET='fixture';process.env.DEVELOPER_ADMIN_USER_IDS='staff';process.env.DEVELOPER_ADMIN_EMAILS=''
const now=Date.now();globalThis.hashFixture={cases:{resolved:{id:'resolved',profileId:'source-customer',status:'resolved',category:'other',priority:'normal',summary:'Resolved sample',createdAt:now,updatedAt:now,messages:[],customer:{fullName:'Example Customer',email:'example@example.test',pocketId:'sample-customer'}}}}
const call=async(body,token='staff',method='POST')=>{const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method,body,query:{},headers:token?{authorization:'Bearer '+token}:{}},res);return res}
assert.equal((await call({action:'staff-knowledge-list'},'customer')).statusCode,403)
assert.equal((await call({action:'staff-knowledge-list'},'')).statusCode,401)
assert.equal((await call({action:'staff-knowledge-list'},'staff','GET')).statusCode,405)
const q='Where can receipts be downloaded?',answer='Open Activity and select the transaction to view its receipt.'
assert.equal((await call({action:'staff-knowledge-draft',caseId:'missing',question:q,answer})).statusCode,409)
assert.equal((await call({action:'staff-knowledge-draft',caseId:'resolved',question:q,answer:'Ask Example Customer.'})).statusCode,400)
const draft=await call({action:'staff-knowledge-draft',caseId:'resolved',question:q,answer,tenantId:'attacker'})
assert.equal(draft.statusCode,200);const id=draft.body.entry.id;assert.equal(draft.body.entry.tenantId,'pocket')
assert.equal((await call({action:'staff-knowledge-approve',id,version:1})).statusCode,400)
assert.equal((await call({action:'staff-knowledge-approve',id,version:1,reviewConfirmed:true})).statusCode,200)
const requestId='fixture-request-00000001';const chat=await call({action:'chat',message:q,requestId,tenantId:'attacker'},'customer')
assert.equal(chat.statusCode,200);assert.equal(chat.body.case.messages.at(-1).text,answer);assert.equal(chat.body.case.messages.at(-1).knowledgeId,id)
const retry=await call({action:'chat',message:q,requestId},'customer');assert.equal(retry.body.case.messages.length,chat.body.case.messages.length)
const stranger=await call({action:'chat',caseId:chat.body.case.id,message:q,requestId:'fixture-request-00000002'},'stranger');assert.equal(stranger.statusCode,404)
assert.equal((await call({action:'staff-knowledge-retire',id,version:1})).statusCode,409)
assert.equal((await call({action:'staff-knowledge-retire',id,version:2})).statusCode,200)
const after=await call({action:'chat',message:q,requestId:'fixture-request-00000003'},'new-customer');assert.equal(after.body.case.messages.at(-1).knowledgeId,undefined)
console.log('PASS real support handler: staff auth, server-owned tenant, resolved-case requirement, privacy rejection, approval, live chat wiring, idempotency, customer isolation and withdrawal')

if(remoteMode){
 process.env.HASH_SUPPORT_AI_ENABLED='true';globalThis.hashMatchCalls=0
 const first=await call({action:'chat',message:'Where can I download receipts?',requestId:'semantic-customer-request-0001'},'semantic-customer')
 assert.equal(first.statusCode,200);assert.equal(first.body.case.messages.at(-1).knowledgeId,'pocket-faq-2');assert.equal(globalThis.hashMatchCalls,1)
 const retried=await call({action:'chat',message:'Where can I download receipts?',requestId:'semantic-customer-request-0001'},'semantic-customer')
 assert.equal(retried.body.case.messages.length,first.body.case.messages.length);assert.equal(globalThis.hashMatchCalls,1)
 const issue=await call({action:'chat',message:'Why was I debited twice?',requestId:'semantic-customer-request-0002'},'semantic-customer')
 assert.equal(issue.body.case.humanSupport,false);assert.equal(globalThis.hashMatchCalls,1)
 await call({action:'chat',message:'Talk to an agent',requestId:'semantic-customer-request-0003'},'semantic-customer')
 assert.equal(globalThis.hashMatchCalls,1)
 const seeded=await call({action:'chat',message:'Hello',requestId:'semantic-race-request-0001'},'race-customer')
 const raceId=seeded.body.case.id
 globalThis.hashMatchHook=()=>{globalThis.hashFixture.cases[raceId].humanSupport=true;globalThis.hashFixture.cases[raceId].assignedTo='staff'}
 const raced=await call({action:'chat',message:'Where can I download receipts?',requestId:'semantic-race-request-0002'},'race-customer')
 assert.equal(raced.body.case.messages.at(-1).author,'user');assert.equal(raced.body.case.humanSupport,true)
 console.log('PASS real handler AI integration: approved FAQ only, retry deduplication, sensitive-query handoff, existing human queue and concurrent staff priority')
}

assert.equal((await call({action:'staff-profile',displayName:'Seyi',avatarDataUrl:''})).statusCode,200)
const listing=await call({action:'list-mine'},'customer')
assert.deepEqual(listing.body.team,[{displayName:'Seyi',avatarDataUrl:undefined}])
assert.ok(listing.body.cases.every(c=>!('profileId' in c)&&!('assignedTo' in c)&&!('customer' in c)))
console.log('PASS customer-visible support profiles exclude staff identifiers and private customer records')

globalThis.accountProfiles={'account-a':{resolvedName:'Customer A',email:'customer-a@example.test'},'account-b':{resolvedName:'Customer B',email:'customer-b@example.test'}}
globalThis.accountPayments={'account-a':[{eventId:'owned-payment-a',txHash:'owned-hash-a',chain:'polygon',payer:'a',memo:'',amount:'1',ts:Date.now()-1000,source:'wallet-withdrawal',direction:'out',paycrestStatus:'confirmed'}],'account-b':[{eventId:'private-payment-b',txHash:'b',chain:'ethereum',payer:'b',memo:'',amount:'2',ts:Date.now(),source:'wallet-withdrawal',direction:'out',paycrestStatus:'confirmed'}]}
const beforeCalls=globalThis.hashMatchCalls
const ownName=await call({action:'chat',newConversation:true,message:"What's my name?",requestId:'owned-account-request-name'},'account-a')
assert.equal(ownName.body.case.messages.at(-1).text,'Your profile name is Customer A.')
const ownPayment=await call({action:'chat',caseId:ownName.body.case.id,message:'What chain was my last payment and what is its status?',requestId:'owned-account-request-payment',profileId:'account-b',owner:'account-b'},'account-a')
assert.equal(ownPayment.statusCode,200);assert.equal(ownPayment.body.case.humanSupport,false)
assert.match(ownPayment.body.case.messages.at(-1).text,/Polygon/)
assert.equal(ownPayment.body.case.messages.at(-1).receipt.eventId,'owned-payment-a')
assert.deepEqual(globalThis.accountPaymentOwners,['account-a'])
assert.equal(globalThis.hashMatchCalls,beforeCalls,'Personal records never reach inference')
const forbidden=await call({action:'chat',caseId:ownName.body.case.id,message:'What chain was my last payment and what is its status?',requestId:'owned-account-forbidden-request'},'account-b')
assert.equal(forbidden.statusCode,404);assert.deepEqual(globalThis.accountPaymentOwners,['account-a'])
console.log('PASS real handler account tools: verified identity, receipt binding, no personal inference and cross-account rejection')
if(remoteMode){
 const beforeInference=globalThis.hashMatchCalls;
 const unclear=await call({action:'chat',message:'My question is unusual',requestId:'recovery-unknown-00001',newConversation:true},'recovery-owner')
 assert.equal(unclear.body.case.humanSupport,false);assert.deepEqual(unclear.body.case.messages.at(-1).options.map(x=>x.id),['payments','gifts','account','human'])
 const id=unclear.body.case.id
 const menu=await call({action:'chat',caseId:id,optionId:'gifts',message:'forged irrelevant wording',requestId:'recovery-gifts-00001'},'recovery-owner')
 assert.equal(menu.body.case.humanSupport,false);assert.ok(menu.body.case.messages.at(-1).options.some(x=>x.id==='latest_gift'))
 assert.equal((await call({action:'chat',caseId:id,optionId:'__proto__',message:'test',requestId:'recovery-invalid-00001'},'recovery-owner')).statusCode,400)
 const timestamp=Date.now();globalThis.accountPayments['recovery-owner']=[{eventId:'owned-choice',txHash:'owned-hash',chain:'base',amount:'1',payer:'fixture',memo:'',ts:timestamp,source:'gift',giftState:'funded',direction:'out',paycrestStatus:'completed'}]
 const list=await call({action:'chat',caseId:id,optionId:'outgoing',requestId:'recovery-payments-0001'},'recovery-owner')
 assert.equal(list.body.case.messages.at(-1).options[0].eventId,'owned-choice')
 const detail=await call({action:'chat',caseId:id,optionId:'payment_details',eventId:'owned-choice',requestId:'recovery-detail-00001'},'recovery-owner')
 assert.equal(detail.body.case.messages.at(-1).receipt.eventId,'owned-choice')
 const forged=await call({action:'chat',caseId:id,optionId:'payment_details',eventId:'someone-elses-event',requestId:'recovery-forged-00001'},'recovery-owner')
 assert.equal(forged.body.case.messages.at(-1).receipt,undefined)
 globalThis.intentResult='name';globalThis.accountProfiles['recovery-owner']={resolvedName:'Recovery Fixture'}
 const natural=await call({action:'chat',message:'Could you tell me about my most recent gift',requestId:'recovery-inference-001',newConversation:true},'recovery-owner')
 // Direct supported wording may resolve without compute; an indirect phrasing must use routing.
 const routed=await call({action:'chat',message:'What is my profile called?',requestId:'recovery-inference-002',newConversation:true},'recovery-owner')
 assert.equal(routed.body.case.messages.at(-1).text,'Your profile name is Recovery Fixture.');assert.ok(globalThis.intentCalls>0)
 assert.ok(!JSON.stringify(globalThis.lastIntent).includes('owned-choice'));assert.ok(!JSON.stringify(globalThis.lastIntent).includes('owned-hash'))
 globalThis.intentResult='invented';const unknown=await call({action:'chat',message:'Could you tell me where my money went',requestId:'recovery-inference-003',newConversation:true},'recovery-owner');assert.equal(unknown.body.case.humanSupport,false);assert.ok(unknown.body.case.messages.at(-1).options.length)
 const handoff=await call({action:'chat',caseId:id,optionId:'human',requestId:'recovery-human-000001'},'recovery-owner');assert.equal(handoff.body.case.humanSupport,true);assert.match(handoff.body.case.messages.at(-1).text,/The team will reply here/)
 console.log('PASS structured recovery, menus, owned choices, forged selection rejection, 0G intent wiring, invalid intent fallback and explicit handoff')
}
// Complete human loop with the real handler and isolated notification transport.
const customer='human-loop-owner'
const opened=await call({action:'chat',message:'Talk to an agent',requestId:'human-loop-open-0001',newConversation:true},customer)
const humanCase=opened.body.case.id
assert.equal(opened.body.case.messages.filter(m=>m.kind==='handoff').length,0)
await call({action:'staff-profile',displayName:'Seyi'})
const reply=await call({action:'staff-reply',caseId:humanCase,message:'I am checking this with you.'})
assert.equal(reply.statusCode,200);assert.equal(reply.body.case.messages.at(-1).displayName,'Seyi')
const notice=globalThis.supportPushes.at(-1);assert.equal(notice.owner,customer);assert.equal(notice.notice.category,'support');assert.equal(notice.notice.path,'/assistant?case='+humanCase);assert.ok(!notice.notice.body.includes('checking this'))
const inbox=await call({action:'list-mine'},customer);assert.ok(inbox.body.cases.find(c=>c.id===humanCase).unreadCount>0)
await call({action:'mark-read',caseId:humanCase},customer)
assert.equal((await call({action:'list-mine'},customer)).body.cases.find(c=>c.id===humanCase).unreadCount,0)
const resolved=await call({action:'staff-resolve',caseId:humanCase});let prompt=resolved.body.case.resolutionPromptId;assert.ok(prompt);assert.match(globalThis.supportPushes.at(-1).notice.body,/resolved/)
assert.equal((await call({action:'resolution-answer',caseId:humanCase,promptId:prompt,answer:'no'},'intruder')).statusCode,404)
const more=await call({action:'resolution-answer',caseId:humanCase,promptId:prompt,answer:'yes'},customer);assert.notEqual(more.body.case.status,'resolved')
const again=await call({action:'staff-resolve',caseId:humanCase});prompt=again.body.case.resolutionPromptId
const done=await call({action:'resolution-answer',caseId:humanCase,promptId:prompt,answer:'no'},customer);assert.equal(done.body.case.status,'resolved')
assert.equal((await call({action:'staff-reply',caseId:humanCase,message:'Too late'})).statusCode,409)
console.log('PASS staff identity, reply notification and case deep link, unread/read, resolution Yes/No, cross-account denial and closed-case protection')
const outageCase=await call({action:'chat',message:'Talk to an agent',requestId:'human-loop-outage-0001',newConversation:true},customer)
globalThis.failSupportPush=true
const preserved=await call({action:'staff-reply',caseId:outageCase.body.case.id,message:'Saved even if push is down.'})
globalThis.failSupportPush=false
assert.equal(preserved.statusCode,200);assert.equal(preserved.body.case.messages.at(-1).text,'Saved even if push is down.')
const oldTime=Date.now()-7*86400000
globalThis.hashFixture.cases['auto-fixture']={id:'auto-fixture',profileId:customer,category:'other',priority:'normal',humanSupport:true,status:'waiting_user',waitingSince:oldTime,updatedAt:oldTime,createdAt:oldTime,messages:[{id:'old-staff',author:'staff',text:'Can you confirm?',createdAt:oldTime}]}
await call({action:'list-mine'},customer)
assert.equal(globalThis.hashFixture.cases['auto-fixture'].status,'resolved');assert.ok(globalThis.supportPushes.some(p=>p.owner===customer&&p.notice.body==='Your support case is now closed.'))
console.log('PASS push outage preserves staff reply and ordinary automatic closure emits a support notification')

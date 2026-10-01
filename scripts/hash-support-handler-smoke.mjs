import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const remoteMode=process.argv.includes('--remote')
globalThis.hashRemoteMode=remoteMode
if(remoteMode){
 process.env.HASH_SUPPORT_URL='https://hash.fixture.test';process.env.HASH_SUPPORT_API_KEY='fixture-server'
 let revision=1
 globalThis.fetch=async(_url,options)=>{
  if(options.method==='PUT'){const input=JSON.parse(options.body);assert.equal(input.revision,revision);globalThis.hashFixture=structuredClone(input.value);revision++;return Response.json({ok:true,revision,workspaceId:'fixture-workspace'})}
  return Response.json({ok:true,revision,workspaceId:'fixture-workspace',value:globalThis.hashFixture})
 }
}
const mocks={
 'kyc-level.js': 'export const readPocketKycLevel=async()=>({level:"none"})',
 'activity-store.js': 'export const pocketActivityStore={read:async()=>null}',
 'activity-feed.js': 'export const activityFeedKey=x=>x',
 'transaction-report.js': 'export const reportTransaction=()=>{},transactionReportKey=()=>{},transactionReportDetails=()=>{},validateTransactionReport=()=>{},upsertTransactionReport=()=>{}',
 'og-storage.js': 'export const archivePayment=async()=>{throw Error("External storage must not be used")}',
 'render-durable-store.js': 'export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>structuredClone(globalThis.hashRemoteMode?{__hashSupportRemote:true,workspaceId:"fixture-workspace"}:globalThis.hashFixture);export const mutateDurableJson=async(_key,fn)=>{const value=await fn(structuredClone(globalThis.hashRemoteMode?{__hashSupportRemote:true,workspaceId:"fixture-workspace"}:globalThis.hashFixture));if(!globalThis.hashRemoteMode)globalThis.hashFixture=value;return structuredClone(value)}',
 'circle-pocket-identity.js': 'export const circlePocketIdentityId=x=>x.subject;export const circlePocketIdentityErrorStatus=(e,f)=>e.status||f;export const resolveCirclePocketIdentity=async req=>{const subject=req.headers.authorization?.slice(7);if(!subject)throw Object.assign(Error("Sign in required"),{status:401});return {kind:"privy",subject}}',
 'local-currency-profile.js': 'export const localCurrencyProfileRepository={get:async()=>undefined}',
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

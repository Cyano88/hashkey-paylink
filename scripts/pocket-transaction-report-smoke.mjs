import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
const row={eventId:'fixture-order',txHash:'0x'+'a'.repeat(64),chain:'base',payer:'fixture-payer',recipient:'fixture-recipient',amount:'2.5',amountNgn:'3000',ts:12345,source:'bank-withdraw',bankOrderId:'provider-fixture',paycrestStatus:'expired'}
const state={cases:undefined,tail:Promise.resolve(),feeds:{alice:{version:1,sources:{bank:{snapshot:{payments:[row]}}}},bob:{version:1,sources:{bank:{snapshot:{payments:[]}}}}}};globalThis.__reportFixture=state
const mocks={
 'render-durable-store':`export const readDurableJson=async()=>structuredClone(globalThis.__reportFixture.cases);export const mutateDurableJson=async(key,update)=>{const state=globalThis.__reportFixture;const work=state.tail.then(async()=>{state.cases=await update(structuredClone(state.cases));return structuredClone(state.cases)});state.tail=work.catch(()=>{});return work};`,
 'activity-store':`export const pocketActivityStore={read:async key=>structuredClone(globalThis.__reportFixture.feeds[key])};`,
 'activity-feed':`export const activityFeedKey=owner=>owner;`,
 'circle-pocket-identity':`export const resolveCirclePocketIdentity=async req=>{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)throw Object.assign(Error('unauthorized'),{status:401});return {kind:'privy',subject:token,storageKey:'privy:'+token}};export const circlePocketIdentityId=i=>i.subject;export const circlePocketIdentityErrorStatus=(e,f)=>e.status||f;`,
 'local-currency-profile':`export const localCurrencyProfileRepository={get:async()=>({resolvedName:'Fixture',email:'fixture@example.invalid',pocketId:'fixture'})};`,
 'og-storage':`export const archivePayment=()=>{throw Error('Unexpected external archive')};`,
 '@privy-io/server-auth':`export class PrivyClient {async verifyAuthToken(token){return {userId:token}} async getUserById(){return {linkedAccounts:[]}}}`,
}
await mkdir('.codex-temp',{recursive:true});const output='.codex-temp/transaction-report-handler.cjs'
await build({entryPoints:['api/pocket/support-cases.ts'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},args=>{const key=Object.keys(mocks).find(key=>args.path===key||args.path.endsWith('/'+key+'.js'));if(key)return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))}}]})
const {default:module}=await import('../'+output);const handler=module.default
const request=async(owner,body)=>{const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{authorization:owner?'Bearer '+owner:''},body,query:{}},res);return res}
const transaction={chain:row.chain,eventId:row.eventId,txHash:row.txHash};const body={action:'transaction-report',transaction,reason:'money_not_received',description:'The recipient has not received this payment.',amount:'999999',status:'successful'}
assert.equal((await request('',body)).code,401);assert.equal((await request('bob',body)).code,404)
assert.equal((await request('alice',{...body,description:'short'})).code,400)
assert.equal((await request('alice',{...body,reason:'invented'})).code,400)
const pair=await Promise.all([request('alice',body),request('alice',body)]);assert.deepEqual(pair.map(x=>x.code).sort(),[200,201]);assert.equal(pair[0].body.case.id,pair[1].body.case.id)
const saved=pair[0].body.case;assert.equal(saved.transaction.amountUsdc,'2.5');assert.equal(saved.transaction.status,'payout incomplete');assert.equal(saved.priority,'high');assert.equal(saved.messages[0].text.includes(body.description),true);assert.equal(Object.keys(state.cases.cases).length,1)
assert.equal((await request('alice',{action:'transaction-report-status',transaction})).body.case.id,saved.id)
assert.equal((await request('bob',{action:'reply',caseId:saved.id,message:'Unauthorized reply'})).code,404)
const restarted=await request('alice',{action:'list-mine'});assert.equal(restarted.body.cases[0].transaction.providerReference,'provider-fixture')
process.env.PRIVY_APP_ID='fixture';process.env.PRIVY_APP_SECRET='fixture';process.env.DEVELOPER_ADMIN_USER_IDS='fixture-staff';assert.equal((await request('alice',{action:'staff-list'})).code,403);const staff=await request('fixture-staff',{action:'staff-list'});assert.equal(staff.body.cases[0].transaction.amountUsdc,'2.5');assert.equal((await request('fixture-staff',{action:'staff-reply',caseId:saved.id,message:'We are reviewing this transaction.'})).code,200);assert.equal((await request('alice',{action:'list-mine'})).body.cases[0].messages.at(-1).author,'staff');await request('fixture-staff',{action:'staff-resolve',caseId:saved.id});assert.equal((await request('alice',body)).code,201)
console.log('PASS report authentication, owner isolation, input validation, server-owned evidence, atomic duplicate prevention, persistence, exact case lookup, reply isolation and new report after resolution.')

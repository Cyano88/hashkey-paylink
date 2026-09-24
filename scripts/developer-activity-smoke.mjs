import assert from 'node:assert/strict'
import { projectActivitySnapshots, projectActivityChanges, projectActivityKey } from '../api/developer-activity-events.ts'
import { activityQuery } from '../api/developer-activity-store.ts'
import { createDeveloperProjectsHandler } from '../api/developer-projects.ts'

const projectId='dev_activity12345678', createdAt='2026-09-24T12:00:00.000Z'
const checkout={id:'chk_1234567890',partnerId:projectId,createdAt,amount:'10',network:'arc',arcMainnetChainId:5042,memo:'private memo',payerEmail:'private@example.test',integrity:'private-signature',apiKey:'private-key',paymentAttempts:[{id:'attempt_1',createdAt,updatedAt:createdAt,status:'pending'}]}
const initial={checkouts:{[checkout.id]:checkout}}
const paid={checkouts:{[checkout.id]:{...checkout,payment:{status:'paid',confirmedAt:createdAt,amount:'10',network:'arc',arcMainnetChainId:5042,txHash:'0x'+'1'.repeat(64),referenceType:'evm_tx_hash'}}}}
const entries=projectActivityChanges('checkout',initial,paid)
assert(entries.some(e=>e.event==='payment.paid'))
assert.equal(projectActivityChanges('checkout',paid,structuredClone(paid)).length,0)
assert(projectActivityChanges('checkout',paid,{checkouts:{}}).some(e=>e.event==='payment.paid'),'pruning must archive last available state')
assert(!JSON.stringify(entries).includes('private'))
assert.equal(projectActivityKey(entries[0]),projectActivityKey({...entries[0],occurredAt:'2026-09-25T12:00:00.000Z'}),'repeated observations must deduplicate')
assert.notEqual(projectActivityKey(entries[0]),projectActivityKey({...entries[0],environment:'test'}))
assert.notEqual(projectActivityKey(entries[0]),projectActivityKey({...entries[0],projectId:'dev_other12345678'}))
assert.throws(()=>projectActivitySnapshots('checkout',{checkouts:{x:{...checkout,environment:'test'}}}),/only supports live/)
assert.equal(projectActivitySnapshots('checkout',{checkouts:{x:{...checkout,arcMainnetChainId:undefined}}}).length,0,'retired Arc must not become live history')
const draft=projectActivitySnapshots('agreement',{agreements:{a:{id:'agr_123456789012',partnerId:projectId,createdAt,amount:'10',network:'arc',arcMainnetChainId:5042,environment:'live',payerAccessHash:'secret'}}})
assert.equal(draft[0].event,'agreement.draft_created');assert.equal(draft[0].details.evidence,'draft_only')
const agreement=projectActivitySnapshots('agreement_event',{events:{e:{id:'evt_123',partnerId:projectId,agreementId:'agr_123456789012',event:'agreement.refunded',createdAt,data:{chainId:5042,observedBlockNumber:'42',unreleasedAmountUsdcUnits:'10000000',payerAccessToken:'secret'}}}})
assert.equal(agreement[0].details.evidence,'reconciled_chain_snapshot');assert(!JSON.stringify(agreement).includes('secret'))
const funding=projectActivitySnapshots('funding',{records:{f:{id:'pmf_123',partnerId:projectId,createdAt,amount:'10',networks:['base'],checkoutId:checkout.id,observation:{status:'bridging',paymentStatus:'paid',observedAt:createdAt}}}})
assert.equal(funding.length,2)
assert(!funding.some(e=>e.event==='funding.funded'))
assert.equal(activityQuery({projectId,environment:'test',cursor:'42',limit:2}).values[1],'test')
for(const input of [{cursor:'0'},{cursor:'-1'},{cursor:'1 OR 1=1'},{limit:101},{environment:'staging'},{recordId:"x' OR true"}]) assert.throws(()=>activityQuery({projectId,environment:'live',...input}))

let owner='owner',calls=0,lastQuery
const handler=createDeveloperProjectsHandler({hasStore:()=>true,portalSecret:()=> 'x'.repeat(40),verify:async()=>({userId:owner,email:'owner@example.test'}),read:async()=>({projects:{[projectId]:{id:projectId,ownerId:'owner'}}}),activity:async query=>{calls++;lastQuery=query;return{events:[],nextCursor:null,coverage:'test'}}})
async function request(query){const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'GET',query,headers:{}},res);return res}
assert.equal((await request({resource:'activity',projectId,environment:'live'})).code,200)
assert.equal(lastQuery.projectId,projectId)
owner='other';assert.equal((await request({resource:'activity',projectId,environment:'live'})).code,404);assert.equal(calls,1)
owner='owner';assert.equal((await request({resource:'activity',projectId,environment:'invalid'})).code,400);assert.equal(calls,1)
console.log('Activity projection, privacy, replay, pruning, environment boundaries and owner authorization passed.')

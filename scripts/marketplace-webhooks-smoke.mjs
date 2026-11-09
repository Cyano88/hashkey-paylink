import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {buildDeveloperWebhookRequest} from '../api/developer-projects.ts'
let now=1000000,queue=Promise.resolve(),failCommit=false,calls=[],secret='test_webhook_secret',mode='success'
const event=(id,projectId='project_a',paymentId='payment_one')=>({id,type:'marketplace.payout.settled',projectId,paymentId,operationId:'operation_one',asset:'USDC',currency:'NGN',debitUnits:'10000000',ngnPaidMinor:'1500000',createdAt:now,delivery:'pending'})
const book=(projectId,paymentId,events)=>({plan:{projectId,paymentId},balances:[{paid:'10000000'}],operations:[{status:'settled'}],bankEvents:events})
let stored={books:[book('project_a','payment_one',[event('event_one'),event('event_retry'),event('event_late'),event('event_crash')]),book('project_b','payment_other',[event('event_other','project_b','payment_other')])],drafts:[]}
let customNotify
const deps={now:()=>now,read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored));if(failCommit)throw Error('fixture commit failure');stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job},notifyMarketplace:async(projectId,type,data,delivery)=>{
 const signed=buildDeveloperWebhookRequest(secret,type,data,{...delivery,attemptedAt:new Date(now).toISOString()})
 calls.push({projectId,data,signed})
 assert.equal(signed.signature,createHmac('sha256',secret).update(signed.timestamp+'.'+signed.payload).digest('hex'))
 if(customNotify)return customNotify(delivery)
 if(mode==='throw')throw Error('secret-do-not-persist')
 if(mode==='skipped')return {status:'skipped',reason:'webhook_unconfigured'}
 if(mode==='wrong_event')return {status:'sent',eventId:'wrong_event',responseStatus:200}
 return {status:'sent',eventId:delivery.eventId,responseStatus:mode==='failure'?500:204}
}}
let repo=createMarketplaceRepository(deps)
const send=id=>repo.webhooks.deliver('project_a','payment_one',id)
await assert.rejects(()=>createMarketplaceRepository({...deps,notifyMarketplace:undefined}).webhooks.deliver('project_a','payment_one','event_one'),/not configured/)
assert.equal(stored.books[0].bankEvents[0].attempts,undefined)
assert.deepEqual(await repo.webhooks.pending('project_b'),[{paymentId:'payment_other',eventId:'event_other'}])
await assert.rejects(()=>repo.webhooks.deliver('project_b','payment_one','event_one'),/not found/)
assert.equal(calls.length,0)
const results=await Promise.all([send('event_one'),send('event_one')])
assert.equal(calls.length,1)
assert.equal(stored.books[0].bankEvents[0].delivery,'delivered')
await send('event_one');assert.equal(calls.length,1)
mode='failure'
await send('event_retry')
const first=calls.at(-1).signed
const retry=()=>stored.books[0].bankEvents.find(e=>e.id==='event_retry')
assert.equal(retry().delivery,'pending');assert.equal(retry().attempts,1)
const count=calls.length
await send('event_retry');assert.equal(calls.length,count,'backoff suppresses early retries')
now=retry().nextAttemptAt;secret='rotated_test_secret';mode='success'
await send('event_retry')
assert.equal(first.payload,calls.at(-1).signed.payload,'body/event ID stay stable through retry and key rotation')
assert.notEqual(first.signature,calls.at(-1).signed.signature)
// First worker stalls; another worker takes its expired lease and succeeds.
let unblock,entered
const started=new Promise(resolve=>entered=resolve)
customNotify=delivery=>new Promise(resolve=>{unblock=()=>resolve({status:'sent',eventId:delivery.eventId,responseStatus:500});entered()})
const late=send('event_late');await started
now+=60001;customNotify=undefined
await send('event_late');unblock();await late
const lateEvent=stored.books[0].bankEvents.find(e=>e.id==='event_late')
assert.equal(lateEvent.delivery,'delivered');assert.equal(lateEvent.attempts,2)
assert.equal(lateEvent.deliveryAttempts[1].result,'delivered')
// Remote success followed by lost local commit: retry has the same event, not a new payment.
customNotify=delivery=>{failCommit=true;return {status:'sent',eventId:delivery.eventId,responseStatus:200}}
await assert.rejects(()=>send('event_crash'),/commit failure/)
const crashedPayload=calls.at(-1).signed.payload
failCommit=false;customNotify=undefined;now+=60001;repo=createMarketplaceRepository(deps)
await send('event_crash')
assert.equal(calls.at(-1).signed.payload,crashedPayload)
stored.books[0].bankEvents.push(event('event_dead'))
for(let attempt=1;attempt<=8;attempt++){
 mode=['throw','skipped','wrong_event','failure'][(attempt-1)%4]
 await send('event_dead')
 const dead=stored.books[0].bankEvents.at(-1)
 assert.equal(dead.attempts,attempt)
 if(attempt<8){assert.equal(dead.delivery,'pending');now=dead.nextAttemptAt}else assert.equal(dead.delivery,'dead')
}
const finalCount=calls.length
await send('event_dead');assert.equal(calls.length,finalCount)
assert.equal(JSON.stringify(stored).includes('secret-do-not-persist'),false)
assert.equal(JSON.stringify(stored).includes('test_webhook_secret'),false)
assert.deepEqual(stored.books[0].balances,[{paid:'10000000'}]);assert.deepEqual(stored.books[0].operations,[{status:'settled'}])
assert.equal(stored.books[1].bankEvents[0].delivery,'pending')
assert.deepEqual(Object.keys(calls[0].data).sort(),['projectId','paymentId','operationId','asset','currency','debitUnits','ngnPaidMinor'].sort())
console.log('PASS marketplace webhooks: default-off transport, project isolation, signed stable bodies, concurrency, backoff, key rotation, stale-worker fencing, restart after lost acknowledgement, capped retries, secret exclusion and unchanged payment state. Injected transport only; no network calls.')

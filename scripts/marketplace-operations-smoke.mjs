import assert from 'node:assert/strict'
import {createMarketplaceOperationsHandler} from '../api/marketplace/operations.ts'
let founder=false,reads=0,state={books:[{plan:{projectId:'project_a',paymentId:'payment_a'},operations:[],walletEvents:[{id:'event_a',projectId:'project_a',paymentId:'payment_a',type:'marketplace.payout.settled',delivery:'dead',attempts:8,createdAt:1,deliveryAttempts:[{token:'past',result:'failed'}]}]}],drafts:[]}
const d={identity:async()=>({userId:'operator_a',email:'operator@example.invalid'}),founder:()=>founder,read:async key=>{reads++;return key.includes('developer-projects')?{projects:{project_a:{webhookUrl:'https://merchant.example/webhook'}}}:undefined},storage:{read:async()=>structuredClone(state),now:()=>100,mutate:async fn=>{state=fn(structuredClone(state));return structuredClone(state)}}}
const handler=createMarketplaceOperationsHandler(d)
async function call(method,body){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method,body},res);return res}
assert.equal((await call('GET')).statusCode,403);assert.equal(reads,0)
founder=true;const data=await call('GET');assert.equal(data.body.data.current.webhooksDead,1);assert.equal(data.body.data.events[0].eventId,'event_a')
const request={projectId:'project_a',paymentId:'payment_a',eventId:'event_a',expectedWebhookUrl:'https://wrong.example/webhook',reason:'Reviewed endpoint and requested replay'}
assert.equal((await call('POST',request)).statusCode,409);assert.equal(state.books[0].walletEvents[0].delivery,'dead')
assert.equal((await call('POST',{...request,expectedWebhookUrl:'https://merchant.example/webhook'})).statusCode,200)
const e=state.books[0].walletEvents[0];assert.equal(e.id,'event_a');assert.equal(e.createdAt,1);assert.equal(e.replayApprovedAt,100);assert.equal(e.attempts,0);assert.equal(e.replayApprovals[0].actorId,'operator_a');assert.equal(e.deliveryAttempts.length,1)
console.log('PASS founder-only monitoring, denied reads, current destination review, immutable webhook identity, replay audit and retained attempt history. No network delivery.')

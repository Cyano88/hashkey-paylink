import assert from 'node:assert/strict'
import {queuePreparedReceiptEmail,drainCheckoutReceiptEmails} from '../api/checkout-receipt-emails.ts'
let now=1000,store={jobs:{}},sent=[],lookupFails=true
const d={enabled:()=>true,from:()=> 'receipts@example.test',now:()=>now,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},send:async input=>{sent.push(input.to);return 'fixture'},canSend:async project=>{if(project==='first'&&lookupFails)throw Error('temporary identity outage');return true}}
for(const id of ['first','second'])await queuePreparedReceiptEmail(id,id,{to:id+'@example.test',subject:'Fixture',text:'Fixture'},d)
await drainCheckoutReceiptEmails(d)
const first=()=>Object.values(store.jobs).find(j=>j.projectId==='first')
assert.deepEqual(sent,['second@example.test'],'a failed recipient lookup must not block the remaining batch')
assert.equal(first().state,'pending');assert.equal(first().leaseUntil,0);assert.equal(first().firstAttemptAt,undefined)
now+=21*60*60_000;lookupFails=false
await drainCheckoutReceiptEmails(d)
assert.deepEqual(sent,['second@example.test','first@example.test'],'an unsent job is not an expired uncertain provider request')
assert.equal(first().firstAttemptAt,now)
await queuePreparedReceiptEmail('slow','slow',{to:'slow@example.test',subject:'Fixture',text:'Fixture'},d)
await drainCheckoutReceiptEmails({...d,canSend:async()=>{now+=61_000;return true}})
const slow=()=>Object.values(store.jobs).find(j=>j.projectId==='slow')
assert.equal(slow().firstAttemptAt,undefined);assert.equal(sent.length,2,'expired verification lease cannot send')
await drainCheckoutReceiptEmails(d);assert.equal(sent.at(-1),'slow@example.test');assert.equal(slow().state,'sent')
console.log('PASS recipient lookup failure isolation, unsent retry window, expired lease protection and recovery. No real emails sent.')

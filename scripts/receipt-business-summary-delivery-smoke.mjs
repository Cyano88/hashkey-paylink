import assert from 'node:assert/strict'
import {businessSummaryCandidates,canDeliverReceiptSummary,reconcileBusinessReceiptSummaries} from '../api/receipt-business-summaries.ts'
import {queuePreparedReceiptEmail,drainCheckoutReceiptEmails} from '../api/checkout-receipt-emails.ts'
import {normalizeBusinessSummaryPreferences} from '../src/lib/businessSummaryPreferences.ts'
const start='2026-11-10T12:00:00Z',now=Date.parse('2026-11-11T00:20:00Z'),owner='owner',seller='seller'
const prefs=id=>normalizeBusinessSummaryPreferences({enabled:true,frequency:'daily',timeZone:'UTC',subscriberId:'attacker',startedAt:'2000-01-01'},undefined,start,id)
let state={projects:{project_a:{ownerId:owner,name:'Example',capabilities:['hosted_checkout','marketplace_payments'],receiptEmails:{businessSummary:prefs(owner)}}},links:[{projectId:'project_a',sellerId:'seller_a',owner:seller,reporting:prefs(seller)}]}
const guard=id=>({projectId:'project_a',ownerId:id,...(id===seller?{sellerId:'seller_a'}:{}),startedAt:start,frequency:'daily',timeZone:'UTC'})
const identity={state:async()=>state,email:async id=>id+'@example.com'}
assert.equal(businessSummaryCandidates(state).length,2)
assert.equal(await canDeliverReceiptSummary(guard(owner),'owner@example.com',identity),true)
assert.equal(await canDeliverReceiptSummary(guard(seller),'owner@example.com',identity),false)
const original=structuredClone(state)
state.projects.project_a.ownerId='new-owner';assert.equal(await canDeliverReceiptSummary(guard(owner),'owner@example.com',identity),false)
state=structuredClone(original);state.links[0].revokedAt=now;assert.equal(await canDeliverReceiptSummary(guard(seller),'seller@example.com',identity),false)
state=structuredClone(original);state.links.push({...state.links[0],owner:'other'});assert.equal(businessSummaryCandidates(state).length,1)
state=structuredClone(original);state.projects.project_a.receiptEmails.businessSummary.enabled=false;assert.equal(await canDeliverReceiptSummary(guard(owner),'owner@example.com',identity),false)
state=structuredClone(original);state.projects.project_a.operationalStatus='suspended';assert.equal(businessSummaryCandidates(state).length,0)
state=structuredClone(original)
assert.equal(await canDeliverReceiptSummary(guard(owner),'old@example.com',identity),false)
let cursors={ends:{}},outbox={jobs:{}},sent=[]
const outboxDeps={enabled:()=>true,from:()=> 'receipts@example.com',now:()=>now,read:async()=>outbox,mutate:async fn=>outbox=fn(outbox),send:async m=>{sent.push(m);return 'fixture'},canSend:async(_project,g,to)=>canDeliverReceiptSummary(g,to,identity)}
const record={id:'chk_a',partnerId:'project_a',network:'base',recipient:'0x'+'1'.repeat(40),merchantName:'Shop',amount:'2',title:'Order',asset:'USDC',createdAt:start,payment:{status:'paid',payer:'0x'+'2'.repeat(40),txHash:'0x'+'a'.repeat(64),amount:'2',confirmedAt:start}}
const deps={enabled:()=>true,now:()=>now,...identity,read:async()=>cursors,mutate:async fn=>cursors=fn(cursors),marketplace:async()=>({books:[]}),checkouts:async()=>[{record,recordedAt:Date.parse(start)+1000}],pdf:async()=>Buffer.from('fixture'),queue:async(id,p,message,g)=>queuePreparedReceiptEmail(id,p,message,outboxDeps,g)}
await reconcileBusinessReceiptSummaries(deps);assert.equal(Object.keys(outbox.jobs).length,1);assert.equal(Object.keys(cursors.ends).length,2,'empty seller period advances without a report')
assert.equal(Object.values(outbox.jobs)[0].input.to,'owner@example.com')
cursors={ends:{}};await reconcileBusinessReceiptSummaries(deps);assert.equal(Object.keys(outbox.jobs).length,1,'crash after queue before cursor cannot duplicate')
state.projects.project_a.ownerId='new-owner';await drainCheckoutReceiptEmails(outboxDeps);assert.equal(sent.length,0);assert.equal(Object.values(outbox.jobs)[0].state,'canceled')
state=structuredClone(original);outbox={jobs:{}};cursors={ends:{}};await reconcileBusinessReceiptSummaries(deps);await drainCheckoutReceiptEmails(outboxDeps);await drainCheckoutReceiptEmails(outboxDeps);assert.equal(sent.length,1)
cursors={ends:{}};const before=JSON.stringify(cursors);await reconcileBusinessReceiptSummaries({...deps,checkouts:async()=>{throw Error('missing evidence')}});assert.equal(Object.keys(cursors.ends).length,1,'failed operator period stays open; empty seller period may advance')
await assert.rejects(()=>queuePreparedReceiptEmail('bad','other',{to:'owner@example.com'},outboxDeps,guard(owner)),/mismatch/)
console.log('PASS summary owner/seller scope, ownership transfer, revocation, ambiguity, opt-out, suspension, email change, no-activity periods, durable dedupe and guarded delivery. Test outbox only.')

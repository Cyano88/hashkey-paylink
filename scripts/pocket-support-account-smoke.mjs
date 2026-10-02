import assert from 'node:assert/strict'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
const owner='owner-a',now=Date.now();let reads=[]
const base={identity:{kind:'privy',subject:owner},profileId:'hashed-owner',question:'What chain was my last payment?',requestId:'account-request-00001',newConversation:true,cases:{}}
const row={eventId:'payment-a',txHash:'hash-a',chain:'base',payer:'a',memo:'',amount:'1',ts:now-1000,source:'bank-withdraw',direction:'out',bankSettlementStatus:'processing',paycrestStatus:'settled'}
const deps={now:()=>now,profile:async id=>{reads.push(id);return {resolvedName:'Example Customer'}},payments:async id=>{reads.push(id);return [{...row,eventId:'deposit',direction:'in',ts:now},{...row,eventId:'funding',fundingOnly:true,ts:now},{...row,eventId:'bridge',source:'wallet-bridge',ts:now},row]}}
const answer=await supportAccountAnswer(base,deps)
assert.match(answer.text,/latest saved Stablecoins payment used Base/)
assert.match(answer.text,/Bank payout status on record: processing/)
assert.equal(answer.receipt.eventId,'payment-a');assert.deepEqual(reads,[owner])
const name=await supportAccountAnswer({...base,question:"What's my fulll name's"},deps);assert.equal(name.text,'Your profile name is Example Customer.')
const current={profileId:base.profileId,status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',accountContext:answer.accountContext}]}
const follow=await supportAccountAnswer({...base,caseId:'case',cases:{case:current},question:'What is its status?'},deps)
assert.equal(follow.receipt.eventId,'payment-a')
assert.match(follow.text,/processing/)
const ambiguous=await supportAccountAnswer({...base,question:'What chain was my payment?'},deps);assert.equal(ambiguous.accountContext.kind,'clarify');assert.equal(ambiguous.receipt,undefined)
const before=reads.length
for(const input of [ {...base,identity:{kind:'browser',subject:owner}}, {...base,caseId:'other',cases:{other:{...current,profileId:'another-owner'}}}, {...base,caseId:'case',cases:{case:{...current,humanSupport:true}}}, {...base,caseId:'case',cases:{case:{...current,messages:[{author:'staff'}]}}}, {...base,question:'Show another user payment'}, {...base,question:'Refund my latest payment'} ])assert.equal(await supportAccountAnswer(input,deps),undefined)
assert.equal(reads.length,before)
const failure=await supportAccountAnswer(base,{...deps,payments:async()=>{throw Error('private backend error')}});assert.match(failure.text,/could not read/);assert.ok(!failure.text.includes('private backend'))
const empty=await supportAccountAnswer(base,{...deps,payments:async()=>[]});assert.equal(empty.receipt,undefined);assert.match(empty.text,/could not find/)
const tied=await supportAccountAnswer(base,{...deps,payments:async()=>[row,{...row,eventId:'payment-b'}]});assert.equal(tied.receipt,undefined);assert.match(tied.text,/multiple payments/)
console.log('PASS owned profile/payment reads, funding exclusion, true bank status, follow-up, ambiguity, identity isolation and failure handling')

const specific=await supportAccountAnswer({...base,question:'What chain was my last payment to a merchant?'},deps);assert.equal(specific.accountContext.kind,'clarify')
const failed=await supportAccountAnswer({...base,question:'What chain was my last failed payment?'},{...deps,payments:async()=>[row,{...row,eventId:'failed-payment',bankSettlementStatus:'failed',ts:row.ts-1}]});assert.equal(failed.receipt.eventId,'failed-payment')
const noMy=await supportAccountAnswer({...base,question:'Which network did I last pay on?'},deps);assert.equal(noMy.receipt.eventId,'payment-a')


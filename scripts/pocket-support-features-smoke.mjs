import assert from 'node:assert/strict'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
const now=Date.now(),owner='verified-owner',base={identity:{kind:'privy',subject:owner},profileId:'profile',requestId:'features-audit-00001',newConversation:true,cases:{}}
let reads=0,provider=0
const deps={profile:async()=>undefined,payments:async()=>{throw Error('Must not merge personal activity')},chainCheck:async()=>{provider++;throw Error('No RPC')},balanceCheck:async()=>{provider++;throw Error('No RPC')},payoutStatus:async()=>{provider++;throw Error('No provider')},featureRecords:async(id,kind,selected)=>{reads++;assert.equal(id,owner);const record={id:kind+'-owned',title:kind+' record',status:kind==='requests'?'accepted':'saved',updatedAt:now,details:['Saved evidence fixture']};return selected&&selected!==record.id?[]:[record]}}
for(const kind of ['requests','gifts','xpay','collections']){
 const list=await supportAccountAnswer({...base,question:'Show my '+kind},deps);assert.match(list.text,/Choose/)
 const choice=list.options.find(o=>o.id==='payment_details');assert.ok(choice?.eventId)
 const current={profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',options:list.options,accountContext:list.accountContext}]}
 const select={...base,caseId:'case',cases:{case:current},question:'Check this payment',selectedEventId:choice.eventId}
 const answer=await supportAccountAnswer(select,deps);assert.match(answer.text,/Saved evidence fixture/);assert.match(answer.text,/From your saved records/);assert.equal(answer.receipt,undefined)
 const follow=await supportAccountAnswer({...select,selectedEventId:undefined,question:'What is its status?',cases:{case:{...current,messages:[{author:'agent',accountContext:answer.accountContext,options:answer.options}]}}},deps);assert.match(follow.text,/Saved evidence fixture/)
 const before=reads;await supportAccountAnswer({...select,selectedEventId:choice.eventId+'-forged'},deps);assert.equal(reads,before)
 assert.equal(await supportAccountAnswer({...select,profileId:'other'},deps),undefined)
 assert.equal(await supportAccountAnswer({...select,cases:{case:{...current,humanSupport:true}}},deps),undefined)
 assert.equal(reads,before)
 const missing=await supportAccountAnswer(select,{...deps,featureRecords:async()=>[]});assert.match(missing.text,/unavailable for this account/)
 const error=await supportAccountAnswer(select,{...deps,featureRecords:async()=>{throw Error('SECRET')}});assert.match(error.text,/temporarily unavailable/);assert.ok(!error.text.includes('SECRET'))
}
assert.equal(provider,0)
console.log('PASS all four feature lists/selections, offered-choice binding, account isolation, human queue, storage failure, no receipt misrouting, and zero RPC/provider calls')
const {supportFeatureAnswer}=await import('../api/pocket/support-feature-answer.ts')
for(const status of ['deleted','setup incomplete']){const result=await supportFeatureAnswer({owner,question:'Check this payment',selected:'support-feature:xpay:owned',offered:[{id:'payment_details',eventId:'support-feature:xpay:owned'}],now},async()=>[{id:'owned',title:'Shop',status,updatedAt:now,details:[]}]);assert.ok(result.text.includes('Status: '+status))}
console.log('PASS important terminal states remain visible while routine configuration copy is omitted')

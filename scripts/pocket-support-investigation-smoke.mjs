import assert from 'node:assert/strict'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
import {submitSupportConversation} from '../api/pocket/support-conversation.ts'
import {checkSupportIncomingUsdc} from '../api/pocket/support-investigation-chain.ts'
import crypto from 'node:crypto'
const now=Date.now(),hash='0x'+'a'.repeat(64),wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40)
const deposit={eventId:'incoming-owned',txHash:hash,chain:'base',payer:other,recipient:wallet,memo:'',amount:'1',ts:now-1000,source:'wallet-deposit',direction:'in',paycrestStatus:'confirmed'}
const bank={...deposit,eventId:'bank-owned',txHash:'0x'+'b'.repeat(64),source:'bank-withdraw',direction:'out',bankSettlementStatus:'processing',paycrestStatus:'settled',bankOrderId:'bank-ref-123'}
const base={identity:{kind:'privy',subject:'owner'},profileId:'profile',requestId:'investigation-request-001',newConversation:true,cases:{}}
let reads=0,checks=0
const deps={profile:async()=>undefined,payments:async owner=>{assert.equal(owner,'owner');reads++;return[deposit,bank,{...deposit,eventId:'hidden-funding',fundingOnly:true}]},now:()=>now,chainCheck:async(owner,network,tx)=>{checks++;assert.equal(owner,'owner');assert.equal(network,'base');assert.equal(tx,hash);return{status:'included',text:'Verified synthetic network finding'}}}
async function ask(question,prior,overrides={}){return supportAccountAnswer({...base,question,...(prior?{caseId:'case',cases:{case:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',accountContext:prior.accountContext,options:prior.options}]}}}:{}),...overrides},deps)}
let a=await ask("Someone sent me USDC but haven't seen it")
assert.equal(a.accountContext.investigation.product,'usdc');assert.match(a.text,/hash or payment reference/);assert.equal(a.handoff,false)
a=await ask(hash,a);assert.match(a.text,/Which network/);assert.equal(a.accountContext.investigation.reference,hash)
a=await ask('Base',a);assert.equal(a.options[0].eventId,'incoming-owned');assert.equal(checks,0)
let selected=await ask('Check this payment',a,{selectedEventId:'incoming-owned'});assert.equal(selected.receipt.eventId,'incoming-owned');assert.match(selected.text,/Verified synthetic network finding/)
assert.equal((await ask('Check this payment',a,{selectedEventId:'foreign-event'})).receipt,undefined)
a=await ask("What's does my current balance not tally");assert.match(a.text,/Stablecoins or XStocks/)
a=await ask('USDC',a);assert.match(a.text,/Which network/)
a=await ask('Base shows 1 USDC but I expected 2 USDC',a);assert.match(a.text,/cannot establish your current spendable balance/);assert.ok(a.options.some(o=>o.id==='human'))
assert.equal((await ask("What's my name?",a)).accountContext.kind,'profile')
a=await ask('My bank payment has not arrived');a=await ask('ref bank-ref-123',a);assert.equal(a.options[0].eventId,'bank-owned')
selected=await ask('Check this payment',a,{selectedEventId:'bank-owned'});assert.match(selected.text,/Bank payout status on record: processing/);assert.doesNotMatch(selected.text,/status on record: settled/);assert.match(selected.text,/Do not repeat/)
const amount=await ask('1.000000 USDC on Base at '+new Date(now).toISOString(),await ask('USDC not received'));assert.equal(amount.options[0].eventId,'incoming-owned')
const old=await ask('1 USDC on Base at 2020-01-01T12:00:00Z',await ask('USDC not received'));assert.ok(!old.options.some(o=>o.eventId))
const unknownDeps={...deps,payments:async()=>[]};let input=await ask('USDC not received');input=await ask(hash,input)
const cases={case:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',accountContext:input.accountContext}]}}
const live=await supportAccountAnswer({...base,caseId:'case',cases,question:'Base'},unknownDeps);assert.match(live.text,/Verified synthetic/);assert.equal(checks,2)
const unavailable=await supportAccountAnswer({...base,caseId:'case',cases,question:'Solana'},unknownDeps);assert.match(unavailable.text,/could not match/)
for(const override of [{identity:{kind:'browser',subject:'owner'}},{profileId:'intruder'},{cases:{case:{...cases.case,humanSupport:true}}},{cases:{case:{...cases.case,assignedTo:'staff'}}}])assert.equal(await supportAccountAnswer({...base,caseId:'case',cases,question:'Base',...override},unknownDeps),undefined)
const outages=await supportAccountAnswer({...base,question:'USDC not received on Base '+hash},{...deps,payments:async()=>{throw Error('PRIVATE KEY SECRET')}});assert.match(outages.text,/temporarily unavailable/);assert.ok(!outages.text.includes('SECRET'))
const limited={...cases.case,messages:Array.from({length:3},(_,i)=>({author:'agent',accountContext:{kind:'investigation',readAt:now,investigation:{issue:'missing',product:'usdc',network:'base',reference:hash,checkedAt:now-i-1}}}))}
const capped=await supportAccountAnswer({...base,caseId:'case',cases:{case:limited},question:'Base'},unknownDeps);assert.match(capped.text,/live-check limit/)
const store={};const one=submitSupportConversation(store,{profileId:'profile',newConversation:true,message:'USDC not received',requestId:crypto.randomUUID()},now,crypto.randomUUID,{tenantId:'pocket',entries:{},accountAnswer:live});const handoff=submitSupportConversation(store,{profileId:'profile',caseId:one.id,message:'Talk to an agent',requestId:crypto.randomUUID()},now+1,crypto.randomUUID);assert.match(handoff.messages.at(-1).text,/The team will reply here/);assert.equal(handoff.messages.filter(m=>m.kind==='handoff').length,0);assert.ok(handoff.messages.some(m=>m.accountContext?.investigation?.reference===hash))
console.log('PASS missing deposit, product/network/reference follow-ups, incoming selection, forged choices, bank settlement distinction, amount/time candidates, balance limitations, topic changes, ownership, outages, live-check budget and evidence-preserving handoff')
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',blockHash='0x'+'c'.repeat(64)
const receipt={transactionHash:hash,status:'0x1',blockNumber:'0x42',blockHash,logs:[{address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',topics:[topic,'0x'+other.slice(2).padStart(64,'0'),'0x'+wallet.slice(2).padStart(64,'0')],data:'0x'+(1000000n).toString(16).padStart(64,'0')}]}
let rpcCalls=[];const chainDeps={wallet:async owner=>{assert.equal(owner,'owner');return wallet},rpc:async(url,method,params,signal)=>{assert.ok(signal);rpcCalls.push(method);return method==='eth_chainId'?'0x2105':method==='eth_getTransactionReceipt'?structuredClone(receipt):{hash:blockHash,number:'0x42'}}}
assert.equal((await checkSupportIncomingUsdc('owner','base',hash,chainDeps)).status,'included');assert.equal(rpcCalls.length,3)
for(const mutate of [r=>r.logs[0].address=other,r=>r.logs[0].topics[2]='0x'+other.slice(2).padStart(64,'0'),r=>r.status='0x0',r=>r.logs[0].removed=true]){const r=structuredClone(receipt);mutate(r);const result=await checkSupportIncomingUsdc('owner','base',hash,{...chainDeps,rpc:async(u,m,p,s)=>m==='eth_getTransactionReceipt'?r:chainDeps.rpc(u,m,p,s)});assert.equal(result.status,'unmatched')}
for(const method of ['eth_chainId','eth_getBlockByNumber']){const result=await checkSupportIncomingUsdc('owner','base',hash,{...chainDeps,rpc:async(u,m,p,s)=>m===method?(m==='eth_chainId'?'0x1':{hash:'0xwrong',number:'0x42'}):chainDeps.rpc(u,m,p,s)});assert.equal(result.status,'unavailable')}
assert.equal((await checkSupportIncomingUsdc('owner','base',hash,{...chainDeps,rpc:async(u,m,p,s)=>m==='eth_getTransactionReceipt'?null:chainDeps.rpc(u,m,p,s)})).status,'not_found')
assert.equal((await checkSupportIncomingUsdc('owner','base',hash,{...chainDeps,rpc:async()=>{throw Error('secret')}})).status,'unavailable')
assert.equal((await checkSupportIncomingUsdc('owner','solana',hash,chainDeps)).status,'unavailable')
assert.equal((await checkSupportIncomingUsdc('owner','base','invalid',chainDeps)).status,'unavailable')
assert.equal((await checkSupportIncomingUsdc('owner','base',hash,{...chainDeps,wallet:async()=>undefined})).status,'unavailable')
console.log('PASS live-chain address/token binding, canonical block, provider network, missing receipt, failed tx, wrong token, wrong recipient, removed log, timeout/error, unsupported network and malformed hash')
import {supportPaymentAmount,supportEvidenceTime} from '../api/pocket/support-payment-format.ts'
const nigeria={...bank,eventId:'ng-bank',amount:'0.74',amountNgn:'1000',fiatCurrency:'NGN',bankOrderId:'ng-reference'}
const uganda={...bank,eventId:'ug-bank',amount:'0.27',amountNgn:'1000',fiatCurrency:'UGX',bankOrderId:'ug-reference'}
const bills={...bank,eventId:'ng-bill',source:'bills',billCategory:'airtime',amount:'0.74',amountNgn:'1000',fiatCurrency:'NGN',bankOrderId:undefined}
const localDeps={...deps,payments:async()=>[nigeria,uganda,bills]}
for(const [question,eventId,currency] of [['My bank transfer of 1,000 naira has not arrived','ng-bank','NGN'],['My UGX 1000 bank payment has not arrived','ug-bank','UGX'],['My airtime of ₦1,000 was not delivered','ng-bill','NGN']]){const result=await supportAccountAnswer({...base,question},localDeps);assert.equal(result.accountContext.investigation.currency,currency);assert.equal(result.options.filter(o=>o.eventId).length,1);assert.equal(result.options[0].eventId,eventId);assert.match(result.options[0].label,currency==='NGN'?/₦1,000/:/UGX 1,000/)}
assert.equal(supportPaymentAmount(nigeria),'₦1,000 · 0.74 USDC');assert.equal(supportPaymentAmount(uganda),'UGX 1,000 · 0.27 USDC')
assert.equal(supportEvidenceTime('02-10-2026 12:00 WAT'),Date.parse('2026-10-02T11:00:00Z'))
assert.equal(supportEvidenceTime('02-10-2026 14:00 EAT'),Date.parse('2026-10-02T11:00:00Z'))
assert.ok(Number.isNaN(supportEvidenceTime('31-02-2026 12:00 WAT')))
assert.ok(Number.isNaN(supportEvidenceTime('02-10-2026 12:00')))
console.log('PASS NGN/UGX separation, local amount first, original USDC amount, bill identity, WAT/EAT handling and ambiguous time rejection')
const liveBank=await supportAccountAnswer({...base,question:'Check this payment',selectedEventId:'bank-owned',caseId:'case',cases:{case:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',options:[{id:'payment_details',eventId:'bank-owned'}]}]}}},{...deps,payoutStatus:async row=>{assert.equal(row.eventId,'bank-owned');return {status:'settled',checkedAt:now}}});assert.match(liveBank.text,/Live bank payout status reported by the provider: settled/);assert.match(liveBank.text,/saved receipt has not yet caught up/)
console.log('PASS read-only bank-provider result distinguished from stale saved receipt')
// Relative time is fixed to server time and excludes a different same-amount transfer.
const threeHours=now-3*3600000
const relativeDeps={...deps,payments:async()=>[{...nigeria,eventId:'near',ts:threeHours},{...nigeria,eventId:'far',ts:now-8*3600000},{...uganda,eventId:'other-currency',ts:threeHours}]}
const initial=await supportAccountAnswer({...base,question:"My bank transfer hasn't arrived yet"},relativeDeps);assert.match(initial.text,/Choose the bank transfer/)
const relativeAnswer=await supportAccountAnswer({...base,question:'₦1000 naira on base about 3 hours ago',caseId:'relative',cases:{relative:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',accountContext:initial.accountContext}]}}},relativeDeps)
assert.deepEqual(relativeAnswer.options.filter(o=>o.eventId).map(o=>o.eventId),['near'])
console.log('PASS bank choices before hash collection and relative-hour amount/currency/time narrowing')

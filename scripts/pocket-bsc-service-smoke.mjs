import assert from 'node:assert/strict'
import {formatUnits} from 'viem'
import {readFileSync} from 'node:fs'
import {createBscService} from '../api/pocket/bsc-service.ts'
const quotes=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8'))
const hash='0x'+'a'.repeat(64)
function fixture(q){
 let store,halt,queue=Promise.resolve()
 const s={sharedChecks:0,settlement:'completed',send:0,prices:0,fee:BigInt(q.reimbursementUnits),balance:10n**22n,journalFails:false,journal:[],approvals:[]}
 const env={PRIVY_APP_ID:'fixtureappid',PRIVY_APP_SECRET:'fixture-secret',POCKET_SWAP_QUOTE_SECRET:'quote-secret-'.repeat(4),POCKET_BSC_SWAP_ENABLED:'true',POCKET_PRIVY_TRANSACTION_BILLING_ENABLED:'true'}
 const service=createBscService({sharedBilling:async()=>{s.sharedChecks++},env,now:()=>q.issuedAt,durable:()=>true,read:async()=>structuredClone(store),mutate:fn=>{const work=queue.then(()=>{store=fn(structuredClone(store));return structuredClone(store)});queue=work.catch(()=>{});return work},halted:async()=>halt,halt:async v=>{halt=v;return v},approve:async(token,owner)=>{s.approvals.push({token,owner});return token==='pin'},journal:async v=>{if(s.journalFails)throw Error('journal unavailable');s.journal.push(v);return v},runtime:()=>({rpc:async()=>{},chainId:async()=>56,balance:async()=>s.balance,estimateSponsored:async()=>({feeUnits:String(s.fee),expiresAt:q.expiresAt}),estimateNative:async()=>q.nativeGas,readPrices:async()=>{s.prices++;return {}},read:async()=>{}}),settle:async()=>({status:s.settlement,amountOutUnits:q.expectedOutUnits,...(q.from==='BNB'?{nativeFeeUnits:'1'}:{})}),fetcher:async(url,options)=>{
  assert.equal(options.redirect,'error')
  if(String(url).endsWith('/rpc')){s.send++;const body=JSON.parse(options.body);assert.equal(body.caip2,'eip155:56');assert.equal(body.sponsor,q.from!=='BNB');assert.equal(options.headers['privy-authorization-signature'],'wallet-signature');return new Response(JSON.stringify({data:{hash,transaction_id:'transaction123456',caip2:'eip155:56'}}))}
  throw Error('Unexpected network request')
 }})
 return {s,service,env,get store(){return store}}
}
for(const q of quotes){
 const f=fixture(q);assert.equal(f.service.enabled(),true)
 await f.service.operations.prepare(q,'pin')
 assert.deepEqual(f.s.approvals,[{token:'pin',owner:q.ownerId}])
 await f.service.operations.submit(q.id,q,'wallet-signature');assert.equal(f.s.send,1)
 assert.equal(f.s.journal[0].status,'submitted');assert.equal(f.s.journal[0].metadata.network,'bsc')
 f.s.journalFails=true
 await assert.rejects(()=>f.service.operations.status(q.id,q))
 assert.equal(f.store.operations[q.id].state,'completed')
 assert.equal(f.store.operations[q.id].publishedState,'pending')
 f.s.journalFails=false
 const reconciled=await f.service.reconcile()
 assert.equal(reconciled.completed,1);assert.equal(f.store.operations[q.id].publishedState,'completed')
 assert.equal(f.s.journal.at(-1).status,'completed');assert.equal(f.s.journal.at(-1).metadata.amountOut, formatUnits(BigInt(q.expectedOutUnits),18))
 assert.equal((await f.service.reconcile()).checked,0,'Published terminal actions do not poll forever')
 assert.equal(JSON.stringify(f.store).includes('wallet-signature'),false)
 f.env.POCKET_BSC_SWAP_ENABLED='false';assert.equal(f.service.enabled(),false)
 assert.equal((await f.service.operations.status(q.id,q)).state,'completed')
}
let f=fixture(quotes[0]);f.s.balance=0n;await assert.rejects(()=>f.service.operations.prepare(quotes[0],'pin'),/Insufficient/);assert.equal(f.s.send,0)
f=fixture(quotes[0]);f.s.fee++;await assert.rejects(()=>f.service.operations.prepare(quotes[0],'pin'),/fee changed/);assert.equal(f.s.send,0)
f=fixture(quotes[0]);f.env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED='false';assert.equal(f.service.enabled(),false);await assert.rejects(()=>f.service.operations.prepare(quotes[0],'pin'))
assert.throws(()=>createBscService({durable:()=>false}),/unavailable/)
console.log('PASS BSC service assembly: durable operations, correct PIN argument binding, four request directions, exact stable fees/native gas, balance/fee recheck, journal outage recovery and disabled execution gate; fixtures only')

for(const q of quotes){
 const f=fixture(q);await f.service.operations.prepare(q,'pin');await f.service.operations.submit(q.id,q,'wallet-signature');f.s.settlement='failed';await f.service.operations.status(q.id,q)
 assert.equal(f.s.journal.at(-1).metadata.fee,q.from==='BNB'?'0.000000000000000001':'0')
 assert.equal(f.s.journal.at(-1).metadata.feeEstimated,'false')
}
console.log('PASS failed receipts: only actual native gas is recorded; reverted stable reimbursement is zero')

f=fixture(quotes[0]);f.env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED='false';f.env.POCKET_PRIVY_COMBINED_BILLING_ENABLED='true';assert.equal(f.service.enabled(),true);await f.service.operations.prepare(quotes[0],'pin');assert.equal(f.s.sharedChecks,1)
console.log('PASS BSC combined billing mode invokes existing wallet-wide coverage guard before new sponsorship')

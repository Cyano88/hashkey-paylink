import assert from 'node:assert/strict'
import {formatUnits} from 'viem'
import {readFileSync} from 'node:fs'
import {createBscService} from '../api/pocket/bsc-service.ts'
const quotes=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8'))
const hash='0x'+'a'.repeat(64)
// Simulate jsonb serialization on every durable write, including nested fee metadata.
const jsonb=value=>Array.isArray(value)?value.map(jsonb):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort((a,b)=>a.length-b.length||a.localeCompare(b)).map(k=>[k,jsonb(value[k])])):value
function fixture(q){
 let store,halt,queue=Promise.resolve();const snapshots={}
 const s={sharedChecks:0,settlement:'completed',send:0,prices:0,fee:BigInt(q.reimbursementUnits),balance:10n**22n,journalFails:false,journal:[],approvals:[]}
 const env={PRIVY_APP_ID:'fixtureappid',PRIVY_APP_SECRET:'fixture-secret',POCKET_SWAP_QUOTE_SECRET:'quote-secret-'.repeat(4),POCKET_BSC_SWAP_ENABLED:'true',POCKET_PRIVY_TRANSACTION_BILLING_ENABLED:'true'}
 const service=createBscService({readBilling:async wallet=>snapshots[wallet],writeBilling:async(wallet,value)=>{snapshots[wallet]=value},sharedBilling:async()=>{s.sharedChecks++},env,now:()=>q.issuedAt,durable:()=>true,read:async()=>structuredClone(store),mutate:fn=>{const work=queue.then(()=>{store=jsonb(fn(structuredClone(store)));return structuredClone(store)});queue=work.catch(()=>{});return work},halted:async()=>halt,halt:async v=>{halt=v;return v},approve:async(token,owner)=>{s.approvals.push({token,owner});return token==='pin'},journal:async v=>{if(s.journalFails)throw Error('journal unavailable');s.journal.push(v);return v},runtime:()=>({rpc:async method=>{if(method==='eth_blockNumber')return '0x100';throw Error('Unexpected RPC')},chainId:async()=>56,balance:async()=>s.balance,estimateSponsored:async()=>({feeUnits:String(s.fee),expiresAt:q.expiresAt}),estimateNative:async()=>q.nativeGas,readPrices:async()=>{s.prices++;return {USDC:{scaled8:100000000n,observedAt:q.issuedAt},USDT:{scaled8:100000000n,observedAt:q.issuedAt}}},read:async()=>{}}),settle:async()=>({status:s.settlement,amountOutUnits:q.expectedOutUnits,...(q.from==='BNB'?{nativeFeeUnits:'1'}:{})}),fetcher:async(url,options)=>{
  assert.equal(options.redirect,'error')
  if(String(url).endsWith('/rpc')){s.send++;const body=JSON.parse(options.body);assert.equal(body.caip2,'eip155:56');assert.equal(body.sponsor,q.from!=='BNB');assert.equal(options.headers['privy-authorization-signature'],'wallet-signature');return new Response(JSON.stringify({data:{hash,transaction_id:'transaction123456',caip2:'eip155:56'}}))}
  if(String(url).includes('/transactions/'))return new Response(JSON.stringify({id:'transaction123456',wallet_id:q.walletId,caip2:'eip155:56',transaction_hash:hash,sponsored:true,gas_credits_charged:{currency:'usd',value:'0.000001'}}));throw Error('Unexpected network request')
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

// The configured quote margin absorbs small cost movements; the approved fee
// and transfer stay fixed. A real coverage shortfall must still block sending.
{
 const q=quotes.find(q=>q.from!=='BNB'),f=fixture(q)
 const original=f.service.runtime.estimateSponsored
 let covered=true
 f.service.runtime.estimateSponsored=async()=>({...(await original()),feeUnits:String(BigInt(q.reimbursementUnits)+1n),coverageFeeUnits:String(BigInt(q.reimbursementUnits)+(covered?-1n:1n))})
 await f.service.operations.prepare(q,'pin')
 covered=false;await assert.rejects(()=>f.service.operations.submit(q.id,q,'wallet-signature'),/fee changed/);assert.equal(f.s.send,0)
 covered=true;await f.service.operations.submit(q.id,q,'wallet-signature');assert.equal(f.s.send,1)
 assert.equal(f.store.operations[q.id].quote.reimbursementUnits,q.reimbursementUnits)
}
console.log('PASS fixed signed fee absorbs covered price movement; uncovered cost blocks submission')

import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBscBillingGuard} from '../api/pocket/bsc-billing-guard.ts'
const q=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8'))[0]
q.reimbursementUnits='10000000000000000'
const op={quote:q,state:'completed',createdAt:q.issuedAt,hash:'0x'+'a'.repeat(64),transactionId:'transaction123456'}
function fixture(){
 let halt
 const s={cost:'0.001',chain:'eip155:56',wallet:q.walletId,missing:false,reads:0}
 const guard=createBscBillingGuard({now:()=>q.issuedAt,halted:async()=>halt,halt:async v=>{halt??=v},prices:async()=>({[q.from]:{scaled8:100000000n,observedAt:q.issuedAt}}),transaction:async id=>{s.reads++;return {id,wallet_id:s.wallet,caip2:s.chain,transaction_hash:op.hash,sponsored:true,gas_credits_charged:s.missing?null:{currency:'usd',value:s.cost}}}})
 return {s,guard,get halt(){return halt}}
}
let f=fixture();await f.guard([op],q.walletId);assert.equal(f.halt,undefined)
f.s.cost='0.009501';await assert.rejects(()=>f.guard([op],q.walletId),/paused/);assert.equal(f.halt.coverageUsdMicros,'9500')
f.s.cost='0';await assert.rejects(()=>f.guard([],q.walletId),/paused/)
for(const mutate of [s=>s.chain='eip155:196',s=>s.wallet='wrongwallet123',s=>s.missing=true]){f=fixture();mutate(f.s);await assert.rejects(()=>f.guard([op],q.walletId));assert.equal(f.halt,undefined)}
f=fixture();await assert.rejects(()=>f.guard([{...op,state:'pending'}],q.walletId));assert.equal(f.s.reads,0)
f=fixture();await assert.rejects(()=>f.guard([{...op,state:'failed'}],q.walletId),/paused/);assert.equal(f.halt.coverageUsdMicros,'0')
f=fixture();await f.guard([{...op,quote:{...q,from:'BNB'}},{...op,state:'cancelled'},{...op,state:'not_submitted'}],q.walletId);assert.equal(f.s.reads,0)
f=fixture();await assert.rejects(()=>f.guard([op,op],q.walletId));assert.equal(f.s.reads,0)
console.log('PASS BSC billing: transaction-scoped costs, 18-decimal coverage, persistent shortfall halt, wrong-chain/wallet/missing billing rejection, failed operation costs and native gas exclusion')

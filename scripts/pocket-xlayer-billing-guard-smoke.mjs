import assert from 'node:assert/strict'
import {encodeEventTopics,parseAbi,toHex} from 'viem'
import {createXLayerBillingGuard,xlayerBilledUsdMicros} from '../api/pocket/xlayer-billing-guard.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const now=1700000000000,wallet='0x1111111111111111111111111111111111111111',hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64)
const token='0xb6ceceab302e2e4948951ee7843fc24e92933061'
assert.equal(xlayerBilledUsdMicros({value:'0.000285',currency:'usd'}),285n)
assert.equal(xlayerBilledUsdMicros({value:'0.0002851',currency:'USD'}),286n)
for(const value of ['',null,' ','-1','NaN','1e6'])assert.throws(()=>xlayerBilledUsdMicros({value,currency:'usd'}))
assert.throws(()=>xlayerBilledUsdMicros({value:'1',currency:'eur'}))
const attempt={wallet,at:now-60000,hash,coverage:{walletId:'wallet1',asset:'USDC',feeUnits:'10000'}}
const topics=encodeEventTopics({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',args:{from:wallet,to:EVM_PLATFORM_TREASURY}})
function fixture(transactionSpend,additionalCoverage){
 let halted
 const s={billed:285n,usd:1,chain:'0xc4',missing:false,reorg:false,priceAge:0,status:'0x1',logs:[{address:token,topics,data:toHex(10000n,{size:32})}],reads:0,clock:now}
 const guard=createXLayerBillingGuard({transactionSpend,additionalCoverage,now:()=>s.clock,readHalt:async()=>halted,halt:async value=>{halted||=value},prices:async()=>({[token]:{usd:s.usd,fetchedAt:s.clock-s.priceAge}}),spend:async(id,start,end)=>{assert.equal(id,'wallet1');assert.equal(start,attempt.at-1000);assert.equal(end,now);s.reads++;return s.billed},rpc:async(method)=>{if(method==='eth_chainId')return s.chain;if(method==='eth_getTransactionReceipt')return s.missing?null:{transactionHash:hash,blockHash,blockNumber:'0x1',status:s.status,logs:s.logs};if(method==='eth_getBlockByNumber')return {hash:s.reorg?'0x'+'c'.repeat(64):blockHash};throw Error('Unexpected RPC')}})
 return {s,guard,get halted(){return halted}}
}
let f=fixture();await f.guard([attempt]);assert.equal(f.halted,undefined)
f.s.billed=9501n;await assert.rejects(()=>f.guard([attempt]),/paused/);assert.equal(f.halted.coverageUsdMicros,'9500')
f.s.billed=0n;await assert.rejects(()=>f.guard([]),/paused/);assert.equal(f.s.reads,2,'Halt survives lower later billing and empty records')
for(const edit of [s=>s.missing=true,s=>s.reorg=true,s=>s.chain='0x1',s=>s.priceAge=30001,s=>s.usd=NaN]){f=fixture();edit(f.s);await assert.rejects(()=>f.guard([attempt]),/unavailable/);assert.equal(f.halted,undefined)}
for(const edit of [s=>s.status='0x0',s=>s.logs=[],s=>s.logs[0].data=toHex(9999n,{size:32})]){f=fixture();edit(f.s);await assert.rejects(()=>f.guard([attempt]),/paused/);assert.equal(f.halted.coverageUsdMicros,'0')}
f=fixture();await assert.rejects(()=>f.guard([{...attempt,hash:undefined}]),/unavailable/);assert.equal(f.s.reads,0)
f=fixture();await assert.rejects(()=>f.guard([attempt,attempt]),/unavailable/)
f=fixture();f.s.usd=0.5;f.s.billed=5000n;await assert.rejects(()=>f.guard([attempt]),/paused/)
f=fixture();await f.guard([{...attempt,coverage:undefined}]);assert.equal(f.s.reads,0,'Legacy records are not counted as reimbursement')
f=fixture();await f.guard([attempt],'0x2222222222222222222222222222222222222222');assert.equal(f.s.reads,0)
console.log('PASS billing guard: proven collection, billed-cost halt, persistent stop, canonical receipts, reverts, missing evidence, duplicate hashes, depeg and wallet scope; no funds moved.')

f=fixture(async records=>{assert.equal(records.length,1);return 285n});f.s.billed=999999999n;await f.guard([attempt]);assert.equal(f.halted,undefined);assert.equal(f.s.reads,0,'Transaction billing never reads mixed-chain wallet totals')
f=fixture(async()=>{throw Error('billing pending')});await assert.rejects(()=>f.guard([attempt]),/billing pending/);assert.equal(f.halted,undefined)
console.log('PASS X Layer transaction billing mode ignores wallet-wide costs and leaves missing invoices unresolved')

f=fixture(undefined,async()=>[{walletId:'wallet1',at:attempt.at,hash:'0x'+'e'.repeat(64),coverageUsdMicros:10000n}]);f.s.billed=15000n;await f.guard([attempt]);assert.equal(f.halted,undefined)
f.s.billed=19501n;await assert.rejects(()=>f.guard([attempt]),/paused/);assert.equal(f.halted.coverageUsdMicros,'19500')
f=fixture(undefined,async()=>{throw Error('Unproven BSC fee')});await assert.rejects(()=>f.guard([attempt]),/Unproven/);assert.equal(f.halted,undefined)
console.log('PASS combined-chain coverage: wallet invoice includes only independently proven BSC plus X Layer fees; no gas subtraction or historical ID guess')

// Additional-chain verification can take longer than the allowed future skew.
f=fixture(undefined,async()=>{f.s.clock+=6000;return []});await f.guard([attempt]);assert.equal(f.halted,undefined);
f=fixture();f.s.priceAge=-5001;await assert.rejects(()=>f.guard([attempt]),/unavailable/);
f=fixture();f.s.priceAge=30000;await assert.rejects(()=>f.guard([attempt]),/unavailable/);
console.log('PASS delayed combined-chain verification accepts newly fetched prices and still rejects stale or future prices');

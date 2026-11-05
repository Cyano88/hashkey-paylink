import assert from 'node:assert/strict'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {crossBridgeDeliveryCandidate,crossBridgeDeliveryProven} from '../api/pocket/cross-bridge-evidence.ts'
import {createCrossBridgeSettlement} from '../api/pocket/cross-bridge-settlement.ts'
import {CROSS_BRIDGE_ROLLOUT_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
const hash=n=>n==='solana'?'3'.repeat(88):'0x'+'a'.repeat(64),output=n=>n==='solana'?'4'.repeat(88):'0x'+'b'.repeat(64)
function data(source='base',destination='bsc',from='ETH',to='USDT',alternate=false){
 const {q,i}=fixture(source,destination,from,to,alternate),route=validateCrossBridgeRelayQuote(q,i,now),plan={route,sender:i.sender,recipient:i.recipient}
 const status={status:'success',originChainId:RELAY_BSC_CHAINS[source].id,destinationChainId:RELAY_BSC_CHAINS[destination].id,inTxHashes:[hash(source)],txHashes:[output(destination)]}
 const request={id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'success',user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:hash(source),chainId:status.originChainId,status:'success'}],outTxs:[{txHash:output(destination),chainId:status.destinationChainId,status:'success'}]}}
 return {plan,status,requests:{requests:[request]},request}
}
let pairs=0
for(const source of CROSS_BRIDGE_ROLLOUT_NETWORKS)for(const destination of CROSS_BRIDGE_ROLLOUT_NETWORKS){if(source===destination)continue;for(const from of crossBridgeAssets(source))for(const to of crossBridgeAssets(destination)){
 const f=data(source,destination,from.symbol,to.symbol),c=crossBridgeDeliveryCandidate(f.plan,hash(source),f.status,f.requests)
 assert(c);assert(crossBridgeDeliveryProven(c,BigInt(f.plan.route.receiveUnits)));assert(!crossBridgeDeliveryProven(c,BigInt(c.minimumUnits)-1n));assert(!crossBridgeDeliveryProven(c,null));pairs++
}}
for(const mutate of [f=>f.status.status='failure',f=>f.status.inTxHashes.push(hash('base')),f=>f.status.originChainId=1,f=>f.request.protocol.orderId=hash('base'),f=>f.request.user='0x'+'f'.repeat(40),f=>f.request.data.inTxs.push(f.request.data.inTxs[0]),f=>f.request.data.outTxs.push(f.request.data.outTxs[0]),f=>f.status.txHashes.push(output('bsc')),f=>f.request.data.outTxs[0].chainId=1]){const f=data();mutate(f);assert.equal(crossBridgeDeliveryCandidate(f.plan,hash('base'),f.status,f.requests),null)}
const refund=data('bsc','base','BNB','EURC',true)
refund.status.status=refund.request.status='refund'
const option=refund.plan.route.refundOptions[1]
refund.request.data.refundCurrencyData={amount:'90000000000000000000',currency:{chainId:8453,address:option.address,decimals:option.decimals}}
let candidate=crossBridgeDeliveryCandidate(refund.plan,hash('bsc'),refund.status,refund.requests)
assert(candidate);assert.equal(candidate.token.symbol,'USDC');assert(crossBridgeDeliveryProven(candidate,90000000000000000000n));assert(!crossBridgeDeliveryProven(candidate,90000000000000000001n))
refund.request.data.refundCurrencyData.currency.decimals=18;assert.equal(crossBridgeDeliveryCandidate(refund.plan,hash('bsc'),refund.status,refund.requests),null)
function harness(...route){
 const f=data(...route),initial={id:'operation',ownerId:'owner',plan:f.plan,sourceHash:hash(f.plan.route.source),state:'submitted',updatedAt:now}
 let row=structuredClone(initial),source='confirmed',received=BigInt(f.plan.route.receiveUnits),observed=null,ledgerFailures=0,sourceCalls=0,providerCalls=0,beforeRead
 const events=new Map(),d={now:()=>now,read:async()=>structuredClone(row),mutate:async(id,fn)=>{row=fn(structuredClone(row));return structuredClone(row)},source:async()=>{sourceCalls++;if(source instanceof Error)throw source;return source},provider:async()=>{providerCalls++;return f},observed:async()=>observed,received:async()=>{if(beforeRead)await beforeRead();return received},ledger:async e=>{if(ledgerFailures-->0)throw Error('Ledger unavailable');events.set(e.eventKey,e)}}
 return {f,initial,events,run:createCrossBridgeSettlement(d),get row(){return row},set row(v){row=v},set source(v){source=v},set received(v){received=v},set observed(v){observed=v},set ledgerFailures(v){ledgerFailures=v},set beforeRead(v){beforeRead=v},get providerCalls(){return providerCalls},get sourceCalls(){return sourceCalls}}
}
let h=harness();await assert.rejects(()=>h.run('other','operation'));assert.equal(h.sourceCalls,0)
{
 const o=harness();o.source='pending';o.received=null;o.observed=BigInt(o.f.plan.route.receiveUnits)
 await o.run('owner','operation');assert(o.row.observedDelivery);assert.equal(o.row.state,'submitted');assert.equal(o.row.delivery,undefined);assert.equal(o.row.settlement,undefined);assert.equal(o.events.size,0)
 o.observed=null;await o.run('owner','operation');assert.equal(o.row.observedDelivery,null);assert.equal(o.events.size,0)
 o.observed=BigInt(o.f.plan.route.minimumUnits)-1n
 await o.run('owner','operation');assert.equal(o.row.observedDelivery,null)
 o.source='confirmed';o.received=BigInt(o.f.plan.route.receiveUnits);await o.run('owner','operation');assert.equal(o.row.state,'completed');assert.equal(o.events.size,1)
}
h.source='pending';assert.equal((await h.run('owner','operation')).state,'submitted');assert.equal(h.providerCalls,1);assert(h.row.delivery);assert.equal(h.row.settlement,undefined);assert.equal(h.events.size,0)
h=harness();h.source='pending';h.received=null;await h.run('owner','operation');assert.equal(h.row.delivery,undefined);assert.equal(h.events.size,0)
h=harness();h.source='pending';h.f.status.status='failure';await h.run('owner','operation');assert.equal(h.row.delivery,undefined)
h=harness();h.source='failed';assert.equal((await h.run('owner','operation')).state,'source_failed');assert.equal(h.providerCalls,1);assert.equal(h.events.size,0)
h=harness();h.f.status.status='failure';assert.equal((await h.run('owner','operation')).state,'source_confirmed');assert.equal(h.events.size,0)
h=harness();h.received=null;assert.equal((await h.run('owner','operation')).state,'source_confirmed')
h=harness();h.ledgerFailures=1;await assert.rejects(()=>h.run('owner','operation'),/Ledger/);assert.equal(h.row.state,'completed');assert.equal(h.events.size,0);await h.run('owner','operation');assert.equal(h.events.size,1);assert.equal(h.sourceCalls,1)
const event=[...h.events.values()][0];assert.equal(event.asset,'USDT');assert.equal(event.amount,'2');assert.equal(event.metadata.sourceAsset,'ETH')
h=harness();await Promise.all([h.run('owner','operation'),h.run('owner','operation')]);assert.equal(h.events.size,1);assert.equal(h.row.state,'completed')
h=harness();h.beforeRead=()=>{h.row={...h.row,sourceHash:'0x'+'c'.repeat(64)}};await assert.rejects(()=>h.run('owner','operation'));assert.equal(h.events.size,0)
h=harness();h.beforeRead=()=>{h.row={...h.row,plan:{...h.row.plan,recipient:'0x'+'f'.repeat(40)}}};await assert.rejects(()=>h.run('owner','operation'));assert.equal(h.events.size,0)
console.log('PASS '+pairs+' non-Arc asset pairs; exact provider order/source/refund/output binding; no cross-asset 1:1 cap; owner isolation, pending/failure safety, concurrent terminal state, changed-route rejection and idempotent ledger repair. Isolated fixtures only; no production store or source adapter mounted.')
h=harness();h.f.status.status=h.f.request.status='refund';const refundOption=h.f.plan.route.refundOptions[0]
h.f.request.data.refundCurrencyData={amount:'500000000000000000',currency:{chainId:8453,address:refundOption.address,decimals:refundOption.decimals}}
h.f.request.data.outTxs[0].chainId=8453;h.received=500000000000000000n
assert.equal((await h.run('owner','operation')).state,'refunded');assert.equal([...h.events.values()][0].asset,'ETH');assert.equal([...h.events.values()][0].amount,'0.5')
await h.run('owner','operation');assert.equal(h.events.size,1);assert.equal(h.sourceCalls,1)
console.log('PASS coordinator exact source-asset refund and terminal refund ledger replay without a second source verification.')

h=harness();h.source=Error('Finality pending');await h.run('owner','operation');assert(h.row.delivery);assert.equal(h.row.state,'submitted');assert.equal(h.events.size,0);h.source='confirmed';await h.run('owner','operation');assert.equal(h.row.state,'completed');assert.equal(h.events.size,1);console.log('PASS verified delivery during unavailable source proof remains nonterminal and later settles once.')

let directions=0
for(const source of CROSS_BRIDGE_ROLLOUT_NETWORKS)for(const destination of CROSS_BRIDGE_ROLLOUT_NETWORKS){
 if(source===destination)continue
 for(const pendingSource of ['pending',Error('Source finality not ready')]){
  const h=harness(source,destination,'USDC','USDC');h.source=pendingSource
  await h.run('owner','operation');assert.equal(h.row.state,'submitted');assert(h.row.delivery);assert.equal(h.events.size,0)
  h.source='confirmed';await h.run('owner','operation');assert.equal(h.row.state,'completed');assert.equal(h.events.size,1)
  await h.run('owner','operation');assert.equal(h.events.size,1)
 }
 const missing=harness(source,destination,'USDC','USDC');missing.source='pending';missing.received=null
 await missing.run('owner','operation');assert.equal(missing.row.delivery,undefined);assert.equal(missing.row.state,'submitted');directions++
}
console.log('PASS '+directions+' directed network pairs including Arc and Solana: delivery before pending/throwing source proof, no provider-only success, eventual completion, idempotent publication.')

// Deferred source proof cannot serialize otherwise independent destination work.
{
 const f=data(),row={id:'parallel',ownerId:'owner',plan:f.plan,sourceHash:hash('base'),state:'submitted',updatedAt:now};let saved=row,releaseSource,releaseDelivery,sourceStarted=false,destinationStarted=false,events=0;
 const sourceGate=new Promise(resolve=>releaseSource=resolve),deliveryGate=new Promise(resolve=>releaseDelivery=resolve);
 const run=createCrossBridgeSettlement({now:()=>now,read:async()=>saved,mutate:async(id,fn)=>(saved=fn(saved)),source:async()=>{sourceStarted=true;await sourceGate;return 'confirmed'},provider:async()=>f,received:async()=>{destinationStarted=true;await deliveryGate;return BigInt(f.plan.route.receiveUnits)},ledger:async()=>{events++}});
 const work=run('owner','parallel');await new Promise(resolve=>setImmediate(resolve));assert(sourceStarted);assert(destinationStarted,'Destination proof starts before source proof resolves');assert.equal(events,0);
 releaseDelivery();await new Promise(resolve=>setImmediate(resolve));assert.equal(saved.state,'submitted');assert.equal(events,0,'Destination evidence alone never completes ledger');releaseSource();await work;assert.equal(saved.state,'completed');assert.equal(events,1);
}
console.log('PASS independent source/destination proof concurrency without earlier settlement or duplicate ledger writes')

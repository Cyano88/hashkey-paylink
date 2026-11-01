import assert from 'node:assert/strict'
import {readXLayerNativeCandidates,verifyXLayerNativeCandidates} from '../api/pocket/xlayer-native-discovery.ts'
import {runStockNotifications,normalizeStockNotices,addStockRequest,decideStockRequest} from '../api/pocket/xstocks-notifications-store.ts'
import {stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),bh=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),now=1800000000000
const row={txId:hash,blockHash:bh(120),height:'120',from:b,to:a}
const page=(rows,totalPage='1',current='1')=>({ok:true,json:async()=>({code:'0',data:[{page:current,totalPage,transactionList:rows}]})})
let calls=0
let candidates=await readXLayerNativeCandidates([a,a.toUpperCase().replace('0X','0x')],100n,160n,async()=>{calls++;return page([row])})
assert.equal(calls,1);assert.equal(candidates.length,1)
assert.deepEqual(await readXLayerNativeCandidates([a],100n,160n,async()=>page([],'0')),[])
assert.deepEqual(await readXLayerNativeCandidates([a],100n,160n,async()=>page([],'')),[])
await assert.rejects(()=>readXLayerNativeCandidates([a],100n,160n,async()=>page([row],'')))
assert.deepEqual(await readXLayerNativeCandidates([a],100n,160n,async()=>page([],'1')),[])
let pages=0
await assert.rejects(()=>readXLayerNativeCandidates([a],100n,160n,async()=>page([row],'2',String(++pages))),/Repeated/)
for(const bad of [page([row],'11'),page([row],'x'),page([{...row,height:'99'}]),page([{...row,to:b}]),page([{...row,txId:'bad'}]),page([],'2')]) await assert.rejects(()=>readXLayerNativeCandidates([a],100n,160n,async()=>bad))
const row2={...row,txId:'0x'+'c'.repeat(64)};pages=0
assert.equal((await readXLayerNativeCandidates([a],100n,160n,async()=>page([++pages===1?row:row2],'2',String(pages)))).length,2)
const many=Array.from({length:21},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));calls=0
await readXLayerNativeCandidates(many,100n,160n,async url=>{calls++;assert.ok(new URL(url).searchParams.get('address').split(',').length<=20);return page([],'0')});assert.equal(calls,2)
const tx={hash,from:b,to:a,value:10n,blockNumber:120n,blockHash:bh(120),chainId:196}
const receipt={transactionHash:hash,blockNumber:120n,blockHash:bh(120),status:'success'}
let proofs=0
const client={getTransaction:async()=>{proofs++;return tx},getTransactionReceipt:async()=>receipt,getBlock:async({blockNumber})=>({number:blockNumber,hash:bh(blockNumber),timestamp:BigInt((now-60000)/1000)})}
let verified=await verifyXLayerNativeCandidates(candidates,[a],0n,160n,undefined,client,now)
assert.equal(verified.transfers[0].units,'10');assert.equal(proofs,1)
const persisted=JSON.parse(JSON.stringify(verified.state))
verified=await verifyXLayerNativeCandidates(candidates,[a],0n,160n,persisted,client,now)
assert.equal(proofs,1);assert.equal(verified.transfers.length,0)
await verifyXLayerNativeCandidates(candidates,[a],0n,130n,persisted,client,now);assert.equal(proofs,2)
await verifyXLayerNativeCandidates(candidates,[a,b],0n,160n,persisted,client,now);assert.equal(proofs,3)
for(const change of [{blockHash:bh(119)},{blockNumber:121n},{transactionHash:'0x'+'f'.repeat(64)},{status:'pending'}]) await assert.rejects(()=>verifyXLayerNativeCandidates(candidates,[a],0n,160n,undefined,{...client,getTransactionReceipt:async()=>({...receipt,...change})},now))
assert.equal((await verifyXLayerNativeCandidates(candidates,[a],0n,160n,undefined,{...client,getTransactionReceipt:async()=>({...receipt,status:'reverted'})},now)).transfers.length,0)
assert.equal((await verifyXLayerNativeCandidates(candidates,[a],0n,160n,undefined,{...client,getTransaction:async()=>({...tx,to:b,from:b})},now)).transfers.length,0)
await assert.rejects(()=>verifyXLayerNativeCandidates(candidates,[a],0n,160n,undefined,{...client,getBlock:async()=>({number:120n,hash:bh(119),timestamp:1n})},now))

// Worker integration: native request fulfillment survives restart and replay;
// stablecoin log scanning remains active, and empty indexed ranges avoid full blocks.
let state=normalizeStockNotices();state.cursor='100';state.cursorHash=bh(100);state.wallets={receiver:{address:a,since:now-200000},payer:{address:b,since:now-200000}}
const req=addStockRequest(state,{eventId:'request',sender:'receiver',payer:'payer',senderPocketId:'a',payerPocketId:'b',address:a,payerAddress:b,token:'native',symbol:'OKB',amount:'0.00000000000000001',units:'10',decimals:18},now-120000);decideStockRequest(state,'payer',req.id,'accept',now-110000)
let fullBlocks=0,logs=0,head=172n,indexCalls=0
const rpc={...client,getChainId:async()=>196,getLogs:async()=>{logs++;return []},getBlock:async(args={})=>{if(args.includeTransactions)fullBlocks++;const n=args.blockNumber??head;return {number:n,hash:bh(n),timestamp:BigInt((now-60000)/1000),transactions:args.includeTransactions&&n===120n?[tx]:[]}}}
const deps={available:()=>true,read:async()=>structuredClone(state),mutate:async fn=>fn(state),client:rpc,candidates:async()=>{indexCalls++;return candidates},enrich:async()=>{},proofs:async()=>[],now:()=>now}
await runStockNotifications(deps);assert.equal(fullBlocks,0);assert.equal(state.requests[req.id].status,'paid');assert.equal(state.cursor,'160');assert.equal(logs,2)
const count=Object.keys(state.notices).length;state=JSON.parse(JSON.stringify(state));head=202n
await runStockNotifications(deps);assert.equal(Object.keys(state.notices).length,count);assert.equal(state.cursor,'190')
// A transaction absent from the first index response appears on a later replay.
state=normalizeStockNotices();state.cursor='100';state.cursorHash=bh(100);state.wallets={receiver:{address:a,since:now-200000}};head=172n
await runStockNotifications({...deps,candidates:async()=>[]});assert.equal(Object.keys(state.notices).length,0);head=202n
await runStockNotifications(deps);assert.equal(Object.values(state.notices).filter(n=>n.transfer).length,1)
// Index failure uses the bounded block fallback, never silently advances empty.
state=normalizeStockNotices();state.cursor='100';state.cursorHash=bh(100);state.wallets={receiver:{address:a,since:now-200000}};head=172n;fullBlocks=0
await runStockNotifications({...deps,candidates:async()=>{throw Error('provider unavailable')}});assert.equal(fullBlocks,60);assert.equal(state.cursor,'160');assert.ok(state.nativeRetryAt>now);assert.equal(Object.values(state.notices).filter(n=>n.transfer).length,1)
// Both sources fail: keep durable progress unchanged.
state.cursor='100';state.cursorHash=bh(100);state.nativeRetryAt=0
await assert.rejects(()=>runStockNotifications({...deps,candidates:async()=>{throw Error('index down')},client:{...rpc,getBlock:async args=>{if(args?.includeTransactions)throw Error('rpc down');return rpc.getBlock(args)}}}));assert.equal(state.cursor,'100')
// Cursor reorg invalidates proof cache, replays and saves the canonical checkpoint.
state.cursor='100';state.cursorHash=bh(99);state.nativeDiscovery=persisted;state.nativeRetryAt=0
await runStockNotifications(deps);assert.equal(state.cursor,'136');assert.equal(state.cursorHash,bh(136))
console.log('PASS indexed pagination/bounds, canonical native proofs, cache/restart, delayed indexing, request fulfillment, deduplication, fallback, failure retention and reorg replay')

// Stablecoin discovery remains log-based and needs only relevant block headers.
state=normalizeStockNotices();state.cursor='100';state.cursorHash=bh(100);state.wallets={receiver:{address:a,since:now-200000}};head=172n;fullBlocks=0
const log={address:stockUsdc.address,transactionHash:hash,blockNumber:120n,blockHash:bh(120),logIndex:0,args:{from:b,to:a,value:1000000n}}
await runStockNotifications({...deps,candidates:async()=>[],client:{...rpc,getLogs:async()=>[log]}})
assert.equal(fullBlocks,0);assert.equal(Object.values(state.notices).filter(n=>n.transfer?.symbol==='USDC').length,1)
// A failure after discovery cannot persist its cache or advance the cursor.
state.cursor='100';state.cursorHash=bh(100);delete state.nativeDiscovery
await assert.rejects(()=>runStockNotifications({...deps,proofs:async()=>{throw Error('enrichment unavailable')}}))
assert.equal(state.cursor,'100');assert.equal(state.nativeDiscovery,undefined)
// A concurrent wallet change invalidates the entire snapshot commit.
await runStockNotifications({...deps,mutate:async fn=>{state.wallets.receiver.address=b;fn(state)}})
assert.equal(state.cursor,'100')
console.log('PASS stablecoin discovery, atomic proof/cache persistence and concurrent wallet change protection')

import assert from 'node:assert/strict'
import {fetchCircleDisplayBalance,createCircleDisplayBalanceReader,circleBalanceTokens} from '../api/pocket/circle-display-balances.ts'
import {fetchOkxDisplayBalances,parseOkxBalanceRows,exactBalanceUnits,createStockDisplayReader} from '../api/pocket/okx-display-balances.ts'
import {stockUsdc,stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {createStockBalanceCache} from '../src/pocket/lib/pocketStockBalanceCache.ts'
const owner='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222'
process.env.CIRCLE_API_KEY='LIVE_API:fixture';process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
const link={privyUserId:'fixture',chain:'base',circleWalletId:'fixture-wallet',circleWalletAddress:owner,circleBlockchain:'BASE',updatedAt:1}
const wallet={id:link.circleWalletId,address:owner,blockchain:'BASE'}
const token={blockchain:'BASE',tokenAddress:circleBalanceTokens.base[1],decimals:6,isNative:false}
let items=[{amount:'12.340001',token}],next=false,binding=wallet,circleCalls=0
const circleFetch=async(url,init)=>{circleCalls++;assert.match(init.headers.Authorization,/Bearer/);return new Response(JSON.stringify({data:url.includes('/balances?')?{tokenBalances:items}:{wallet:binding}}),{headers:{'content-type':'application/json',...(next?{link:'<https://api.circle.com/next>; rel="next"'}:{})}})}
assert.equal(await fetchCircleDisplayBalance(link,circleFetch),12.340001)
items=[];assert.equal(await fetchCircleDisplayBalance(link,circleFetch),0)
next=true;await assert.rejects(fetchCircleDisplayBalance(link,circleFetch));next=false
binding={...wallet,address:other};await assert.rejects(fetchCircleDisplayBalance(link,circleFetch));binding=wallet
for(const bad of [{...token,tokenAddress:other},{...token,blockchain:'ARB'},{...token,decimals:18}]){items=[{amount:'1',token:bad}];await assert.rejects(fetchCircleDisplayBalance(link,circleFetch))}
items=[{amount:'NaN',token}];await assert.rejects(fetchCircleDisplayBalance(link,circleFetch))
let now=100000,pc=0,rc=0,fail=false
const reader=createCircleDisplayBalanceReader(async()=>{pc++;if(fail)throw Error('provider');return 10},()=>now),fallback=async()=>{rc++;return 11}
await Promise.all([reader(link,fallback),reader(link,fallback)]);assert.equal(pc,1);assert.equal(rc,0)
now+=20000;assert.equal((await reader(link,fallback)).observedAt,100000)
await reader({...link,updatedAt:2},fallback);assert.equal(pc,2)
await reader(link,fallback,true);assert.equal(rc,1)
now+=31000;fail=true;assert.equal((await reader(link,fallback)).source,'rpc');const attempted=pc
now+=31000;await reader(link,fallback);assert.equal(pc,attempted)


const row=(key,balance='1')=>({chainIndex:'196',tokenContractAddress:key,address:owner,balance,rawBalance:''})
const envelope=rows=>[{tokenAssets:rows}]
assert.throws(()=>parseOkxBalanceRows(envelope([{...row(''),chainIndex:'1'}]),owner))
assert.throws(()=>parseOkxBalanceRows(envelope([{...row(''),address:other}]),owner))
assert.throws(()=>parseOkxBalanceRows(envelope([row(''),row('')]),owner))
assert.throws(()=>parseOkxBalanceRows(envelope([row('','NaN')]),owner))
assert.equal(parseOkxBalanceRows([],owner,true).size,0);assert.throws(()=>parseOkxBalanceRows([],owner))
assert.equal(exactBalanceUnits('1.230000000',6),1230000n);assert.throws(()=>exactBalanceUnits('1.0000001',6))
let calls=[],omit=false
const okxFetch=async(url,init)=>{calls.push({url,init});assert.ok(init.headers['OK-ACCESS-SIGN']);const rows=init.method==='GET'?[row('','0.1')]:omit?[]:[row(stockUsdc.address.toLowerCase(),'2.5')];return new Response(JSON.stringify({code:'0',data:envelope(rows)}))}
const snapshot=await fetchOkxDisplayBalances(owner,undefined,undefined,okxFetch);assert.equal(snapshot.cash,2500000n);assert.equal(snapshot.gas,100000000000000000n);assert.equal(snapshot.blockHash,null);assert.equal(snapshot.source,'okx');assert.equal(calls.length,2)
omit=true;await assert.rejects(fetchOkxDisplayBalances(owner,undefined,undefined,okxFetch))
let providerCalls=0,rpcCalls=0,broken=false
const stockReader=createStockDisplayReader(async()=>{providerCalls++;if(broken)throw Error('429');return {...snapshot,observedAt:now}},async(_o,previous)=>{rpcCalls++;assert.notEqual(previous?.source,'okx');return {...snapshot,source:'rpc',blockNumber:1n,blockHash:'0x'+'1'.repeat(64),observedAt:now}},()=>now)
const cache=createStockBalanceCache(stockReader,()=>now)
await Promise.all([cache.load('a',owner),cache.load('a',owner)]);assert.equal(providerCalls,1);assert.equal(rpcCalls,0)
await cache.load('a',owner,true);assert.equal(rpcCalls,1)
broken=true;now+=31000;await cache.load('a',owner);assert.equal(rpcCalls,2);const attempts=providerCalls
now+=31000;await cache.load('a',owner);assert.equal(providerCalls,attempts)
console.log('PASS provider scope, precision, missing-token rejection, zero routine balance RPC, caching, forced RPC and failure cooldown.')
const {createPocketBalancesHandler}=await import('../api/pocket/balances.ts')
let displayCalls=0,directCalls=0
const handler=createPocketBalancesHandler({verifyUser:async()=>({userId:'fixture'}),readLink:async k=>k==='fixture:base'?link:null,readBalance:async()=>{directCalls++;return 11},readDisplayBalance:async(_l,fallback,fresh)=>{displayCalls++;return {balance:fresh?await fallback():10,observedAt:123,source:fresh?'rpc':'circle'}}})
async function route(query){let body,status=200;await handler({method:'GET',query},{setHeader(){},status(s){status=s;return this},json(v){body=v;return this}});assert.equal(status,200);return body}
assert.equal((await route({})).rows.find(r=>r.key==='base').observedAt,123);assert.equal(directCalls,0)
await route({routing:'bank'});await route({network:'base'});assert.equal(directCalls,2);assert.equal(displayCalls,1)
await route({refresh:'1'});assert.equal(directCalls,3)

const {readRemoteStockBalances}=await import('../src/pocket/api/pocketStockBalanceClient.ts')
const {readStockDisplayCache,saveStockDisplayCache}=await import('../src/pocket/lib/pocketStockDisplayCache.ts')
let wire={...snapshot,observedAt:Date.now()};const originalFetch=globalThis.fetch
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}
globalThis.fetch=async(_url,init)=>{assert.equal(JSON.parse(init.body).provider,'okx');return new Response(JSON.stringify({ok:true,snapshot:wire},(_k,v)=>typeof v==='bigint'?v.toString():v))}
const decoded=await readRemoteStockBalances(async()=>'fixture',owner);assert.equal(decoded.blockNumber,null);assert.equal(decoded.cash,2500000n)
saveStockDisplayCache('fixture',decoded);assert.equal(readStockDisplayCache('fixture').source,'okx');assert.equal(readStockDisplayCache('other'),undefined)
wire={...wire,source:'okx',blockNumber:'1',blockHash:'0x'+'1'.repeat(64)};await assert.rejects(readRemoteStockBalances(async()=>'fixture',owner));globalThis.fetch=originalFetch
console.log('PASS Circle route integration, direct bank routing, OKX wire/cache roundtrip and no invented chain proof.')
process.exit(0)

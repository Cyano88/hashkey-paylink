import assert from 'node:assert/strict'
import {createStockBalanceCache} from '../src/pocket/lib/pocketStockBalanceCache.ts'
import {readStockHoldings,stockClient,stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
let now=100000,calls=0,fail=false,release
const address='0x1111111111111111111111111111111111111111'
const fixture=()=>({holdings:[],cash:100n,gas:100n,complete:true,blockNumber:1n,fullScanAt:now,observedAt:now})
const cache=createStockBalanceCache(async()=>{calls++;if(release)await release;if(fail)throw Error('offline');return fixture()},()=>now)
let finish;release=new Promise(r=>finish=r)
const a=cache.load('user:196:wallet',address),b=cache.load('user:196:wallet',address);assert.equal(calls,1);finish();await Promise.all([a,b]);release=null
await cache.load('user:196:wallet',address);assert.equal(calls,1)
now+=45000;fail=true;await cache.load('user:196:wallet',address);assert.equal(calls,2);assert.ok(cache.peek('user:196:wallet').snapshot)
await cache.load('user:196:wallet',address);assert.equal(calls,2)
now+=15001;assert.equal(cache.peek('user:196:wallet').snapshot,undefined)
assert.equal(cache.peek('other-user').snapshot,undefined)
fail=false;await cache.load('user:196:wallet',address);assert.ok(cache.peek('user:196:wallet').snapshot)
await cache.load('user:196:wallet',address,true);assert.equal(calls,4)
const methods=['getChainId','getBlock','multicall','getLogs','readContract','getBalance'];const old=Object.fromEntries(methods.map(k=>[k,stockClient[k]]))
let block=100n,changed=false,scanned=[]
const asset=stockAssets.find(a=>a.symbol==='NVDAx')
Object.assign(stockClient,{getChainId:async()=>196,getBlock:async(args)=>({number:args.blockNumber??block,hash:'0x'+String(args.blockNumber??block).padStart(64,'0'),timestamp:BigInt(Math.floor(Date.now()/1000))}),getLogs:async()=>changed?[{address:asset.address}]:[],readContract:async()=>100n,getBalance:async()=>100n,multicall:async({contracts})=>{scanned.push(contracts.length);return contracts.map(c=>({status:'success',result:c.functionName==='decimals'?18:changed&&c.address.toLowerCase()===asset.address.toLowerCase()?2n*10n**18n:0n}))}})
try {
 const full=await readStockHoldings(address);assert.equal(scanned[0],808);assert.equal(full.holdings.length,0)
 block++;changed=true;scanned=[];const delta=await readStockHoldings(address,full);assert.equal(scanned[0],1);assert.equal(delta.holdings[0].units,2n*10n**18n)
 block++;changed=false;scanned=[];const unchanged=await readStockHoldings(address,delta);assert.equal(scanned.length,0);assert.equal(unchanged.holdings[0].units,2n*10n**18n)
 block=99n;await assert.rejects(readStockHoldings(address,unchanged),/behind/)
 console.log('PASS: shared request deduplication, TTL, quiet failed refresh, expiry, owner isolation, forced refresh, 808-contract baseline to 1-contract delta, unchanged no scan, lagging node rejection.')
}finally{Object.assign(stockClient,old)}

let lateResolve, timeoutSignal
const bounded=createStockBalanceCache(async(_a,_p,signal)=>{timeoutSignal=signal;return new Promise(resolve=>lateResolve=resolve)},()=>now,10)
await bounded.load('slow',address);assert.equal(bounded.peek('slow').busy,false);assert.ok(bounded.peek('slow').error);assert.equal(timeoutSignal.aborted,true)
lateResolve(fixture());await Promise.resolve();assert.equal(bounded.peek('slow').snapshot,undefined)
console.log('PASS: stalled balance request times out, aborts transport, clears loading and ignores late result.')

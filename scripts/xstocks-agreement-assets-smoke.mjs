import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {tradeXLayerAssets} from '../api/xstocks-agreement/assets.ts';
import {xStockMetadata,xStockPaymentLabel} from '../src/lib/xstocksAgreement/xStocksAssets.ts';
import {TRADE_XLAYER_ARBITER as arbiter} from '../src/lib/xstocksAgreement/protocol.ts';
const catalogue=JSON.parse(readFileSync('src/lib/xstocksAgreement/xStocksCatalog.json','utf8'));
const [a,b]=catalogue.assets;
const code=JSON.parse(readFileSync(new URL('./fixtures/xstocks-agreement-factory-runtime.json',import.meta.url),'utf8')).runtime.slice(2);
const hash='0x'+'ab'.repeat(32);
const env={HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true',HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:a.address,decimals:18},{address:b.address,decimals:18},{address:'0x'+'11'.repeat(20),decimals:18}])};
function client(options={}){let blocks=0;return {
 getChainId:async()=>options.chain??196,getCode:async()=>options.badCode?'0x00':'0x'+code,
 readContract:async()=>arbiter,
 getBlock:async()=>({number:100n,timestamp:BigInt(Math.floor(Date.now()/1000)-(options.stale?120:0)),hash:options.reorg&&blocks++?'0x'+'cd'.repeat(32):hash}),
 multicall:async({contracts})=>{assert.equal(contracts.length,4,'uncatalogued configured token must not be advertised');return [{status:'success',result:true},{status:'success',result:options.decimals??18},{status:options.failure?'failure':'success',result:false},{status:'success',result:18}];},
};}
assert.deepEqual(await tradeXLayerAssets({},{}),{enabled:false,assets:[]});
const result=await tradeXLayerAssets(env,client());assert.equal(result.assets.length,1);assert.equal(result.assets[0].symbol,a.symbol);
assert.equal((await tradeXLayerAssets(env,client({decimals:6}))).assets.length,0,'precision mismatch excluded');
await assert.rejects(()=>tradeXLayerAssets(env,client({chain:1})),/network mismatch/);
await assert.rejects(()=>tradeXLayerAssets(env,client({badCode:true})),/verified deployment/);
await assert.rejects(()=>tradeXLayerAssets(env,client({stale:true})),/unavailable/);
await assert.rejects(()=>tradeXLayerAssets(env,client({reorg:true})),/changed/);
await assert.rejects(()=>tradeXLayerAssets(env,client({failure:true})),/unavailable/);
assert.equal(xStockMetadata(a.address.toUpperCase()).symbol,a.symbol);
assert.equal(xStockPaymentLabel({currency:'XLAYER_ASSET',settlementToken:a.address}),a.name+' ('+a.symbol+')');
assert.equal(xStockPaymentLabel({currency:'USDC'}),'USDC');
assert.match(xStockPaymentLabel({currency:'XLAYER_ASSET',settlementToken:'0x123'}),/0x123/);
console.log('Stock asset selection passed: disabled gate, configured catalogue intersection, factory pin, approval, precision, chain, freshness, reorg, RPC failures and exact identity.');

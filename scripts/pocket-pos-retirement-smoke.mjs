import {build} from 'esbuild';import fs from 'node:fs';import assert from 'node:assert/strict'
// Entirely synthetic data; no provider calls or production store access.
globalThis.posFixture={merchants:{pos_1:{merchant_id:'pos_1',owner_id:'owner',source:'pos',display_name:'Fixture',settlement_enabled:true,payout_preference:'KEEP_CRYPTO',circle_smart_wallet_address:'0x'+'1'.repeat(40),supported_networks:['base'],updated_at:'1'},bank_send:{merchant_id:'bank_send',owner_id:'owner',source:'bank-withdraw'}}}
globalThis.retiredFixture={}
await build({entryPoints:['api/ng-pos.ts'],outfile:'.codex-temp/pos-retirement-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/render-durable-store\.js$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const queryDurablePostgres=async()=>{throw Error('Unexpected database query')};export const withDurablePostgresTransaction=async()=>{throw Error('Unexpected database transaction')};export const hasRenderDurableStore=()=>true;export const readDurableJson=async key=>key==='hashpaylink:ng-pos-merchants'?posFixture:key==='hashpaylink:pocket-pos-retired:v1'?retiredFixture:undefined;export const writeDurableJson=async()=>{};export const mutateDurableJson=async(key,fn)=>{retiredFixture=fn(retiredFixture);return retiredFixture}`}))}}]})
const mod=await import('../.codex-temp/pos-retirement-test.mjs')
assert.equal(await mod.ownsPocketPosQr('owner','pos_1'),true);assert.equal(await mod.ownsPocketPosQr('other','pos_1'),false);assert.equal(await mod.ownsPocketPosQr('owner','bank_send'),false)
assert.equal((await mod.listPocketXPayPosDestinations('owner')).length,1)
retiredFixture.pos_1={owner:'owner',deletedAt:new Date().toISOString()}
assert.equal((await mod.listPocketXPayPosDestinations('owner')).length,0)
assert.equal((await mod.listNgPosResourcesForOwner('owner')).find(m=>m.merchant_id==='pos_1').deleted_at,retiredFixture.pos_1.deletedAt)
assert.equal(await mod.ownsNgPosMerchant('owner','pos_1'),true)
for(const req of [{method:'GET',query:{merchant_id:'pos_1'}},{method:'GET',query:{merchant_id:'pos_1',view:'pocket-scan'}},{method:'POST',query:{},body:{action:'quote',merchant_id:'pos_1',amount:'1000'}}]){let status=200,result;await mod.default(req,{status(n){status=n;return this},json(b){result=b},setHeader(){}});assert.equal(status,404,JSON.stringify(result))}
assert.ok(posFixture.merchants.pos_1)
console.log('PASS retired bank QR rejects fresh checkout/scan/quote, removes receiving destination, retains ownership and historical merchant data.')

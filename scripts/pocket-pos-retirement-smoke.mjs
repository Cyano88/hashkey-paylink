import {build} from 'esbuild';import fs from 'node:fs';import assert from 'node:assert/strict'
// Entirely synthetic data; no provider calls or production store access.
globalThis.posFixture={merchants:{pos_1:{merchant_id:'pos_1',owner_id:'owner',source:'pos',display_name:'Fixture',settlement_enabled:true,payout_preference:'KEEP_CRYPTO',circle_smart_wallet_address:'0x'+'1'.repeat(40),supported_networks:['base'],updated_at:'1'},bank_send:{merchant_id:'bank_send',owner_id:'owner',source:'bank-withdraw'}}}
globalThis.retiredFixture={}
globalThis.terminalFixture={checkouts:[]}
await build({entryPoints:['api/ng-pos.ts'],outfile:'.codex-temp/pos-retirement-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@privy-io\/server-auth$/},()=>({path:'auth',namespace:'auth-fixture'}));b.onLoad({filter:/.*/,namespace:'auth-fixture'},()=>({contents:`export class PrivyClient {async verifyAuthToken(){return {userId:'owner'}} async getUserById(){return {linkedAccounts:[]}}}`}));b.onResolve({filter:/kyc-level\.js$/},a=>a.importer.endsWith('ng-pos.ts')?({path:'kyc',namespace:'kyc-fixture'}):undefined);b.onLoad({filter:/.*/,namespace:'kyc-fixture'},()=>({contents:`export const requirePocketBasicKyc=async()=>{};export const pocketKycLevel=async()=>({level:'basic'})`}));b.onResolve({filter:/render-durable-store\.js$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const deleteDurableJson=async()=>{};export const renderDurableStoreConnectionConfig=()=>null;export const queryDurablePostgres=async()=>{throw Error('Unexpected database query')};export const withDurablePostgresTransaction=async()=>{throw Error('Unexpected database transaction')};export const hasRenderDurableStore=()=>true;export const readDurableJson=async key=>key==='hashpaylink:ng-pos-merchants'?posFixture:key==='hashpaylink:pocket-pos-retired:v1'?retiredFixture:key==='pocket:unified-xpay:v1'?terminalFixture:undefined;export const writeDurableJson=async()=>{};export const mutateDurableJson=async(key,fn)=>{retiredFixture=fn(retiredFixture);return retiredFixture}`}))}}]})
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

delete retiredFixture.pos_1
terminalFixture.checkouts.push({id:'xp_00000000-1111-4111-8111-111111111111',owner:'owner',name:'Fixture',legacyDestinationIds:['pos_1'],destinationIds:[],revisions:[]})
let alias
await mod.default({method:'GET',query:{merchant_id:'pos_1',view:'pocket-scan',code:'https://app.hashpaylink.com/pos/ng?merchant_id=pos_1'}},{status(){return this},json(b){alias=b},setHeader(){}})
assert.equal(alias.terminalId,terminalFixture.checkouts[0].id)
let status=200
await mod.default({method:'POST',body:{action:'quote',merchant_id:'pos_1',amount:'1000'}},{status(n){status=n;return this},json(){},setHeader(){}})
assert.equal(status,409)
console.log('PASS old printed QR routes only to its own terminal; outdated direct quotes cannot bypass terminal settings.')

process.env.PRIVY_APP_ID='fixture';process.env.PRIVY_APP_SECRET='fixture'
const req={headers:{authorization:'Bearer fixture','idempotency-key':'fixture-setup-key-123456'}}
await assert.rejects(()=>mod.createNgPosMerchant(req,{payout_preference:'KEEP_CRYPTO'}),e=>e.status===409)
await assert.rejects(()=>mod.createNgPosMerchant(req,{payout_preference:'INSTANT_FIAT'}),e=>e.status===409)
terminalFixture.checkouts[0].setupKeys=[{key:'fixture-setup-key-123456',kind:'bank'}]
// Reaching ordinary Solana validation proves the owner-bound setup key passes the retirement gate.
await assert.rejects(()=>mod.createNgPosMerchant(req,{payout_preference:'INSTANT_FIAT',supported_networks:['solana']}),e=>e.status===400&&/Solana/.test(e.message))
terminalFixture.checkouts[0].owner='other'
await assert.rejects(()=>mod.createNgPosMerchant(req,{payout_preference:'INSTANT_FIAT'}),e=>e.status===409)
posFixture.merchants.pos_1.idempotency_key='fixture-setup-key-123456'
posFixture.merchants.pos_1.creation_response={ok:true,merchant:{merchant_id:'pos_1'}}
assert.equal((await mod.createNgPosMerchant(req,{payout_preference:'KEEP_CRYPTO'})).replayed,true)
console.log('PASS standalone creation blocked, owner-bound XPay bank setup admitted, foreign key rejected, historical replay preserved')

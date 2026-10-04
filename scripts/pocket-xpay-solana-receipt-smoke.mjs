import {build} from 'esbuild';import assert from 'node:assert/strict';import fs from 'node:fs';
for(const key of ['DATABASE_URL','POSTGRES_URL','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL','DATA_PATH'])delete process.env[key];
const payer='11111111111111111111111111111111',recipient='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
globalThis.receiptFixture={stores:{'hashpaylink:ng-pos-merchants':{merchants:{shop:{merchant_id:'shop',supported_networks:['solana','ethereum','polygon'],network_wallets:{solana:recipient,ethereum:'0x'+'2'.repeat(40),polygon:'0x'+'3'.repeat(40)}}}}},proof:null};
const mocks={
'./render-durable-store.js':`export const hasRenderDurableStore=()=>true;export const readDurableJson=async k=>receiptFixture.stores[k];export const writeDurableJson=async(k,v)=>{receiptFixture.stores[k]=v};export const mutateDurableJson=async(k,fn)=>{receiptFixture.stores[k]=fn(receiptFixture.stores[k]);return receiptFixture.stores[k]}`,
'./solana-usdc-transfer-verify.js':`export const verifySolanaUsdcTransfer=async input=>{receiptFixture.proof=input;if(receiptFixture.reject)throw Error('Invalid proof')}`,
'./og-storage.js':`export const archivePayment=async()=>null`,
'./agent-activity.js':`export const normalizeActivitySlug=()=>'';export const appendAgentActivity=async()=>{}`,
'./paycrest-pos.js':`export const getPaycrestPosOrder=async()=>null`,
'./hosted-checkouts.js':`export const attachHostedCheckoutReceipt=async()=>{};export const hostedCheckoutMode=()=>'';export const hostedCheckoutPaymentOption=()=>null;export const markHostedCheckoutPaid=async()=>{};export const readVerifiedHostedCheckoutRecord=async()=>null`,
'./pocket/unified-xpay-store.js':`export const assertUnifiedXPayDestination=async()=>{}`};
await build({entryPoints:['api/event-registry.ts'],outfile:'.codex-temp/solana-receipt-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]});
const {registerVerifiedPayment,listRegisteredPosPurchases}=await import('../.codex-temp/solana-receipt-fixture.mjs');
const input={eventId:'ngpos-shop',merchantId:'shop',txHash:'A'.repeat(87),chain:'solana',payer,memo:'Purchase',amount:'1',requestedAmount:'1',source:'ngpos',settlementType:'keep_crypto'};
assert.equal((await registerVerifiedPayment(input)).ok,true);assert.equal(receiptFixture.proof.recipient,recipient);assert.equal(receiptFixture.proof.payer,payer);assert.equal((await listRegisteredPosPurchases([payer])).length,1);
assert.equal((await registerVerifiedPayment(input)).duplicate,true);
receiptFixture.reject=true;await assert.rejects(registerVerifiedPayment({...input,txHash:'B'.repeat(87)}));receiptFixture.reject=false;
await assert.rejects(registerVerifiedPayment({...input,settlementType:'instant_fiat'}));
delete receiptFixture.stores['hashpaylink:ng-pos-merchants'].merchants.shop.network_wallets.solana;await assert.rejects(registerVerifiedPayment({...input,txHash:'C'.repeat(87)}));
console.log('PASS Solana POS registration invokes chain proof with canonical recipient, records payer Activity, deduplicates receipt, and rejects missing mapping, invalid proof and bank settlement.');

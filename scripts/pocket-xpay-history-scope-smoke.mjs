import {build} from 'esbuild'
import assert from 'node:assert/strict'
import fs from 'node:fs'
fs.mkdirSync('.codex-temp',{recursive:true})
const merchant=(id,source,owner='owner')=>({merchant_id:id,owner_id:owner,source,display_name:id})
globalThis.qrHistoryFixture={store:{merchants:Object.fromEntries([merchant('qr-a','pos'),merchant('qr-b','pos'),merchant('old-qr',undefined),merchant('bank','bank-withdraw'),merchant('request','bank-receive'),merchant('foreign','pos','other')].map(m=>[m.merchant_id,m])),intents:{a:{intent_id:'a',merchant_id:'qr-a',xpay_checkout_id:'terminal-a'},bank:{intent_id:'bank',merchant_id:'bank'}}},orders:[{intent_id:'a',merchant_id:'qr-a',status:'settled',amount_ngn:'1000',created_at:'2026-01-01'},{intent_id:'bank',merchant_id:'bank',status:'settled',amount_ngn:'2000',created_at:'2026-01-01'}],receipts:['qr-b','old-qr','bank','request','foreign'].map((id,i)=>({eventId:'ngpos-'+id,txHash:'0x'+String(i+1).repeat(64),amount:'1',ts:i,chain:'base'}))}
const names=['createPaycrestOfframpOrder','createPaycrestOnrampOrder','getPaycrestPosOrder','getPaycrestOnrampRate','isPaycrestConfigured','isPaycrestAmountUnavailable','listPaycrestInstitutions','markPaycrestPosPayment','refreshPaycrestOrderStatus','resolvePaycrestOfframpAvailability','verifyPaycrestAccount','getPaycrestOfframpRate']
const mocks={
 './render-durable-store.js':`export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>qrHistoryFixture.store;export const writeDurableJson=async()=>{};`,
 './paycrest-pos.js':names.map(n=>'export const '+n+'=()=>{};').join('')+`export const listPaycrestPosOrdersForMerchants=async(ids)=>{qrHistoryFixture.requestedIds=ids;return qrHistoryFixture.orders.filter(o=>ids.includes(o.merchant_id))};`,
 './event-registry.js':`export const listRegisteredPaymentsForEventIds=async(ids)=>qrHistoryFixture.receipts.filter(p=>ids.includes(p.eventId));`
}
await build({stdin:{contents:"export {listPocketUnifiedXPayPosPayments} from './api/ng-pos'",resolveDir:process.cwd(),loader:'ts'},outfile:'.codex-temp/qr-history-scope.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>a.importer.replaceAll('\\','/').endsWith('/api/ng-pos.ts')&&mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {listPocketUnifiedXPayPosPayments}=await import('../.codex-temp/qr-history-scope.mjs')
assert.deepEqual((await listPocketUnifiedXPayPosPayments('owner')).map(p=>p.merchantName).sort(),['old-qr','qr-a','qr-b'])
assert.deepEqual(qrHistoryFixture.requestedIds.sort(),['old-qr','qr-a','qr-b'])
assert.deepEqual((await listPocketUnifiedXPayPosPayments('owner','terminal-a')).map(p=>p.id),['a'])
assert.deepEqual((await listPocketUnifiedXPayPosPayments('owner','adopted',['old-qr'])).map(p=>p.merchantName),['old-qr'])
assert.deepEqual(await listPocketUnifiedXPayPosPayments('nobody'),[])
console.log('PASS all owned QRs only, legacy history retained, merchant scope isolated; bank transfers, requests and foreign records excluded.')

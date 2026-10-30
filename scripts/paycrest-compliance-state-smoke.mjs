import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {build} from 'esbuild'
import {writeFile,mkdir} from 'node:fs/promises'
import {mergePaycrestOrder} from '../api/paycrest-order-state.ts'
const base={intent_id:'fixture',paycrest_order_id:'provider-fixture',merchant_id:'merchant',source:'bank-send',status:'pending',amount_usdc:'1',updated_at:'2026-10-30T10:00:00Z'}
const held={...base,status_detail:'under_review'}
assert.equal(mergePaycrestOrder({...base,status:'expired'},{...held,updated_at:'2026-10-30T11:00:00Z'}).status,'pending','A newly received provider hold repairs an earlier local expiry')
for(const status of ['expired','cancelled','failed','initiated'])assert.equal(mergePaycrestOrder(held,{...base,status,updated_at:'2026-10-30T11:00:00Z'}).status,'pending')
assert.equal(mergePaycrestOrder(held,{...base,status_detail:undefined}).status_detail,'under_review')
for(const status of ['settled','refunded'])assert.equal(mergePaycrestOrder(held,{...base,status,updated_at:'2026-10-30T11:00:00Z'}).status_detail,undefined)
const store=new Map([['hashpaylink:paycrest-pos-orders',{orders:{fixture:base,'provider-fixture':base}}]])
globalThis.__complianceStore=store
const mocks={
 'render-durable-store':`export const hasRenderDurableStore=()=>true;export const readDurableJson=async k=>globalThis.__complianceStore.get(k);export const mutateDurableJson=async(k,f)=>{const v=await f(globalThis.__complianceStore.get(k));globalThis.__complianceStore.set(k,v);return v}`,
 'pos-payment-executions':`export const syncPosSettlementExecutionByResource=async()=>{}`,
 'hosted-checkouts':`export const markHostedCheckoutNairaPayout=async()=>{throw Error('Unexpected checkout mutation')}`,
 'paycrest-reconcile':`export const reconcilePaycrestOrderPayment=async()=>{throw Error('Unexpected financial reconciliation')}`,
}
const bundle=await build({entryPoints:['api/paycrest-pos.ts'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/(render-durable-store|pos-payment-executions|hosted-checkouts|paycrest-reconcile)\.js$/},a=>({path:Object.keys(mocks).find(k=>a.path.includes(k)),namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
await mkdir('.codex-temp',{recursive:true});await writeFile('.codex-temp/paycrest-compliance-fixture.mjs',bundle.outputFiles[0].text)
const saved={fetch:globalThis.fetch,key:process.env.PAYCREST_API_KEY,secret:process.env.PAYCREST_WEBHOOK_SECRET}
process.env.PAYCREST_API_KEY='fixture';process.env.PAYCREST_WEBHOOK_SECRET='fixture-secret'
try{
 const api=await import('../.codex-temp/paycrest-compliance-fixture.mjs')
 async function webhook(event,data,valid=true){const body=Buffer.from(JSON.stringify({event,data}));let status=200;const res={status(n){status=n;return this},json(v){return v}};await api.paycrestWebhookHandler({body,headers:{'x-paycrest-signature':valid?createHmac('sha256','fixture-secret').update(body).digest('hex'):'invalid'}},res);return status}
 assert.equal(await webhook('payment_order.compliance_hold',{id:base.paycrest_order_id,status:'pending'},false),401)
 assert.equal((await api.getPaycrestPosOrder('fixture')).status_detail,undefined)
 assert.equal(await webhook('payment_order.compliance_hold',{id:base.paycrest_order_id,status:'pending'}),200)
 assert.equal((await api.getPaycrestPosOrder('fixture')).status_detail,'under_review')
 globalThis.fetch=async()=>Response.json({status:'success',data:{id:base.paycrest_order_id,status:'pending'}})
 assert.equal((await api.refreshPaycrestOrderStatus('fixture')).status_detail,'under_review')
 await webhook('payment_order.expired',{id:base.paycrest_order_id,status:'expired'})
 assert.equal((await api.getPaycrestPosOrder('fixture')).status,'pending')
 await webhook('payment_order.refunded',{id:base.paycrest_order_id,status:'refunded',refundReason:'payer_mismatch'})
 const refunded=await api.getPaycrestPosOrder('fixture');assert.equal(refunded.status,'refunded');assert.equal(refunded.status_detail,undefined);assert.equal(refunded.refund_reason,'payer_mismatch')
 await webhook('payment_order.compliance_hold',{id:base.paycrest_order_id,status:'pending'})
 assert.equal((await api.getPaycrestPosOrder('fixture')).status,'refunded')
 store.set('hashpaylink:paycrest-pos-orders',{orders:{fixture:base,'provider-fixture':base}})
 globalThis.fetch=async()=>Response.json({status:'success',data:{id:base.paycrest_order_id,status:'pending',statusDetail:'under_review'}})
 assert.equal((await api.refreshPaycrestOrderStatus('fixture')).status_detail,'under_review')
 globalThis.fetch=async()=>Response.json({status:'success',data:{id:base.paycrest_order_id,status:'refunded',refundReason:'payer_unverified'}})
 assert.equal((await api.refreshPaycrestOrderStatus('fixture')).refund_reason,'payer_unverified')
 console.log('PASS signed hold events, poll metadata, absent-detail preservation, no held expiry, terminal release, refund reasons, invalid signatures and late-event safety; no real provider calls.')
}finally{globalThis.fetch=saved.fetch;for(const [key,v]of [['PAYCREST_API_KEY',saved.key],['PAYCREST_WEBHOOK_SECRET',saved.secret]])if(v===undefined)delete process.env[key];else process.env[key]=v;delete globalThis.__complianceStore}

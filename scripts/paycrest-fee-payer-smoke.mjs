import {build} from 'esbuild'
import assert from 'node:assert/strict'
const store=new Map();globalThis.__feePayerStore=store
const mocks={
 'render-durable-store':`export const hasRenderDurableStore=()=>true;export const readDurableJson=async k=>globalThis.__feePayerStore.get(k);export const mutateDurableJson=async(k,f)=>{const v=await f(globalThis.__feePayerStore.get(k));globalThis.__feePayerStore.set(k,v);return v}`,
 'pos-payment-executions':`export const syncPosSettlementExecutionByResource=async()=>{}`,
 'hosted-checkouts':`export const markHostedCheckoutNairaPayout=async()=>{throw Error('Unexpected hosted checkout mutation')}`,
 'paycrest-reconcile':`export const reconcilePaycrestOrderPayment=async()=>{throw Error('Unexpected reconciliation')}`,
}
const bundle=await build({entryPoints:['api/paycrest-pos.ts'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'isolated-storage',setup(b){b.onResolve({filter:/(render-durable-store|pos-payment-executions|hosted-checkouts|paycrest-reconcile)\.js$/},a=>({path:Object.keys(mocks).find(k=>a.path.includes(k)),namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('.codex-temp',{recursive:true});await writeFile('.codex-temp/paycrest-fee-payer-fixture.mjs',bundle.outputFiles[0].text)
const oldFetch=globalThis.fetch,oldKey=process.env.PAYCREST_API_KEY
process.env.PAYCREST_API_KEY='fixture-only'
let payload,forceNetFee=false
globalThis.fetch=async(url,init)=>{
 assert.equal(new URL(url).pathname,'/v2/sender/orders');assert.equal(init.method,'POST')
 payload=JSON.parse(init.body)
 const fullFee=payload.transactionFeePayer==='customer'&&!forceNetFee
 return Response.json({status:'success',data:{id:'provider-'+payload.reference,status:'initiated',amount:'0.732075',senderFeePercent:'0.25',senderFee:fullFee?'0.0018':'0',transactionFee:'0.02',providerAccount:{receiveAddress:'0x'+'2'.repeat(40),amountToTransfer:fullFee?'0.753875':'0.752075',currency:'USDC',validUntil:new Date(Date.now()+600000).toISOString()}}},{status:201})
}
try{
 const {createPaycrestOfframpOrder}=await import('../.codex-temp/paycrest-fee-payer-fixture.mjs')
 const input={merchantId:'fixture',amountNgn:'1000',estimatedAmountUsdc:'0.732075',bankCode:'FIXTURE',accountNumber:'0000000001',accountName:'FIXTURE',refundAddress:'0x'+'1'.repeat(40),payerName:'FIXTURE'}
 for(const [intentId,source,fiatCurrency,unifiedXPay] of [['ng','bank-withdraw','NGN',false],['ug','bank-withdraw','UGX',false],['xpay','ngpos','NGN',true],['hosted-ng','hosted-checkout','NGN',false],['hosted-ug','hosted-checkout','UGX',false]]){
  const order=await createPaycrestOfframpOrder({...input,intentId,source,fiatCurrency,unifiedXPay})
  assert.equal(payload.transactionFeePayer,'customer');assert.equal(payload.senderFeePercent,'0.25');assert.equal(payload.destination.currency,fiatCurrency)
  assert.equal(order.amount_usdc,'0.753875','Exact funded amount includes full platform fee and provider transaction cost')
 }
 forceNetFee=true
 for(const source of ['bank-withdraw','hosted-checkout'])await assert.rejects(createPaycrestOfframpOrder({...input,intentId:'bad-'+source,source}),/bank fee could not be verified/)
 console.log('PASS actual NG/UG bank, hosted local settlement and XPay requests pin customer fee payer, preserve full 0.25%, bind total, and reject net-fee responses; no real orders created.')
}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.PAYCREST_API_KEY;else process.env.PAYCREST_API_KEY=oldKey;delete globalThis.__feePayerStore}

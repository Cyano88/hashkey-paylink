import assert from 'node:assert/strict'
import {createEsimOrderService} from '../api/pocket/esim-orders.ts'
import {pocketEsimStatus} from '../src/pocket/lib/pocketEsimStatus.ts'

let data, queue=Promise.resolve(), time=1000000, profileStatus='CANCEL', refundCalls=0
const keys=[]
const storage={ready:()=>true,read:async()=>structuredClone(data),mutate:async(_,fn)=>{const next=queue.then(()=>{data=structuredClone(fn(structuredClone(data)));return structuredClone(data)});queue=next.catch(()=>{});return next}}
const payer='0x1111111111111111111111111111111111111111',treasury='0x2222222222222222222222222222222222222222'
const supplier={order:async()=> 'supplier-order',profiles:async()=>[{iccid:'123',status:profileStatus,activationCode:'LPA:1$example.invalid$code'}]}
const options={storage,treasury,encryptionKey:'ab'.repeat(32),purchaseEnabled:()=>true,now:()=>time,
  catalog:{balance:async()=>100000,price:async()=>({public:{subtotal:'5',platformFee:'.0125',total:'5.0125',currency:'USD',days:7},supplierAmount:20000,supplierUnitPrice:20000,daily:false})},
  supplier,readPayer:async()=>payer,verifyTransfer:async()=>({ok:true}),
  refund:async(item)=>{refundCalls++;keys.push(item.refundKey);assert.equal(item.asset,'USDT');assert.equal(item.payer,payer);assert.equal(item.price.total,'5.0125');return {transactionId:'refund-1',txHash:refundCalls>1?'0x'+'2'.repeat(64):'',confirmed:refundCalls>1}}}
const service=createEsimOrderService(options)
await assert.rejects(service.quote({ownerId:'a',requestKey:'request-invalid-01',asset:'USDT',packageCode:'p',days:NaN}),/INVALID_REQUEST/)
const quote=await service.quote({ownerId:'a',requestKey:'request-valid-001',asset:'USDT',packageCode:'p',days:7})
await service.prepare('a',quote.id)
await service.confirm('a',quote.id,'0x'+'1'.repeat(64))
await service.reconcile('a',quote.id)
assert.equal((await service.get('a',quote.id)).state,'refund_eligible')
await Promise.all([service.refund('a',quote.id),service.refund('a',quote.id)])
assert.equal(refundCalls,1)
assert.equal((await service.get('a',quote.id)).state,'refunding')
time+=60001
const restarted=createEsimOrderService(options)
await restarted.refund('a',quote.id)
assert.equal((await restarted.get('a',quote.id)).state,'refunded')
assert.equal(keys[0],keys[1])
await restarted.refund('a',quote.id)
assert.equal(refundCalls,2)
await assert.rejects(restarted.refund('other',quote.id),/NOT_FOUND/)
for(const state of ['provisioning','order_unknown','refund_eligible','refunding','needs_review'])assert.equal(pocketEsimStatus(state).state,'pending')
assert.equal(pocketEsimStatus('ready').state,'successful')
assert.equal(pocketEsimStatus('refunded').state,'reversed')
// An earlier profile response must not roll a canceled order back to ready.
const race=await service.quote({ownerId:'a',requestKey:'request-race-0001',asset:'USDT',packageCode:'p',days:7})
await service.prepare('a',race.id)
await service.confirm('a',race.id,'0x'+'3'.repeat(64))
let releaseProfile, profileRequested
const requested=new Promise(resolve=>{profileRequested=resolve})
let reads=0
supplier.profiles=async()=>{
  if(++reads===1){profileRequested();return new Promise(resolve=>{releaseProfile=resolve})}
  return [{iccid:'123',status:'CANCEL',activationCode:''}]
}
const stale=service.reconcile('a',race.id)
await requested
await service.reconcile('a',race.id)
releaseProfile([{iccid:'123',status:'NEW',activationCode:'LPA:1$example.invalid$code'}])
await stale
assert.equal((await service.get('a',race.id)).state,'refund_eligible')
console.log('PASS eSIM refund ownership, same asset/amount, concurrent claim, durable restart, stable idempotency and truthful UI states')

import assert from 'node:assert/strict'
import {parseUnits,formatUnits} from 'viem'
import {createMerchantPayoutBudget} from '../api/merchant-payout-budget.ts'
import {validateMerchantPaymentFees} from '../src/lib/merchantPaymentFees.ts'
const base={amount:'15000',amountIn:'fiat',senderFeePercent:'0.25',reference:'checkout-test',source:{currency:'USDC',network:'base',refundAddress:'0x'+'1'.repeat(40)},destination:{currency:'NGN',recipient:{institution:'TEST',accountIdentifier:'0000000001'}}}
const probe={transactionFee:'0.01',rate:'1500'}
let calls=[]
const create=async p=>{calls.push(p);return {id:'provider',amount:p.amount,rate:p.rate,senderFee:p.senderFee,senderFeeAddress:p.senderFeeAddress,transactionFee:'0.01',source:p.source,destination:p.destination,providerAccount:{currency:'USDC',amountToTransfer:formatUnits(parseUnits(p.amount,6)+parseUnits(p.senderFee,6)+10000n,6)}}}
const r=await createMerchantPayoutBudget('10',base,probe,create)
assert.deepEqual(r.fees,{payer:'merchant',rounding:'provider-4dp',platformFee:'0.025',networkFee:'0.01',netAmount:'9.965'})
assert.equal(r.netFiat,'14947.5');assert.equal(calls[0].amountIn,'crypto');assert.equal(calls[0].senderFeePercent,undefined);assert.equal(calls[0].transactionFeePayer,'customer');validateMerchantPaymentFees('10',r.fees,6)
for(const gross of ['1.43','0.5','100','2.000001']){
 const r=await createMerchantPayoutBudget(gross,base,probe,create),f=validateMerchantPaymentFees(gross,r.fees,6)
 assert.equal(f.net+f.platform+f.network,parseUnits(gross,6))
}
for(const patch of [{senderFee:'0.1'},{rate:'1400'},{amount:'10'},{totalAmount:'10.1'},{senderFeeAddress:'0x'+'9'.repeat(40)},{transactionFee:'-1'},{providerAccount:undefined},{providerAccount:{currency:'USDC',amountToTransfer:'11'}},{providerAccount:{currency:'USDT',amountToTransfer:'10'}},{source:{...base.source,network:'polygon'}},{destination:{...base.destination,recipient:{institution:'TEST',accountIdentifier:'0000000002'}}}])await assert.rejects(()=>createMerchantPayoutBudget('10',base,probe,async p=>({...await create(p),...patch})))
let n=0
const changed=await createMerchantPayoutBudget('10',base,probe,async p=>{n++;return {...await create(p),transactionFee:'0.02',providerAccount:{currency:'USDC',amountToTransfer:formatUnits(parseUnits(p.amount,6)+parseUnits(p.senderFee,6)+20000n,6)}}})
assert.equal(n,2);assert.equal(changed.fees.netAmount,'9.955')
n=0;await assert.rejects(()=>createMerchantPayoutBudget('10',base,probe,async p=>({...await create(p),transactionFee:formatUnits(BigInt(++n)*10000n,6),totalAmount:'20'})))
await assert.rejects(()=>createMerchantPayoutBudget('0.001',base,probe,create))
console.log('PASS fixed customer budget, provider 4-decimal service-fee rounding, exact funded total, net local settlement, bounded repricing, changed recipient/rate/fee/total rejection. Synthetic provider; no orders created.')

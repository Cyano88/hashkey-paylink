import assert from 'node:assert/strict'
import {approveBankGas} from '../api/marketplace/bank-gas-policy.ts'
import {bankQuoteErrorResponse} from '../api/marketplace/bank-readiness.ts'
const quote={quoteId:'quote_one',networkFeeUnits:'3500',feePolicy:'fixed_success_only',debitUnits:'1050000',ngnMinor:'143339'}
let covered=[]
const coverage=async units=>{covered.push(units);return {id:'coverage_one'}}
for(const [estimate,absorbed] of [[3000n,'0'],[3500n,'0'],[3572n,'72'],[10000n,'6500']]){
 const original=structuredClone(quote),proof=await approveBankGas(quote,estimate,coverage,1000)
 assert.equal(proof.estimatedAbsorbedUnits,absorbed);assert.equal(proof.additionalSellerDebitUnits,'0');assert.equal(proof.quotedNetworkFeeUnits,'3500');assert.equal(proof.estimatedNetworkFeeUnits,estimate.toString());assert.deepEqual(quote,original)
}
const calls=covered.length
await assert.rejects(()=>approveBankGas(quote,10001n,coverage),error=>{const r=bankQuoteErrorResponse(error);return r.status===409&&r.body.quoteRequired&&r.body.approvalRequired&&r.body.payoutSubmitted===false})
assert.equal(covered.length,calls,'Cannot obtain gas approval beyond the accepted fee/absorption cap')
// A higher, explicitly accepted replacement fee is permitted only with coverage.
const replacement={...quote,quoteId:'quote_two',networkFeeUnits:'12000'}
assert.equal((await approveBankGas(replacement,12000n,coverage)).estimatedAbsorbedUnits,'0')
await assert.rejects(()=>approveBankGas(replacement,12001n,coverage))
await assert.rejects(()=>approveBankGas(quote,3572n,async()=>{throw Error('Coverage expired')}),/Coverage expired/)
await assert.rejects(()=>approveBankGas({...quote,networkFeeUnits:undefined},1n,coverage))
await assert.rejects(()=>approveBankGas(quote,-1n,coverage))
console.log('PASS fixed seller charges, bounded total-gas absorption, exact cap boundary, higher seller-approved replacement quote, mandatory sponsorship and no quote mutation.')

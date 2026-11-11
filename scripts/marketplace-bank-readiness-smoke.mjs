import assert from 'node:assert/strict'
import {marketplaceBankReadiness,MarketplaceBankQuoteError,bankQuoteErrorResponse} from '../api/marketplace/bank-readiness.ts'
assert.equal(marketplaceBankReadiness({}).status,'unavailable')
const env={MARKETPLACE_BANK_PAYOUTS_ENABLED:'true',MARKETPLACE_MAX_NETWORK_FEE_UNITS:'10000',MARKETPLACE_PROVIDER_SURCHARGE_BPS:'500'}
assert.equal(marketplaceBankReadiness(env).status,'quote_only')
assert.ok(marketplaceBankReadiness({...env,MARKETPLACE_BANK_WORKER_ENABLED:'true'}).blockers.includes('zero_commission_not_verified'))
assert.equal(marketplaceBankReadiness({...env,MARKETPLACE_BANK_WORKER_ENABLED:'true',MARKETPLACE_BANK_FEE_POLICY_VERIFIED:'true'}).status,'enabled')
assert.equal(marketplaceBankReadiness({...env,MARKETPLACE_PROVIDER_SURCHARGE_BPS:''}).status,'unavailable')
const failure={code:'MARKETPLACE_BANK_COMMISSION_NOT_ZERO',message:'Bank withdrawal fee policy requires zero commission.',details:{commissionUnits:'3000'},httpStatus:503}
assert.deepEqual(bankQuoteErrorResponse(new MarketplaceBankQuoteError(failure)),{status:503,body:{ok:false,error:failure.message,code:failure.code,commissionUnits:'3000',payoutSubmitted:false}})
assert.equal(bankQuoteErrorResponse(Error('raw secret provider error')),null)
console.log('PASS bank readiness is fail-closed; explicit fee policy and gas limits required; structured errors expose only controlled fields.')

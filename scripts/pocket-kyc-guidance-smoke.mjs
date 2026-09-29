import assert from 'node:assert/strict'
import { kycGuidance } from '../src/pocket/lib/kycGuidance.ts'
for (const reason of ['provider_fraud_review','identity_mismatch','identity_name_missing','identity_birth_date_missing_or_invalid',undefined]) {
 const result=kycGuidance({status:'review',failureReason:reason}); assert.equal(result.action,'support'); assert.doesNotMatch(result.message,/updates automatically|waiting for|retake|update your/i)
}
assert.equal(kycGuidance({status:'pending'}).action,'wait')
assert.equal(kycGuidance({status:'review',canResume:true}).action,'resume')
for(const reason of ['provider_rejected','face_mismatch',undefined]) assert.equal(kycGuidance({status:'failed',failureReason:reason}).action,'support')
for(const reason of ['session_failed','provider_error']) assert.equal(kycGuidance({status:'failed',failureReason:reason}).action,'retry')
assert.equal(kycGuidance({status:'passed'}),null)
console.log('PASS actionable KYC guidance, unknown-reason fallback, retry boundaries, and no invented correction instructions')

assert.equal(kycGuidance({status:'review',failureReason:'submitted_name_mismatch',canCorrectNames:true}).action,'correct')
assert.equal(kycGuidance({status:'review',failureReason:'submitted_name_mismatch',canCorrectNames:false}).action,'support')

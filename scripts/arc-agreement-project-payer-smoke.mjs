import assert from 'node:assert/strict'
import { projectPayerUserId, verifiedProjectPayer } from '../api/arc-agreement-project-payer.ts'

const partnerId = 'dev_projectpayer1234'
const agreementId = 'agr_projectpayer123456'
const capability = `agrp_${'p'.repeat(43)}`
const email = 'payer@example.com'
const policy = {
  partnerId,
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
}
const agreement = { id: agreementId, partnerId, checkoutMode: 'human', payerEmail: email }
const request = (payerEmail = email) => ({
  body: { agreementId, payerEmail },
  headers: { 'x-api-key': 'hpl_test_project', 'x-arc-agreement-access': capability },
})
const dependencies = {
  resolvePolicy: async () => policy,
  readAgreement: async (id, access) => id === agreementId && access === capability ? agreement : null,
}

const identity = await verifiedProjectPayer(request(), dependencies)
assert.equal(identity.email, email)
assert.equal(identity.userId, projectPayerUserId(partnerId, email))
assert.equal(identity.userId, projectPayerUserId(partnerId, email.toUpperCase()))

await assert.rejects(
  verifiedProjectPayer(request('other@example.com'), dependencies),
  error => error.status === 403 && /payer email/i.test(error.message),
)
await assert.rejects(
  verifiedProjectPayer(request(), { ...dependencies, resolvePolicy: async () => ({ ...policy, partnerId: 'dev_otherproject1234' }) }),
  error => error.status === 404,
)
await assert.rejects(
  verifiedProjectPayer({ ...request(), headers: { 'x-api-key': 'hpl_test_project' } }, dependencies),
  error => error.status === 400,
)

console.log('Arc Agreement project payer smoke test passed.')

import assert from 'node:assert/strict'
import { createDeveloperCliProjectHandler } from '../api/developer-cli-project.ts'
function response() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
const policy = {
  partnerId: 'project_fixture', merchantName: 'Fixture', environment: 'live',
  checkoutMode: 'human', defaultNetwork: 'arc', paymentOptions: [{ network: 'arc', recipient: 'private-recipient' }],
  settlementMode: 'ngn', webhookConfigured: true, ownerEmail: 'private@example.com',
  ownerId: 'private-owner', nairaSettlement: { accountNumber: 'private-bank' },
}
const handler = createDeveloperCliProjectHandler(async () => policy)
const read = response()
await handler({ method: 'GET', headers: {} }, read)
assert.equal(read.statusCode, 200)
assert.equal(read.headers['Cache-Control'], 'no-store')
assert.deepEqual(Object.keys(read.body.project).sort(), ['id', 'name', 'environment', 'checkoutMode', 'defaultNetwork', 'networks', 'settlementMode', 'webhookConfigured'].sort())
assert.ok(!JSON.stringify(read.body).includes('private'))
let resolutions = 0
const post = response()
await createDeveloperCliProjectHandler(async () => { resolutions++; return policy })({ method: 'POST' }, post)
assert.equal(post.statusCode, 405)
assert.equal(resolutions, 0)
const denied = response()
await createDeveloperCliProjectHandler(async () => null)({ method: 'GET' }, denied)
assert.equal(denied.statusCode, 401)
const failed = response()
await createDeveloperCliProjectHandler(async () => { throw new Error('private-secret') })({ method: 'GET' }, failed)
assert.equal(failed.statusCode, 503)
assert.ok(!JSON.stringify(failed.body).includes('private-secret'))
console.log('Developer CLI project: read-only, authentication, sensitive-field exclusion and safe failure checks passed.')

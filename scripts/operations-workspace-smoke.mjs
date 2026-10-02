import assert from 'node:assert/strict'
import { authorizeOperations, operationsPolicy } from '../api/operations-policy.ts'
import { operationsSession } from '../api/operations-access.ts'
import { createArcAgreementOperationsHandler } from '../api/arc-agreement-operations.ts'
import { createReviewerHandler } from '../api/xstocks-agreement/reviewer.ts'

const a = 'dev_aaaaaaaa1111', b = 'dev_bbbbbbbb2222', c = 'dev_cccccccc3333'
const founder = { userId: 'founder-id', email: 'founder@example.test' }
const staff = { userId: 'staff-id', email: 'reviewer@example.test' }
const env = { OPERATIONS_FOUNDER_EMAILS: founder.email,
  OPERATIONS_WORKSPACES_JSON: JSON.stringify([{ id: 'stream', name: 'Example Stream', projectIds: [a, b] }]),
  OPERATIONS_GRANTS_JSON: JSON.stringify([{ email: staff.email, workspaceId: 'stream', sections: ['agreements', 'trade-disputes'] }]),
  ARC_AGREEMENTS_ENABLED: 'false' }
const req = (workspace = 'stream') => ({ query: { workspace } })
assert.deepEqual(authorizeOperations(staff, req(), 'agreements', a, env).projectIds, [a, b])
assert.throws(() => authorizeOperations(staff, req(), 'projects', a, env), { status: 403 })
assert.throws(() => authorizeOperations(staff, req(), 'agreements', c, env), { status: 404 })
assert.throws(() => authorizeOperations(staff, req('pocket'), 'support', undefined, env), { status: 403 })
assert.throws(() => authorizeOperations(founder, req(), 'support', undefined, env), { status: 403 })
assert.throws(() => authorizeOperations(founder, req(a), 'agreements', a, env), { status: 404 })
assert.throws(() => authorizeOperations(founder, { query: { workspace: ['stream', c] } }, 'projects', a, env), { status: 400 })
assert.throws(() => authorizeOperations(founder, { query: {} }, 'projects', a, env), { status: 400 })
assert.throws(() => operationsPolicy({ DEVELOPER_ADMIN_EMAILS: founder.email }), { status: 503 })
assert.throws(() => operationsPolicy({ ...env, OPERATIONS_WORKSPACES_JSON: JSON.stringify([{ id: 'one', name: 'One', projectIds: [a] }, { id: 'two', name: 'Two', projectIds: [a] }]) }), { status: 503 })
assert.throws(() => operationsPolicy({ ...env, OPERATIONS_GRANTS_JSON: '[{"email":"x@example.test","workspaceId":"stream","sections":["support"]}]' }), { status: 503 })
const projects = [{ id: a, name: 'Human', capabilities: ['arc_agreements', 'xstocks_agreements'] }, { id: b, name: 'Agent', capabilities: ['arc_agreements'] }, { id: c, name: 'Human', capabilities: ['hosted_checkout'] }]
const session = operationsSession(staff, projects, env)
assert.equal(session.workspaces.length, 1)
assert.deepEqual(session.workspaces[0].sections, ['agreements', 'trade-disputes'])
assert.equal(session.arcActivationEnabled, false)
assert.equal(operationsSession(founder, projects, env).workspaces.length, 3)
assert.throws(() => operationsSession({ ...staff, email: 'outsider@example.test' }, projects, env), { status: 403 })
assert.deepEqual(operationsSession(founder, projects, env).workspaces.find(w => w.id === c).sections, ['projects'])

const response = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
let chainReads = 0, approvals = 0, bindings = 0
const seen = []
const actionId = 'opa_' + 'a'.repeat(24)
const handler = createArcAgreementOperationsHandler({
  verifyAdmin: async () => staff,
  scope: (identity, request, id) => authorizeOperations(identity, request, 'agreements', id, env),
  listAgreements: async input => { seen.push(input.partnerId); return [] },
  listAttempts: async () => [{ partnerId: c, agreementId: 'agr_foreign123456', status: 'active', escrow: 'foreign' }],
  listOperatorActions: async () => [{ id: actionId, partnerId: c, status: 'awaiting_review' }],
  listPayerActions: async () => [],
  binding: async () => { bindings++; throw Error('Must not read foreign binding') },
  chainClient: () => { chainReads++; throw Error('Must not read foreign chain') },
  approveAction: async () => { approvals++; throw Error('Must not approve foreign action') },
  env: () => env,
})
const list = response()
await handler({ ...req(), method: 'GET' }, list)
assert.equal(list.statusCode, 200)
assert.deepEqual(list.body.agreements, [])
assert.equal(list.body.summary.review, 0)
assert.deepEqual(seen, [a, b])
assert.equal(chainReads, 0)
const approve = response()
await handler({ ...req(), method: 'POST', body: { action: 'approve', actionId, requestHash: 'a'.repeat(64), reviewNote: 'Cross-workspace approval attempt' } }, approve)
assert.equal(approve.statusCode, 404)
assert.equal(approvals, 0)
const release = response()
await handler({ ...req(), method: 'POST', body: { action: 'request-release', agreementId: 'agr_foreign123456', partnerId: c } }, release)
assert.equal(release.statusCode, 404)
assert.equal(bindings, 0)

let planned = 0, mutated = 0, recordPartner = c
const reviewer = createReviewerHandler({ verifyAdmin: async () => staff, hasStore: () => true,
  scope: (identity, request, section, id) => authorizeOperations(identity, request, section, id, env),
  read: async () => ({ partnerId: recordPartner, binding: { custody: 'xstocks-shares-v2' }, terms: { kind: 'trade' } }),
  plan: async () => { planned++; throw Error('No foreign chain request') },
  mutate: async () => { mutated++; throw Error('No foreign mutation') },
})
for (const action of ['read', 'prepare', 'sign', 'execution']) {
  const result = response()
  await reviewer({ ...req(), method: 'POST', body: { action, agreementId: 'xag_' + 'a'.repeat(64) } }, result)
  assert.equal(result.statusCode, 404)
}
assert.equal(planned, 0); assert.equal(mutated, 0)
recordPartner = undefined
const orphan = response()
await reviewer({ ...req(), method: 'POST', body: { action: 'read', agreementId: 'xag_' + 'a'.repeat(64) } }, orphan)
assert.equal(orphan.statusCode, 404)
assert.equal(planned, 0)
console.log('PASS: founder-only defaults, explicit grouping, section grants, cross-workspace reads/writes/signing denied before side effects, and scoped counts.')

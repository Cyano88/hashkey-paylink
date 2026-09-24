import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createCliGrantHandler, cliRequestScope, resolveCliGrant } from '../api/developer-cli-grants.ts'
import { authCommand } from '../packages/cli/src/auth.mjs'
import { run } from '../packages/cli/src/cli.mjs'

let store, now = Date.now()
const projectId = 'dev_12345678'
let ownerId = 'owner'
const deps = {
  hasStore: () => true, now: () => now, read: async () => store,
  mutate: async update => (store = update(store)),
  owner: async req => {
    if (req.headers.authorization !== 'Bearer owner') throw Object.assign(new Error('Denied'), { status: 403 })
    return { ownerId, name: 'Fixture project', checkoutMode: 'human', operationalStatus: 'active' }
  },
}
const handler = createCliGrantHandler(deps)
async function call(body, authorization = '') {
  const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v }, status(n) { this.statusCode=n; return this }, json(v) { this.body=v; return this } }
  await handler({ method: 'POST', body, headers: { authorization } }, res)
  return res
}
let session
const sessionStore = { read: async () => session, write: async value => { session = value }, clear: async () => { session = undefined } }
let calls = 0
const fetcher = async (url, init) => {
  assert.equal(url, 'https://developer.hashpaylink.com/api/v2/cli/auth')
  assert.equal(init.redirect, 'error')
  calls++
  const res = await call(JSON.parse(init.body), init.headers.authorization)
  return Response.json(res.body, { status: res.statusCode })
}
const login = await authCommand('auth login', { project: projectId }, { fetcher, sessionStore })
assert.equal(login.state, 'pending')
assert.deepEqual(login.scopes, ['project:read', 'checkout:read'])
assert.ok(!JSON.stringify(login).includes(session.token))
assert.ok(!JSON.stringify(store).includes(session.token))
const token = session.token
const id = session.grant.id
assert.equal(await resolveCliGrant(token, 'project:read', deps), null)
assert.equal((await call({ action: 'approve', id, userCode: login.userCode }, 'Bearer other')).statusCode, 403)
assert.equal((await call({ action: 'approve', id, userCode: '000000000000' }, 'Bearer owner')).statusCode, 403)
assert.equal((await call({ action: 'approve', id, userCode: login.userCode }, 'Bearer ' + token)).statusCode, 403)
await assert.rejects(authCommand('auth complete', {}, { fetcher, sessionStore }))
const approve = await call({ action: 'approve', id, userCode: login.userCode }, 'Bearer owner')
assert.equal(approve.statusCode, 200)
assert.equal(Date.parse(approve.body.grant.expiresAt) - now, 3600000)
assert.equal((await call({ action: 'approve', id, userCode: login.userCode }, 'Bearer owner')).statusCode, 409)
await authCommand('auth complete', {}, { fetcher, sessionStore })
assert.equal(session.grant.state, 'approved')
assert.equal((await resolveCliGrant(token, 'project:read', deps)).projectId, projectId)
assert.equal(await resolveCliGrant(token, 'checkout:create', deps), null)
assert.equal(await resolveCliGrant(token + '0', 'project:read', deps), null)
assert.equal(await resolveCliGrant(token, null, deps), null)
const request = (method, originalUrl, body, query) => cliRequestScope({ method, originalUrl, body, query })
assert.equal(request('GET', '/api/v2/project'), 'project:read')
assert.equal(request('GET', '/api/v2/checkouts?id=chk_12345678&purpose=status', undefined, { purpose: 'status' }), 'checkout:read')
assert.equal(request('POST', '/api/v2/checkouts', { checkoutMode: 'human' }), 'checkout:create')
for (const path of ['/api/v2/agreements/payer', '/api/developer-projects', '/api/v2/checkouts/agent/pay', '/api/v2/checkouts?action=select-network']) assert.equal(request('POST', path, {}), null)
assert.equal(request('POST', '/api/v2/checkouts', { checkoutMode: 'agentic' }), null)
assert.equal(request('GET', '/api/v2/checkouts?purpose=status&purpose=return', {}, { purpose: 'status' }), null)
let output = ''
const exit = await run(['project', 'show', '--json'], {
  env: {}, sessionStore, stdout: { write(v) { output += v } }, stderr: { write() {} },
  fetcher: async (_url, init) => { assert.equal(init.headers['X-API-Key'], token); return Response.json({ ok: true, project: { id: projectId } }) },
})
assert.equal(exit, 0)
assert.ok(!output.includes(token))
ownerId = 'different-owner'
assert.equal((await call({ action: 'revoke', id }, 'Bearer owner')).statusCode, 403)
ownerId = 'owner'
assert.equal((await call({ action: 'revoke', id }, 'Bearer owner')).statusCode, 200)
assert.equal(await resolveCliGrant(token, 'project:read', deps), null)
await authCommand('auth logout', {}, { fetcher, sessionStore })
assert.equal(session, undefined)
const second = await authCommand('auth login', { project: projectId, scopes: 'checkout:create' }, { fetcher, sessionStore })
await call({ action: 'approve', id: session.grant.id, userCode: second.userCode }, 'Bearer owner')
assert.ok(await resolveCliGrant(session.token, 'checkout:create', deps))
now += 3600001
assert.equal(await resolveCliGrant(session.token, 'checkout:create', deps), null)
const expired = await call({ action: 'status' }, 'Bearer ' + session.token)
assert.equal(expired.body.grant.state, 'expired')
assert.equal((await call({ action: 'begin', projectId, challenge: createHash('sha256').update('fixture').digest('hex'), scopes: ['keys:create'] })).statusCode, 400)
const inspected = await call({ action: 'inspect', id: session.grant.id }, 'Bearer owner')
assert.ok(!JSON.stringify(inspected.body).includes('challenge'))
assert.ok(!JSON.stringify(inspected.body).includes('codeHash'))
console.log('CLI delegation integration passed: proof possession, owner/code approval, scope/route restrictions, replay, expiry, revocation and protected output.')

await authCommand('auth logout', {}, { fetcher, sessionStore })
const agreementLogin=await authCommand('auth login',{project:projectId,scopes:'project:read,agreement:read,agreement:create,keys:manage'},{fetcher,sessionStore})
assert.equal((await call({action:'approve',id:session.grant.id,userCode:agreementLogin.userCode},'Bearer owner')).statusCode,200)
assert.ok(await resolveCliGrant(session.token,'agreement:read',deps))
assert.ok(await resolveCliGrant(session.token,'agreement:create',deps))
assert.equal(await resolveCliGrant(session.token,'checkout:create',deps),null)
console.log('Owner-approved Agreement draft grant excludes checkout permissions.')

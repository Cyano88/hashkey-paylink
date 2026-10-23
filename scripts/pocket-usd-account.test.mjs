import test from 'node:test'
import assert from 'node:assert/strict'
import { createUsdAccountService, usdEnabled, hostedUrl } from '../api/pocket/usd-account-service.ts'

const address = '0x2222222222222222222222222222222222222222'
function fixture() {
  const store = new Map(), posts = [], events = []
  let approved = false, timeout = false, wrongDestination = false, suspended = false
  const request = async (path, method = 'GET', body, key) => {
    if (method === 'POST') { posts.push({ path, body, key }); if (timeout) { timeout = false; throw Error('Connection lost') } return { id: path === '/kyc_links' ? 'kyc1' : 'account1' } }
    if (path === '/kyc_links/kyc1') return { kyc_status: approved ? 'approved' : 'not_started', tos_status: approved ? 'approved' : 'pending', tos_link: 'https://bridge.xyz/terms', customer_id: 'customer1' }
    if (path === '/customers/customer1') return { id: 'customer1', status: 'active', has_accepted_terms_of_service: true, endorsements: [{ name: 'base', status: 'approved' }] }
    if (path.endsWith('/history')) return { data: events }
    return { id: 'account1', customer_id: 'customer1', status: suspended ? 'deactivated' : 'activated', destination: { currency: 'usdc', payment_rail: 'base', address: wrongDestination ? '0x3333333333333333333333333333333333333333' : address }, source_deposit_instructions: { currency: 'usd', bank_name: 'Test bank', bank_beneficiary_name: 'Jane Test', bank_account_number: '1234567890', bank_routing_number: '021000021', payment_rails: ['ach_push', 'wire'] } }
  }
  const service = createUsdAccountService({ enabled: () => true, request, read: async k => structuredClone(store.get(k)), mutate: async (k, fn) => { const value = await fn(structuredClone(store.get(k))); store.set(k, value); return structuredClone(value) }, lock: async (_k, fn) => fn(), wallet: async () => ({ privyUserId: 'owner', chain: 'base', circleWalletAddress: address }) })
  return { service, posts, events, approve: () => approved = true, timeout: () => timeout = true, mismatch: () => wrongDestination = true, suspend: () => suspended = true }
}
const user = { userId: 'owner', email: 'verified@example.com' }
test('live service requires explicit enablement and a live key; hosted links reject malicious URLs', () => {
  assert(!usdEnabled({})); assert(!usdEnabled({ POCKET_USD_DEPOSITS_ENABLED: 'true', BRIDGE_API_KEY: 'sk-test-example' }))
  assert(usdEnabled({ POCKET_USD_DEPOSITS_ENABLED: 'true', BRIDGE_API_KEY: 'sk-live-example' }))
  for (const url of ['javascript:alert(1)', 'https://bridge.xyz.evil.test', 'https://evil.test', 'https://x@bridge.xyz']) assert.equal(hostedUrl(url), undefined)
  assert.equal(hostedUrl('https://bridge.withpersona.com/verify'), 'https://bridge.withpersona.com/verify')
})
test('GET never creates paid resources; approval and explicit account creation are required', async () => {
  const f = fixture()
  assert.equal((await f.service.run(user)).status, 'start'); assert.equal(f.posts.length, 0)
  assert.equal((await f.service.run(user, 'onboard', 'Jane Test')).status, 'terms')
  assert.equal((await f.service.run(user, 'create')).status, 'terms'); assert.equal(f.posts.length, 1)
  f.approve(); assert.equal((await f.service.run(user)).status, 'create'); assert.equal(f.posts.length, 1)
  const ready = await f.service.run(user, 'create'); assert.equal(ready.status, 'ready')
  assert.equal(f.posts[1].body.destination.address, address)
  await f.service.run(user, 'create'); assert.equal(f.posts.length, 2)
  assert.equal((await f.service.run({ userId: 'other' })).status, 'start')
  f.suspend(); assert.deepEqual(await f.service.run(user), { status: 'restricted' })
})
test('network interruption reuses durable idempotency key and original identity', async () => {
  const f = fixture(); f.timeout()
  await assert.rejects(f.service.run(user, 'onboard', 'Jane Test'))
  await f.service.run(user, 'onboard', 'Different Name')
  assert.equal(f.posts[0].key, f.posts[1].key); assert.equal(f.posts[1].body.full_name, 'Jane Test')
})
test('destination mismatch never exposes bank instructions', async () => {
  const f = fixture(); await f.service.run(user, 'onboard', 'Jane Test'); f.approve(); f.mismatch()
  await assert.rejects(f.service.run(user, 'create'), /destination mismatch/)
})

test('deposit records are idempotent and completion cannot regress; refund remains visible', async () => {
 const f=fixture();await f.service.run(user,'onboard','Jane Test');f.approve();await f.service.run(user,'create');
 const event={id:'event1',customer_id:'customer1',virtual_account_id:'account1',deposit_id:'dep1',type:'payment_processed',created_at:'2026-10-23T10:00:00Z'};
 f.events.push(event);assert.equal((await f.service.run(user)).deposits[0].status,'payment_processed');
 f.events.push({...event,type:'funds_received',created_at:'2026-10-23T10:01:00Z'});
 const reread=await f.service.run(user);assert.equal(reread.deposits.length,1);assert.equal(reread.deposits[0].status,'payment_processed');
 f.events.push({...event,type:'refunded',created_at:'2026-10-23T10:02:00Z'});assert.equal((await f.service.run(user)).deposits[0].status,'refunded');
});

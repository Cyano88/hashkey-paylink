import { createHash, randomUUID } from 'node:crypto'
import { mutateDurableJson, readDurableJson, withDurableSessionLock } from '../render-durable-store.js'

const prefix = 'pocket:bridge-xyz:sandbox:v1:'
const wallet = '0x1111111111111111111111111111111111111111'
const fixtureAddress = { street_line_1: '123 Test Street', city: 'San Francisco', state: 'CA', postal_code: '94111', country: 'USA' }
type Step = { key: string; id?: string; done?: boolean }
type State = { environment: 'sandbox'; owner: string; runId: string; steps: Record<string, Step>; snapshot?: Snapshot }
type Flow = { status: string; amount: string; currency: string }
export type Snapshot = { environment: 'sandbox'; ready: boolean; deposit: Flow; payout: Flow; updatedAt: number }
export const ownerKey = (owner: string) => createHash('sha256').update(owner).digest('hex')
const identifier = (value: unknown): string => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(value)) throw Error('Invalid Bridge resource identifier.'); return value }
const blank = (): Snapshot => ({ environment: 'sandbox', ready: false, deposit: { status: 'not_started', amount: '25', currency: 'USD' }, payout: { status: 'not_started', amount: '10', currency: 'USDC' }, updatedAt: Date.now() })

export async function bridgeSandboxRequest(path: string, method = 'GET', body?: unknown, key?: string): Promise<any> {
  const apiKey = process.env.BRIDGE_SANDBOX_API_KEY || ''
  if (!/^sk-test[^\s]+$/.test(apiKey)) throw Error('Bridge sandbox key is not configured.')
  if (!/^\/[a-zA-Z0-9_/-]+$/.test(path) || path.includes('//')) throw Error('Invalid Bridge sandbox request.')
  if (!['GET', 'POST', 'PUT'].includes(method) || (method === 'POST' && !key)) throw Error('Missing Bridge request identity.')
  let response: globalThis.Response
  try {
    response = await fetch('https://api.sandbox.bridge.xyz/v0' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', ...(method === 'POST' && key ? { 'Idempotency-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch { throw Error('Bridge sandbox is temporarily unavailable. Your test can be resumed.') }
  if (!response.ok) throw Error(`Bridge sandbox returned HTTP ${response.status}.`)
  return response.json()
}

export function bridgeSandboxAllowed(user: { userId: string; email?: string }, env = process.env) {
  return env.POCKET_BRIDGE_SANDBOX_ENABLED === 'true' && Boolean(user.email)
    && (env.POCKET_BRIDGE_SANDBOX_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean).includes(user.email!.toLowerCase())
}

// Only known provider states are displayed. Missing/unknown states never mean success.
export function bridgeSandboxFlowStatus(records: any[], previous = 'not_started') {
  const values = records.map(r => String(r.type || r.state || ''))
  for (const state of ['refunded', 'returned', 'undeliverable', 'error', 'canceled', 'payment_processed', 'payment_submitted', 'in_review', 'funds_received']) {
    if (values.includes(state)) {
      // A stale history response cannot regress established completion to pending.
      if (previous === 'payment_processed' && ['payment_submitted', 'in_review', 'funds_received'].includes(state)) return previous
      if (['refunded', 'returned'].includes(previous) && !['refunded', 'returned'].includes(state)) return previous
      return state
    }
  }
  return previous
}

export function createBridgeSandboxService(d = { request: bridgeSandboxRequest, read: readDurableJson, mutate: mutateDurableJson, lock: withDurableSessionLock }) {
  async function run(owner: string, action: 'status' | 'setup' | 'deposit' | 'payout' = 'status') {
    return d.lock(prefix + 'lock:' + ownerKey(owner), async () => {
      const storeKey = prefix + 'owner:' + ownerKey(owner)
      let state = await d.read<State>(storeKey)
      if (!state && action === 'status') return blank()
      if (!state) state = await d.mutate<State>(storeKey, s => s || ({ environment: 'sandbox', owner, runId: randomUUID(), steps: {} }))
      if (state.environment !== 'sandbox' || state.owner !== owner) throw Error('Sandbox ownership mismatch.')
      const current = state
      async function step(name: string, path: string, body?: unknown, needsId = true) {
        if (!current.steps[name]) {
          const saved = await d.mutate<State>(storeKey, s => { if (!s) throw Error('Missing sandbox state.'); s.steps[name] ||= { key: randomUUID() }; return s })
          current.steps[name] = saved.steps[name]
        }
        const entry = current.steps[name]
        if (!entry.done) {
          const result = await d.request(path, 'POST', body, entry.key)
          const resourceId = needsId ? identifier(result.id) : undefined
          await d.mutate<State>(storeKey, s => { if (!s) throw Error('Missing sandbox state.'); s.steps[name] = { ...entry, done: true, id: resourceId }; return s })
          current.steps[name] = { ...entry, done: true, id: resourceId }
        }
        return current.steps[name].id
      }
      if (action !== 'status') {
        const customerId = await step('customer', '/customers', {
          type: 'individual', first_name: 'Jane', last_name: 'Sandbox', email: `pocket-${current.runId}@example.com`,
          residential_address: fixtureAddress, nationality: 'USA', birth_date: '1980-09-10', phone: '+15555550100',
          signed_agreement_id: current.runId, identifying_information: [{ type: 'ssn', number: '111-11-1111', issuing_country: 'USA' }],
        })
        const root = '/customers/' + identifier(customerId)
        await d.mutate<{ owner: string }>(prefix + 'customer:' + customerId, existing => {
          if (existing && existing.owner !== owner) throw Error('Sandbox customer ownership mismatch.')
          return { owner }
        })
        await step('approval', root + '/simulate_kyc_approval', undefined, false)
        const customer = await d.request(root)
        if (customer.status !== 'active' || customer.has_accepted_terms_of_service !== true || !customer.endorsements?.some((e: any) => e.name === 'base' && e.status === 'approved')) throw Error('Sandbox verification is still processing. Continue shortly.')
        if (action === 'deposit') {
          const account = await step('virtual', root + '/virtual_accounts', { source: { currency: 'usd' }, destination: { payment_rail: 'base', currency: 'usdc', address: wallet }, developer_fee_percent: '0' })
          await step('deposit', root + '/virtual_accounts/' + identifier(account) + '/simulate_deposit', { currency: 'usd', amount: '25.00' }, false)
        }
        if (action === 'payout') {
          const external = await step('external', root + '/external_accounts', {
            currency: 'usd', account_type: 'us', bank_name: 'Sandbox Bank', account_name: 'Sandbox checking',
            first_name: 'Jane', last_name: 'Sandbox', account_owner_type: 'individual', account_owner_name: 'Jane Sandbox',
            account: { routing_number: '021000021', account_number: '123456789', checking_or_savings: 'checking' }, address: fixtureAddress,
          })
          const liquidation = await step('liquidation', root + '/liquidation_addresses', { currency: 'usdc', chain: 'base', external_account_id: external, destination_payment_rail: 'ach', destination_currency: 'usd', return_address: wallet })
          await step('payout', root + '/liquidation_addresses/' + identifier(liquidation) + '/simulate_deposit', { currency: 'usdc', amount: '10.00' }, false)
        }
      }
      const snapshot = current.snapshot || blank()
      if (!current.steps.customer?.id) return snapshot
      const root = '/customers/' + identifier(current.steps.customer?.id)
      const customer = await d.request(root)
      snapshot.ready = customer.status === 'active' && customer.has_accepted_terms_of_service === true && customer.endorsements?.some((e: any) => e.name === 'base' && e.status === 'approved') === true
      for (const flow of ['deposit', 'payout'] as const) {
        const resource = current.steps[flow === 'deposit' ? 'virtual' : 'liquidation']?.id
        if (!resource) continue
        const path = flow === 'deposit' ? `/virtual_accounts/${identifier(resource)}/history` : `/liquidation_addresses/${identifier(resource)}/drains`
        const history = await d.request(root + path)
        const records = Array.isArray(history) ? history : history.data
        if (!Array.isArray(records)) throw Error('Invalid Bridge sandbox history.')
        snapshot[flow].status = bridgeSandboxFlowStatus(records, snapshot[flow].status === 'not_started' && current.steps[flow] ? 'processing' : snapshot[flow].status)
      }
      snapshot.updatedAt = Date.now()
      await d.mutate<State>(storeKey, s => { if (!s) throw Error('Missing sandbox state.'); s.snapshot = snapshot; return s })
      return snapshot
    })
  }
  async function receiveEvent(event: any) {
    const eventId = identifier(event.event_id)
    if (!['customer', 'virtual_account.activity', 'liquidation_address.drain'].includes(event.event_category)) return
    const object = event.event_object
    if (!object || identifier(object.id) !== identifier(event.event_object_id)) throw Error('Invalid event object.')
    const customerId = identifier(event.event_category === 'customer' ? object.id : object.customer_id)
    const mapping = await d.read<{ owner: string }>(prefix + 'customer:' + customerId)
    if (!mapping) return // Unrelated CLI fixtures and other sandbox accounts are never imported.
    const eventKey = prefix + 'event:' + eventId
    if ((await d.read<{ done: boolean }>(eventKey))?.done) return
    // Fetch authoritative provider state. Never apply incoming event amounts or status.
    await run(mapping.owner)
    await d.mutate<{ done: boolean }>(eventKey, () => ({ done: true }))
  }
  return { run, receiveEvent }
}
export const bridgeSandboxService = createBridgeSandboxService()

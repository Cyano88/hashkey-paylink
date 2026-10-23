import { createHash, randomUUID } from 'node:crypto'
import { readDurableJson, mutateDurableJson, withDurableSessionLock } from '../render-durable-store.js'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'

const prefix = 'pocket:bridge-xyz:production:usd:v1:'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const id = (s: unknown) => { if (typeof s !== 'string' || !/^[\w-]{1,150}$/.test(s)) throw Error('Invalid resource'); return s }
type State = { owner: string; email: string; name?: string; kycKey: string; accountKey: string; kycId?: string; accountId?: string; destination?: string }
export function usdEnabled(env = process.env) { return env.POCKET_USD_DEPOSITS_ENABLED === 'true' && /^sk-live\S+$/.test(env.BRIDGE_API_KEY || '') }
export async function usdRequest(path: string, method = 'GET', body?: unknown, key?: string): Promise<any> {
  if (!usdEnabled() || !/^\/[\w/-]+$/.test(path) || path.includes('//') || !['GET', 'POST'].includes(method) || (method === 'POST' && !key)) throw Error('Unavailable')
  const response = await fetch('https://api.bridge.xyz/v0' + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Api-Key': process.env.BRIDGE_API_KEY!, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) throw Error('Account temporarily unavailable')
  return response.json()
}
export function hostedUrl(value: unknown) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password && ['bridge.xyz', 'withpersona.com'].some(h => u.hostname === h || u.hostname.endsWith('.' + h)) ? u.href : undefined } catch { return undefined }
}
export function createUsdAccountService(d = { request: usdRequest, read: readDurableJson, mutate: mutateDurableJson, lock: withDurableSessionLock, wallet: readCircleLink, enabled: usdEnabled }) {
  async function run(user: { userId: string; email?: string }, action = 'status', fullName = ''): Promise<any> {
    if (!d.enabled()) return { status: 'unavailable' }
    return d.lock(prefix + 'lock:' + hash(user.userId), async () => {
      const key = prefix + 'owner:' + hash(user.userId)
      let state = await d.read<State>(key)
      if (!state) {
        if (action !== 'onboard') return { status: 'start' }
        const name = fullName.trim().replace(/\s+/g, ' ')
        if (!user.email || name.length < 3 || name.length > 150 || /[\x00-\x1f]/.test(name)) throw Error('Invalid identity')
        state = await d.mutate<State>(key, s => s || { owner: user.userId, email: user.email!, name, kycKey: randomUUID(), accountKey: randomUUID() })
      }
      if (state.owner !== user.userId) throw Error('Ownership mismatch')
      if (!state.kycId) {
        if (action !== 'onboard') return { status: 'start' }
        const kyc = await d.request('/kyc_links', 'POST', { full_name: state.name, email: state.email, type: 'individual' }, state.kycKey)
        const kycId = id(kyc.id)
        state = await d.mutate<State>(key, s => ({ ...s!, kycId }))
      }
      const kyc = await d.request('/kyc_links/' + id(state.kycId))
      if (['rejected', 'offboarded', 'paused'].includes(kyc.kyc_status)) return { status: 'restricted' }
      if (kyc.tos_status !== 'approved') return { status: 'terms', url: hostedUrl(kyc.tos_link) }
      if (kyc.kyc_status !== 'approved') return { status: kyc.kyc_status === 'under_review' ? 'review' : 'verify', url: hostedUrl(kyc.kyc_link) }
      const customerId = id(kyc.customer_id)
      await d.mutate<{ owner: string; email: string }>(prefix + 'customer:' + customerId, existing => {
        if (existing && existing.owner !== user.userId) throw Error('Customer ownership mismatch')
        return { owner: user.userId, email: state!.email }
      })
      const root = '/customers/' + customerId
      const customer = await d.request(root)
      if (customer.id !== customerId || customer.status !== 'active' || customer.has_accepted_terms_of_service !== true || !customer.endorsements?.some((e: any) => e.name === 'base' && e.status === 'approved')) return { status: 'review' }
      const link = await d.wallet(circleLinkKey(user.userId, 'base', 'payment'))
      const address = link?.circleWalletAddress
      if (!address || link?.privyUserId !== user.userId || link?.chain !== 'base' || !/^0x[\da-f]{40}$/i.test(address) || /^0x0{40}$/i.test(address)) return { status: 'wallet_required' }
      if (state.destination && state.destination.toLowerCase() !== address.toLowerCase()) return { status: 'restricted' }
      if (!state.accountId) {
        if (action !== 'create') return { status: 'create' }
        // Persist the destination and idempotency identity before contacting Bridge.
        state = await d.mutate<State>(key, s => ({ ...s!, destination: address }))
        const account = await d.request(root + '/virtual_accounts', 'POST', { source: { currency: 'usd' }, destination: { currency: 'usdc', payment_rail: 'base', address: state.destination }, developer_fee_percent: '0' }, state.accountKey)
        const accountId = id(account.id)
        state = await d.mutate<State>(key, s => ({ ...s!, accountId }))
      }
      const account = await d.request(root + '/virtual_accounts/' + id(state.accountId))
      if (account.id !== state.accountId || account.customer_id !== customerId || account.destination?.currency !== 'usdc' || account.destination?.payment_rail !== 'base' || account.destination?.address?.toLowerCase() !== address.toLowerCase()) throw Error('Account destination mismatch')
      if (account.status !== 'activated') return { status: account.status === 'deactivated' ? 'restricted' : 'review' }
      const fields = account.source_deposit_instructions
      if (fields?.currency !== 'usd' || !fields.bank_name || !fields.bank_beneficiary_name || !/^\d{4,34}$/.test(fields.bank_account_number) || !/^\d{9}$/.test(fields.bank_routing_number)) throw Error('Incomplete account instructions')
      const history = await d.request(root + '/virtual_accounts/' + id(state.accountId) + '/history')
      if (!Array.isArray(history.data)) throw Error('Invalid deposit history')
      const deposits = await d.mutate<Record<string, { id: string; status: string; at: string }>>(prefix + 'deposits:' + hash(user.userId), saved => {
        const records = saved || {}
        for (const event of [...history.data].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))) {
          if (event.customer_id !== customerId || event.virtual_account_id !== state!.accountId || !event.deposit_id || !['funds_received', 'payment_submitted', 'payment_processed', 'in_review', 'refunded'].includes(event.type)) continue
          const depositId = id(event.deposit_id), previous = records[depositId]
          if (!Number.isFinite(Date.parse(event.created_at))) continue
          if (previous && (previous.at > event.created_at || previous.status === 'refunded' || previous.status === 'payment_processed' && event.type !== 'refunded')) continue
          records[depositId] = { id: depositId, status: event.type, at: event.created_at }
        }
        return records
      })
      return { status: 'ready', deposits: Object.values(deposits).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3), account: { holder: fields.bank_beneficiary_name, bank: fields.bank_name, number: fields.bank_account_number, routing: fields.bank_routing_number, bankAddress: fields.bank_address, beneficiaryAddress: fields.bank_beneficiary_address, rails: (fields.payment_rails || []).filter((r: string) => ['ach_push', 'wire', 'fednow'].includes(r)) } }
    })
  }
  async function receiveEvent(event: any) {
    if (!['customer', 'virtual_account.activity'].includes(event.event_category)) return
    const object = event.event_object
    if (!object || id(object.id) !== id(event.event_object_id)) throw Error('Invalid event')
    const customerId = id(event.event_category === 'customer' ? object.id : object.customer_id)
    const mapping = await d.read<{ owner: string; email: string }>(prefix + 'customer:' + customerId)
    if (!mapping) return
    // The webhook is a notification only; authoritative state is fetched from Bridge.
    await run({ userId: mapping.owner, email: mapping.email })
  }
  return { run, receiveEvent }
}
export const usdAccountService = createUsdAccountService()

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'

export type PocketRequestStatus = 'pending' | 'accepted' | 'declined'
export type PocketMoneyRequest = {
  id: string; eventId: string; senderId: string; senderPocketId: string; senderName: string
  recipientId: string; recipientPocketId: string; title: string; amount: string; flexibleAmount: boolean
  network: 'base' | 'arbitrum' | 'solana' | 'multi'; paymentUrl: string; status: PocketRequestStatus
  createdAt: number; updatedAt: number
}
type Store = { requests: Record<string, PocketMoneyRequest>; notificationReads: Record<string, number> }
type Options = { storePath?: string; storeKey?: string; durable?: boolean; isRender?: boolean; now?: () => number; mutateDurable?: typeof mutateDurableJson; readDurable?: typeof readDurableJson }
const STORE_PATH = process.env.POCKET_REQUEST_STORE ?? './data/pocket-requests.json'
const STORE_KEY = (process.env.POCKET_REQUEST_STORE_KEY ?? 'hashpaylink:pocket-requests:v1').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const normalizedStore = (value?: Partial<Store> | null): Store => ({ requests: value?.requests ?? {}, notificationReads: value?.notificationReads ?? {} })

export function createPocketRequestRepository(options: Options = {}) {
  const storePath = resolve(options.storePath ?? STORE_PATH), storeKey = options.storeKey ?? STORE_KEY
  const durable = options.durable ?? hasRenderDurableStore(), isRender = options.isRender ?? IS_RENDER
  const now = options.now ?? Date.now, mutateRemote = options.mutateDurable ?? mutateDurableJson, readRemote = options.readDurable ?? readDurableJson
  let queue = Promise.resolve()
  async function readLocal() { try { return normalizedStore(JSON.parse(await readFile(storePath, 'utf8')) as Store) } catch { return normalizedStore() } }
  async function writeLocal(store: Store) { await mkdir(dirname(storePath), { recursive: true }); await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8') }
  async function readStore() { if (durable) return normalizedStore(await readRemote<Store>(storeKey)); if (isRender) throw new Error('Durable Pocket request storage is not configured.'); return readLocal() }
  async function mutate<T>(fn: (store: Store) => T) {
    if (durable) { let result: T | undefined; await mutateRemote<Store>(storeKey, current => { const store = normalizedStore(current); result = fn(store); return store }); if (result === undefined) throw new Error('Pocket request mutation returned no result.'); return result }
    if (isRender) throw new Error('Durable Pocket request storage is not configured.')
    let result: T | undefined
    const run = queue.then(async () => { const store = await readLocal(); result = fn(store); await writeLocal(store) })
    queue = run.catch(() => undefined); await run; return result as T
  }
  return {
    async create(input: Omit<PocketMoneyRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) {
      const eventId = clean(input.eventId, 120)
      if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(eventId)) throw Object.assign(new Error('Request identity is invalid.'), { status: 400 })
      if (input.senderId === input.recipientId) throw Object.assign(new Error('Choose another Pocket user.'), { status: 400 })
      let paymentUrl: URL
      try { paymentUrl = new URL(input.paymentUrl) } catch { throw Object.assign(new Error('Payment link is invalid.'), { status: 400 }) }
      const checkoutHost = paymentUrl.hostname.toLowerCase()
      const trustedCheckout = paymentUrl.protocol === 'https:' && (checkoutHost === 'app.hashpaylink.com' || checkoutHost === 'pocket.hashpaylink.com')
      const localCheckout = paymentUrl.protocol === 'http:' && (checkoutHost === 'localhost' || checkoutHost === '127.0.0.1')
      if (!trustedCheckout && !localCheckout) throw Object.assign(new Error('Payment link must use Hash PayLink.'), { status: 400 })
      if (paymentUrl.pathname !== '/pay' || paymentUrl.searchParams.get('id') !== eventId || paymentUrl.searchParams.get('v') !== '1') throw Object.assign(new Error('Payment link does not match this request.'), { status: 400 })
      const flexibleAmount = paymentUrl.searchParams.get('f') === '1'
      const amount = flexibleAmount ? '' : paymentUrl.searchParams.get('a') ?? ''
      const network: PocketMoneyRequest['network'] = paymentUrl.searchParams.get('x') === '1'
        ? 'multi'
        : paymentUrl.searchParams.get('n') === 'solana'
          ? 'solana'
          : paymentUrl.searchParams.get('n') === 'arbitrum'
            ? 'arbitrum'
            : 'base'
      return mutate(store => {
        const existing = Object.values(store.requests).find(item => item.eventId === eventId)
        if (existing) { if (existing.senderId !== input.senderId) throw Object.assign(new Error('This request already belongs to another user.'), { status: 409 }); return { request: existing, replayed: true } }
        const timestamp = now()
        const title = paymentUrl.searchParams.get('m')?.trim().slice(0, 100) || input.title
        const request: PocketMoneyRequest = { ...input, eventId, title, amount, flexibleAmount, network, id: 'preq_' + eventId, paymentUrl: paymentUrl.toString(), status: 'pending', createdAt: timestamp, updatedAt: timestamp }
        store.requests[request.id] = request
        store.notificationReads[input.senderId] = timestamp
        return { request, replayed: false }
      })
    },
    async listFor(userId: string) { return Object.values((await readStore()).requests).filter(item => item.senderId === userId || item.recipientId === userId).sort((a, b) => b.updatedAt - a.updatedAt) },
    async unreadCount(userId: string) {
      const store = await readStore()
      const lastRead = store.notificationReads[userId] ?? 0
      return Object.values(store.requests).filter(item => (item.senderId === userId || item.recipientId === userId) && item.updatedAt > lastRead).length
    },
    async lastRead(userId: string) { return (await readStore()).notificationReads[userId] ?? 0 },
    async markRead(userId: string) { return mutate(store => { store.notificationReads[userId] = now(); return store.notificationReads[userId] }) },
    async decide(userId: string, id: string, decision: 'accept' | 'decline') {
      return mutate(store => {
        const request = store.requests[clean(id, 160)]
        if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
        if (request.recipientId !== userId) throw Object.assign(new Error('Only the requested Pocket user can respond.'), { status: 403 })
        const status = decision === 'accept' ? 'accepted' : 'declined'
        if (request.status === status) return request
        if (request.status !== 'pending') throw Object.assign(new Error('This request already has a response.'), { status: 409 })
        const updated: PocketMoneyRequest = { ...request, status, updatedAt: now() }
        store.requests[id] = updated
        store.notificationReads[userId] = updated.updatedAt
        return updated
      })
    },
  }
}
export type PocketRequestRepository = ReturnType<typeof createPocketRequestRepository>
export const pocketRequestRepository = createPocketRequestRepository()

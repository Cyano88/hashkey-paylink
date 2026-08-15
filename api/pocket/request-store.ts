import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'

export type PocketRequestStatus = 'pending' | 'accepted' | 'declined' | 'paid'
export type PocketRequestRoute = {
  phase: 'started' | 'submitted' | 'completed' | 'failed'
  source: 'base' | 'arbitrum' | 'solana'
  destination: 'base' | 'arbitrum' | 'solana'
  amount: string
  txHash: string
  updatedAt: number
}
export type PocketMoneyRequest = {
  id: string; eventId: string; senderId: string; senderPocketId: string; senderName: string
  senderAddress?: string; recipientId: string; recipientPocketId: string; recipientName?: string
  title: string; amount: string; flexibleAmount: boolean
  network: 'base' | 'arbitrum' | 'solana' | 'multi'; paymentPath?: string
  route?: PocketRequestRoute
  transactionHash?: string; paidAt?: number; status: PocketRequestStatus; createdAt: number; updatedAt: number
}
type Store = { requests: Record<string, PocketMoneyRequest>; notificationReads: Record<string, number>; transactionHashes: Record<string, string> }
type Options = { storePath?: string; storeKey?: string; durable?: boolean; isRender?: boolean; now?: () => number; mutateDurable?: typeof mutateDurableJson; readDurable?: typeof readDurableJson }
const STORE_PATH = process.env.POCKET_REQUEST_STORE ?? './data/pocket-requests.json'
const STORE_KEY = (process.env.POCKET_REQUEST_STORE_KEY ?? 'hashpaylink:pocket-requests:v1').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const normalizedStore = (value?: Partial<Store> | null): Store => {
  const requests = value?.requests ?? {}
  const transactionHashes = { ...(value?.transactionHashes ?? {}) }
  for (const request of Object.values(requests)) {
    if (request.status === 'paid' && request.transactionHash) transactionHashes[request.transactionHash.toLowerCase()] = request.id
  }
  return { requests, notificationReads: value?.notificationReads ?? {}, transactionHashes }
}

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
      const amount = clean(input.amount, 30)
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw Object.assign(new Error('Enter a valid USDC amount.'), { status: 400 })
      const network = input.network === 'solana' || input.network === 'arbitrum' ? input.network : 'base'
      const senderAddress = clean(input.senderAddress, 120)
      if (network === 'solana' ? !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(senderAddress) : !/^0x[a-fA-F0-9]{40}$/.test(senderAddress)) {
        throw Object.assign(new Error(`Open your ${network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'} Pocket wallet before requesting payment.`), { status: 409 })
      }
      return mutate(store => {
        const existing = Object.values(store.requests).find(item => item.eventId === eventId)
        if (existing) { if (existing.senderId !== input.senderId) throw Object.assign(new Error('This request already belongs to another user.'), { status: 409 }); return { request: existing, replayed: true } }
        const timestamp = now()
        const id = 'preq_' + eventId
        const request: PocketMoneyRequest = { ...input, eventId, id, title: clean(input.title, 100) || 'USDC request', amount, flexibleAmount: false, network, senderAddress, paymentPath: `/home/send?request=${encodeURIComponent(id)}`, status: 'pending', createdAt: timestamp, updatedAt: timestamp }
        store.requests[request.id] = request
        store.notificationReads[input.senderId] = timestamp
        return { request, replayed: false }
      })
    },
    async listFor(userId: string) { return Object.values((await readStore()).requests).filter(item => item.senderId === userId || item.recipientId === userId).sort((a, b) => b.updatedAt - a.updatedAt) },
    async getFor(userId: string, id: string) {
      const request = (await readStore()).requests[clean(id, 160)]
      if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
      if (request.senderId !== userId && request.recipientId !== userId) throw Object.assign(new Error('Payment request access is restricted.'), { status: 403 })
      return request
    },
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
    async markPaid(userId: string, id: string, transactionHash: string) {
      return mutate(store => {
        const request = store.requests[clean(id, 160)]
        if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
        if (request.recipientId !== userId) throw Object.assign(new Error('Only the requested Pocket user can pay this request.'), { status: 403 })
        if (request.status === 'paid') return request
        if (request.status !== 'accepted') throw Object.assign(new Error('Accept this request before paying.'), { status: 409 })
        const normalizedHash = clean(transactionHash, 120).toLowerCase()
        if (!normalizedHash) throw Object.assign(new Error('A confirmed transaction is required.'), { status: 400 })
        const claimedBy = store.transactionHashes[normalizedHash]
        if (claimedBy && claimedBy !== request.id) throw Object.assign(new Error('This transaction has already completed another request.'), { status: 409 })
        const timestamp = now()
        const updated: PocketMoneyRequest = { ...request, status: 'paid', transactionHash: clean(transactionHash, 120), paidAt: timestamp, updatedAt: timestamp }
        store.requests[id] = updated
        store.transactionHashes[normalizedHash] = request.id
        return updated
      })
    },
    async readRoute(userId: string, id: string) {
      const request = (await readStore()).requests[clean(id, 160)]
      if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
      if (request.recipientId !== userId) throw Object.assign(new Error('Only the requested Pocket user can route this payment.'), { status: 403 })
      return request.route ?? null
    },
    async startRoute(userId: string, id: string, input: { source: string; destination: string; amount: string }) {
      return mutate(store => {
        const request = store.requests[clean(id, 160)]
        if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
        if (request.recipientId !== userId) throw Object.assign(new Error('Only the requested Pocket user can route this payment.'), { status: 403 })
        if (request.status !== 'accepted') throw Object.assign(new Error('Accept this request before preparing payment.'), { status: 409 })
        const source = clean(input.source, 20)
        const destination = clean(input.destination, 20)
        const amount = clean(input.amount, 30)
        const networks = new Set(['base', 'arbitrum', 'solana'])
        if (!networks.has(source) || !networks.has(destination) || source === destination || destination !== request.network) {
          throw Object.assign(new Error('Pocket payment route is invalid.'), { status: 400 })
        }
        if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > Number(request.amount)) {
          throw Object.assign(new Error('Pocket payment route amount is invalid.'), { status: 400 })
        }
        const existing = request.route
        if (existing && existing.phase !== 'failed') {
          if (existing.source !== source || existing.destination !== destination || existing.amount !== amount) {
            throw Object.assign(new Error('A previous payment move needs review before another route can start.'), { status: 409 })
          }
          return { route: existing, claimed: false }
        }
        const route: PocketRequestRoute = {
          phase: 'started',
          source: source as PocketRequestRoute['source'],
          destination: destination as PocketRequestRoute['destination'],
          amount,
          txHash: '',
          updatedAt: now(),
        }
        store.requests[request.id] = { ...request, route }
        return { route, claimed: true }
      })
    },
    async updateRoute(userId: string, id: string, input: { phase: string; txHash?: string }) {
      return mutate(store => {
        const request = store.requests[clean(id, 160)]
        if (!request) throw Object.assign(new Error('Payment request was not found.'), { status: 404 })
        if (request.recipientId !== userId) throw Object.assign(new Error('Only the requested Pocket user can route this payment.'), { status: 403 })
        const current = request.route
        if (!current) throw Object.assign(new Error('Pocket payment route was not started.'), { status: 409 })
        const phase = clean(input.phase, 20)
        if (phase !== 'submitted' && phase !== 'completed' && phase !== 'failed') {
          throw Object.assign(new Error('Pocket payment route update is invalid.'), { status: 400 })
        }
        if (current.phase === 'completed') return current
        const txHash = clean(input.txHash || current.txHash, 120)
        if (phase === current.phase) {
          if (txHash && current.txHash && txHash !== current.txHash) throw Object.assign(new Error('Pocket payment route already has another transaction.'), { status: 409 })
          return current
        }
        const transitionAllowed = (current.phase === 'started' && (phase === 'submitted' || phase === 'failed'))
          || (current.phase === 'submitted' && phase === 'completed')
        if (!transitionAllowed) throw Object.assign(new Error('Pocket payment route cannot move backward or skip a confirmed phase.'), { status: 409 })
        if ((phase === 'submitted' || phase === 'completed') && !txHash) {
          throw Object.assign(new Error('A bridge transaction is required.'), { status: 400 })
        }
        if (txHash && (current.source === 'solana' ? !/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(txHash) : !/^0x[a-fA-F0-9]{64}$/.test(txHash))) {
          throw Object.assign(new Error('Bridge transaction identity is invalid.'), { status: 400 })
        }
        const route: PocketRequestRoute = { ...current, phase, txHash, updatedAt: now() }
        store.requests[request.id] = { ...request, route }
        return route
      })
    },
  }
}
export type PocketRequestRepository = ReturnType<typeof createPocketRequestRepository>
export const pocketRequestRepository = createPocketRequestRepository()

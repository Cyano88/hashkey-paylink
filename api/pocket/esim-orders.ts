import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import type { verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import type { createEsimCatalogProvider } from './esim-provider.js'
import type { createEsimOrderProvider } from './esim-orders-provider.js'
import type { EsimPrice, EsimPricePolicy } from './esim-pricing.js'

type State = 'quoted' | 'awaiting_payment' | 'payment_received' | 'ordering' | 'order_unknown' | 'provisioning' | 'ready' | 'needs_review'
export type EsimIntent = {
  id: string; ownerId: string; requestKey: string; fingerprint: string; state: State
  packageCode: string; days: number; daily: boolean; asset: 'USDC' | 'USDT'; network: 'base'
  price: EsimPrice; supplierAmount: number; supplierUnitPrice: number
  payer: string; treasury: string; createdAt: number; expiresAt: number
  txHash: string; orderNo: string; attemptedAt: number; profileCipher: string
}
type Data = { intents: Record<string, EsimIntent>; requests: Record<string, string>; payments: Record<string, string> }
type Storage = { ready(): boolean; read<T>(key: string): Promise<T | undefined>; mutate<T>(key: string, fn: (data: T | undefined) => T): Promise<T> }
const storageDefault: Storage = { ready: hasRenderDurableStore, read: readDurableJson, mutate: mutateDurableJson }
const empty = (): Data => ({ intents: {}, requests: {}, payments: {} })
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const fail = (code: string) => { throw new Error(code) }
function owned(data: Data, ownerId: string, id: string) {
  const item = data.intents[id]
  if (!item || item.ownerId !== ownerId) return fail('ESIM_NOT_FOUND')
  return item
}

export function publicEsimIntent(i: EsimIntent) {
  return { id: i.id, state: i.state, packageCode: i.packageCode, days: i.days, asset: i.asset, network: i.network, price: i.price, expiresAt: i.expiresAt, txHash: i.txHash }
}

// This service is not exposed as a payment endpoint until refund handling and
// the wallet approval UI pass the release gate. Never call the supplier on quote.
export function createEsimOrderService(options: {
  catalog: ReturnType<typeof createEsimCatalogProvider>; supplier: ReturnType<typeof createEsimOrderProvider>
  verifyTransfer: typeof verifyEvmUsdcTransfer; readPayer(ownerId: string): Promise<string>
  treasury: string; encryptionKey: string; purchaseEnabled: () => boolean
  policy?: EsimPricePolicy; storage?: Storage; now?: () => number; uuid?: () => string
}) {
  const storage = options.storage ?? storageDefault, now = options.now ?? Date.now, uuid = options.uuid ?? randomUUID
  const key = 'hashpaylink:pocket-esim-orders:v1'
  function enabled() {
    if (!options.purchaseEnabled() || !storage.ready() || !isAddress(options.treasury) || !/^[a-f0-9]{64}$/i.test(options.encryptionKey)) fail('ESIM_PURCHASE_DISABLED')
  }
  async function mutate<T>(fn: (data: Data) => T) {
    if (!storage.ready()) return fail('ESIM_STORAGE_UNAVAILABLE')
    let result: T
    await storage.mutate<Data>(key, current => { const data = current ?? empty(); result = fn(data); return data })
    return structuredClone(result!)
  }
  async function get(ownerId: string, id: string) { return owned(await storage.read<Data>(key) ?? empty(), ownerId, id) }
  function encrypt(profile: unknown, id: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(options.encryptionKey, 'hex'), iv)
    cipher.setAAD(Buffer.from(id))
    const data = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), data].map(value => value.toString('base64url')).join('.')
  }
  async function fulfil(ownerId: string, id: string) {
    // Persist the claim before any supplier request. A crash leaves a recoverable
    // order marker; retries keep the same transactionId and price snapshot.
    const claim = await mutate(data => {
      const item = owned(data, ownerId, id)
      if (!['payment_received', 'order_unknown', 'ordering'].includes(item.state) || (item.attemptedAt && now() - item.attemptedAt < 60_000)) return null
      item.state = 'ordering'; item.attemptedAt = now(); return item
    })
    if (!claim) return get(ownerId, id)
    try {
      const orderNo = await options.supplier.order({ transactionId: claim.id, packageCode: claim.packageCode, days: claim.days, daily: claim.daily, supplierUnitPrice: claim.supplierUnitPrice, supplierAmount: claim.supplierAmount })
      return await mutate(data => { const item = owned(data, ownerId, id); item.orderNo = orderNo; item.state = 'provisioning'; return item })
    } catch {
      return mutate(data => { const item = owned(data, ownerId, id); if (item.state === 'ordering') item.state = 'order_unknown'; return item })
    }
  }
  return {
    async quote(input: { ownerId: string; requestKey: string; packageCode: string; days: number; asset: 'USDC' | 'USDT' }) {
      enabled()
      if (!input.ownerId || !/^[a-zA-Z0-9:_-]{16,128}$/.test(input.requestKey) || !['USDC', 'USDT'].includes(input.asset)) return fail('ESIM_INVALID_REQUEST')
      const fingerprint = hash(JSON.stringify([input.packageCode, input.days, input.asset]))
      const requestKey = hash(input.ownerId + ':' + input.requestKey)
      const existing = await storage.read<Data>(key)
      if (existing?.requests[requestKey]) {
        const item = owned(existing, input.ownerId, existing.requests[requestKey])
        if (item.fingerprint !== fingerprint) return fail('ESIM_IDEMPOTENCY_CONFLICT')
        return item
      }
      const [price, payer] = await Promise.all([options.catalog.price(input.packageCode, input.days, options.policy), options.readPayer(input.ownerId)])
      if (!isAddress(payer) || payer.toLowerCase() === options.treasury.toLowerCase()) return fail('ESIM_WALLET_UNAVAILABLE')
      return mutate(data => {
        const previous = data.requests[requestKey] && owned(data, input.ownerId, data.requests[requestKey])
        if (previous) { if (previous.fingerprint !== fingerprint) return fail('ESIM_IDEMPOTENCY_CONFLICT'); return previous }
        const item: EsimIntent = { id: 'esim_' + uuid(), ownerId: input.ownerId, requestKey, fingerprint, state: 'quoted', packageCode: input.packageCode, days: input.days, daily: price.daily, asset: input.asset, network: 'base', price: price.public, supplierAmount: price.supplierAmount, supplierUnitPrice: price.supplierUnitPrice, payer, treasury: options.treasury, createdAt: now(), expiresAt: now() + 300_000, txHash: '', orderNo: '', attemptedAt: 0, profileCipher: '' }
        data.intents[item.id] = item; data.requests[requestKey] = item.id; return item
      })
    },
    async prepare(ownerId: string, id: string) {
      enabled()
      const balance = await options.catalog.balance()
      return mutate(data => {
        const item = owned(data, ownerId, id)
        if (!['quoted', 'awaiting_payment'].includes(item.state)) return fail('ESIM_INVALID_STATE')
        if (item.expiresAt <= now()) return fail('ESIM_QUOTE_EXPIRED')
        const reserved = Object.values(data.intents).filter(other => other.id !== id && ((other.state === 'awaiting_payment' && other.expiresAt + 300_000 > now()) || ['payment_received', 'ordering', 'order_unknown'].includes(other.state))).reduce((sum, other) => sum + other.supplierAmount, 0)
        if (balance - reserved < item.supplierAmount) return fail('ESIM_STOCK_UNAVAILABLE')
        item.state = 'awaiting_payment'; return item
      })
    },
    async confirm(ownerId: string, id: string, txHash: string) {
      const item = await get(ownerId, id)
      if (!/^0x[a-f0-9]{64}$/i.test(txHash)) return fail('ESIM_INVALID_PAYMENT')
      txHash = txHash.toLowerCase()
      if (item.txHash && item.txHash !== txHash) return fail('ESIM_PAYMENT_CONFLICT')
      if (item.state !== 'awaiting_payment') return item
      // Exact token, amount, payer, recipient, chain and timestamp are verified.
      await options.verifyTransfer({ chain: 'base', token: item.asset, confirmation: 'base-included', txHash, payer: item.payer, recipient: item.treasury, minAmount: item.price.total, exactAmount: true, notBefore: new Date(item.createdAt).toISOString(), notAfter: new Date(item.expiresAt + 300_000).toISOString() })
      await mutate(data => {
        const current = owned(data, ownerId, id), paymentKey = 'base:' + txHash
        if (data.payments[paymentKey] && data.payments[paymentKey] !== id) return fail('ESIM_PAYMENT_ALREADY_USED')
        if (current.txHash && current.txHash !== txHash) return fail('ESIM_PAYMENT_CONFLICT')
        data.payments[paymentKey] = id; current.txHash = txHash
        if (current.state === 'awaiting_payment') current.state = 'payment_received'
        return current
      })
      return options.purchaseEnabled() ? fulfil(ownerId, id) : get(ownerId, id)
    },
    async reconcile(ownerId: string, id: string) {
      let item = await get(ownerId, id)
      if (options.purchaseEnabled() && ['payment_received', 'ordering', 'order_unknown'].includes(item.state)) item = await fulfil(ownerId, id)
      if (item.state !== 'provisioning') return item
      try {
        const profiles = await options.supplier.profiles(item.orderNo)
        if (profiles.length !== 1 || !profiles[0].iccid || !profiles[0].activationCode.startsWith('LPA:1$')) return item
        const encrypted = encrypt(profiles[0], id)
        return mutate(data => { const current = owned(data, ownerId, id); current.profileCipher = encrypted; current.state = 'ready'; return current })
      } catch { return item }
    },
    async installation(ownerId: string, id: string) {
      const item = await get(ownerId, id)
      if (item.state !== 'ready') return fail('ESIM_NOT_READY')
      const [iv, tag, encrypted] = item.profileCipher.split('.').map(value => Buffer.from(value, 'base64url'))
      const cipher = createDecipheriv('aes-256-gcm', Buffer.from(options.encryptionKey, 'hex'), iv)
      cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(tag)
      return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8'))
    },
    get,
  }
}

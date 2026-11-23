import {ESIM_PER_ORDER_USD} from '../../src/lib/billLimits.js'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import type { verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import type { createEsimCatalogProvider } from './esim-provider.js'
import type { createEsimOrderProvider } from './esim-orders-provider.js'
import type { EsimPrice, EsimPricePolicy } from './esim-pricing.js'

type State = 'quoted' | 'awaiting_payment' | 'payment_failed' | 'payment_received' | 'ordering' | 'order_unknown' | 'provisioning' | 'ready' | 'needs_review' | 'refund_eligible' | 'refunding' | 'refunded'
export type EsimIntent = {
  id: string; ownerId: string; requestKey: string; fingerprint: string; state: State
  packageCode: string; days: number; daily: boolean; asset: 'USDC' | 'USDT'; network: 'base'
  price: EsimPrice; supplierAmount: number; supplierUnitPrice: number
  payer: string; treasury: string; createdAt: number; expiresAt: number
  txHash: string; orderNo: string; attemptedAt: number; profileCipher: string
  challengeId?: string; transactionId?: string; paymentKey?: string
  refundKey?: string; refundTransactionId?: string; refundTxHash?: string; refundAttemptedAt?: number
  supplierAttemptedAt?: number
  networkFee?: string; totalDebit?: string; feeQuoteToken?: string; feeQuoteExpiresAt?: number
  packageLabel?: string; topUpFor?: string; supplierTransactionId?: string
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
  return { id: i.id, state: i.state, packageCode: i.packageCode, packageLabel: i.packageLabel, topUpFor: i.topUpFor, days: i.days, asset: i.asset, network: i.network, price: i.price, networkFee: i.networkFee, totalDebit: i.totalDebit, expiresAt: i.expiresAt, createdAt: i.createdAt, txHash: i.txHash, refundTxHash: i.refundTxHash || '' }
}

// Purchases stay behind the explicit release gate. Never order on quote.
export function createEsimOrderService(options: {
  catalog: ReturnType<typeof createEsimCatalogProvider>; supplier: ReturnType<typeof createEsimOrderProvider>
  verifyTransfer: typeof verifyEvmUsdcTransfer; readPayer(ownerId: string): Promise<string>
  treasury: string; encryptionKey: string; purchaseEnabled: () => boolean
  refund?: (item: EsimIntent) => Promise<{ transactionId: string; txHash: string; confirmed: boolean }>
  maxTotal?: number
  requireNetworkFee?: boolean
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
  function decryptProfile(profileCipher: string, id: string) {
    const [iv, tag, encrypted] = profileCipher.split('.').map(value => Buffer.from(value, 'base64url'))
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(options.encryptionKey, 'hex'), iv)
    cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8')) as Record<string, any>
  }
  function topUpAllowed(profile: Record<string, any>) {
    const status = String(profile.status || '').toUpperCase()
    const expiresAt = Date.parse(String(profile.expiresAt || ''))
    const total = Number(profile.totalVolume), used = Number(profile.usedVolume)
    return ['IN_USE', 'GOT_RESOURCE'].includes(status) && Number.isFinite(expiresAt) && expiresAt > now()
      && Number(profile.topUpCount || 0) < 9
      && !(Number.isFinite(total) && total > 0 && Number.isFinite(used) && used >= total)
  }
  async function profileForTopUp(ownerId: string, id: string) {
    const parent = await get(ownerId, id)
    if (parent.state !== 'ready' || !parent.profileCipher) return fail('ESIM_PROFILE_UNAVAILABLE')
    const cached = decryptProfile(parent.profileCipher, parent.id)
    const profiles = await options.supplier.profiles(parent.orderNo)
    if (profiles.length !== 1 || profiles[0].iccid !== cached.iccid) return fail('ESIM_PROFILE_UNAVAILABLE')
    const profile = { ...cached, ...profiles[0], activationCode: cached.activationCode }
    const store = await storage.read<Data>(key) ?? empty()
    const appTopUps = Object.values(store.intents).filter(item => item.topUpFor === id && item.supplierAttemptedAt).length
    profile.topUpCount = Math.max(Number(profile.topUpCount || 0), appTopUps)
    await mutate(data => { const current = owned(data, ownerId, parent.id); if (current.state === 'ready') current.profileCipher = encrypt(profile, current.id) })
    if (!topUpAllowed(profile) || !/^\d{10,22}$/.test(String(profile.iccid || ''))) return fail('ESIM_TOPUP_NOT_AVAILABLE')
    return { parent, profile }
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
      if (claim.topUpFor) {
        const { profile } = await profileForTopUp(ownerId, claim.topUpFor)
        await mutate(data => { const item = owned(data, ownerId, id); item.supplierAttemptedAt ||= now() })
        const result = await options.supplier.topUp({ transactionId: claim.id, iccid: profile.iccid, esimTranNo: profile.esimTranNo, packageCode: claim.packageCode, amount: claim.supplierAmount, daily: claim.daily, days: claim.days })
        return await mutate(data => {
          const item = owned(data, ownerId, id), current = owned(data, ownerId, claim.topUpFor!)
          if (current.state !== 'ready' || !current.profileCipher) return fail('ESIM_PROFILE_UNAVAILABLE')
          const oldProfile = decryptProfile(current.profileCipher, current.id)
          if (oldProfile.iccid !== result.iccid) return fail('ESIM_PROFILE_UNAVAILABLE')
          current.profileCipher = encrypt({ ...oldProfile, totalVolume: result.totalVolume, usedVolume: result.orderUsage, expiresAt: result.expiredTime, topUpCount: Number(oldProfile.topUpCount || 0) + 1 }, current.id)
          item.supplierTransactionId = result.transactionId
          item.state = 'ready'
          return item
        })
      }
      const orderNo = await options.supplier.order({ transactionId: claim.id, packageCode: claim.packageCode, days: claim.days, daily: claim.daily, supplierUnitPrice: claim.supplierUnitPrice, supplierAmount: claim.supplierAmount })
      return await mutate(data => { const item = owned(data, ownerId, id); item.orderNo = orderNo; item.state = 'provisioning'; return item })
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      return mutate(data => { const item = owned(data, ownerId, id); if (item.state === 'ordering') item.state = item.topUpFor && !item.supplierAttemptedAt && ['ESIM_TOPUP_NOT_AVAILABLE', 'ESIM_PROFILE_UNAVAILABLE'].includes(code) ? 'refund_eligible' : 'order_unknown'; return item })
    }
  }
  return {
    async topUpOptions(ownerId: string, profileId: string) {
      enabled()
      const { profile } = await profileForTopUp(ownerId, profileId)
      const destinations = await options.catalog.topUpOptions(profile.iccid)
      return Promise.all(destinations.map(async destination => ({ ...destination, plans: await Promise.all(destination.plans.map(async plan => {
        const priced = await options.catalog.priceTopUp(profile.iccid, plan.id, plan.days, options.policy)
        return { ...plan, price: priced.public }
      })) })))
    },
    async quote(input: { ownerId: string; requestKey: string; packageCode: string; days: number; asset?: 'USDC' | 'USDT'; profileId?: string }) {
      enabled()
      if (!input.ownerId || !/^[a-zA-Z0-9:_-]{16,128}$/.test(input.requestKey) || (input.asset !== undefined && input.asset !== 'USDC')) return fail('ESIM_INVALID_REQUEST')
      if (typeof input.packageCode !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.packageCode) || !Number.isInteger(input.days) || input.days < 1 || input.days > 365) return fail('ESIM_INVALID_REQUEST')
      const asset = 'USDC' as const
      const fingerprint = hash(JSON.stringify([input.profileId || '', input.packageCode, input.days, asset]))
      const requestKey = hash(input.ownerId + ':' + input.requestKey)
      const existing = await storage.read<Data>(key)
      if (existing?.requests[requestKey]) {
        const item = owned(existing, input.ownerId, existing.requests[requestKey])
        if (item.fingerprint !== fingerprint) return fail('ESIM_IDEMPOTENCY_CONFLICT')
        return item
      }
      const parentAndProfile = input.profileId ? await profileForTopUp(input.ownerId, input.profileId) : undefined
      const [price, payer] = await Promise.all([parentAndProfile ? options.catalog.priceTopUp(parentAndProfile.profile.iccid, input.packageCode, input.days, options.policy) : options.catalog.price(input.packageCode, input.days, options.policy), options.readPayer(input.ownerId)])
      if (Number(price.public.total) > (options.maxTotal ?? ESIM_PER_ORDER_USD)) return fail('ESIM_LIMIT_EXCEEDED')
      if (!isAddress(payer) || payer.toLowerCase() === options.treasury.toLowerCase()) return fail('ESIM_WALLET_UNAVAILABLE')
      return mutate(data => {
        const previous = data.requests[requestKey] && owned(data, input.ownerId, data.requests[requestKey])
        if (previous) { if (previous.fingerprint !== fingerprint) return fail('ESIM_IDEMPOTENCY_CONFLICT'); return previous }
        if (input.profileId && Object.values(data.intents).some(other => other.topUpFor === input.profileId && !['quoted', 'payment_failed', 'refunded'].includes(other.state))) return fail('ESIM_PAYMENT_IN_PROGRESS')
        const item: EsimIntent = { id: 'esim_' + uuid(), ownerId: input.ownerId, requestKey, fingerprint, state: 'quoted', packageCode: input.profileId ? (price.slug || input.packageCode) : input.packageCode, days: input.days, daily: price.daily, asset, network: 'base', price: price.public, supplierAmount: price.supplierAmount, supplierUnitPrice: price.supplierUnitPrice, payer, treasury: options.treasury, createdAt: now(), expiresAt: now() + 300_000, txHash: '', orderNo: '', attemptedAt: 0, profileCipher: '', ...(input.profileId ? { topUpFor: input.profileId } : {}) }
        item.packageLabel = input.profileId ? `Add data · ${price.packageLabel}` : price.packageLabel
        data.intents[item.id] = item; data.requests[requestKey] = item.id; return item
      })
    },
    async bindFee(ownerId: string, id: string, fee: { networkFee: string; totalDebit: string; token: string; expiresAt: number }) {
      return mutate(data => {
        const item = owned(data, ownerId, id)
        if (item.state !== 'quoted' || item.expiresAt <= now() || fee.expiresAt <= now()) return fail('ESIM_QUOTE_EXPIRED')
        item.networkFee = fee.networkFee; item.totalDebit = fee.totalDebit; item.feeQuoteToken = fee.token
        item.feeQuoteExpiresAt = fee.expiresAt; item.expiresAt = Math.min(item.expiresAt, fee.expiresAt)
        return item
      })
    },
    async prepare(ownerId: string, id: string) {
      enabled()
      const current = await get(ownerId, id)
      if (current.topUpFor) await profileForTopUp(ownerId, current.topUpFor)
      const balance = await options.catalog.balance()
      return mutate(data => {
        const item = owned(data, ownerId, id)
        if (!['quoted', 'awaiting_payment'].includes(item.state)) return fail('ESIM_INVALID_STATE')
        if (item.asset !== 'USDC' && !item.txHash && !item.challengeId && !item.transactionId) return fail('ESIM_CASH_BALANCE_ONLY')
        if (item.expiresAt <= now()) return fail('ESIM_QUOTE_EXPIRED')
        if (options.requireNetworkFee && (!item.feeQuoteToken || !item.feeQuoteExpiresAt || item.feeQuoteExpiresAt <= now())) return fail('ESIM_QUOTE_EXPIRED')
        if (Object.values(data.intents).some(other => other.id !== id && other.ownerId === ownerId && other.state === 'awaiting_payment' && (other.challengeId || other.txHash || other.expiresAt > now()))) return fail('ESIM_PAYMENT_IN_PROGRESS')
        const reserved = Object.values(data.intents).filter(other => other.id !== id && ((other.state === 'awaiting_payment' && other.expiresAt + 300_000 > now()) || ['payment_received', 'ordering', 'order_unknown'].includes(other.state))).reduce((sum, other) => sum + other.supplierAmount, 0)
        if (balance - reserved < item.supplierAmount) return fail('ESIM_STOCK_UNAVAILABLE')
        item.paymentKey ||= randomUUID(); item.state = 'awaiting_payment'; return item
      })
    },
    async track(ownerId: string, id: string, input: { challengeId?: string; transactionId?: string; txHash?: string }) {
      return mutate(data => {
        const item = owned(data, ownerId, id)
        if (item.state !== 'awaiting_payment') return item
        for (const field of ['challengeId', 'transactionId', 'txHash'] as const) {
          const value = input[field]
          if (!value) continue
          if (field === 'txHash' ? !/^0x[a-f0-9]{64}$/i.test(value) : !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) return fail('ESIM_INVALID_PAYMENT')
          if (item[field] && item[field]!.toLowerCase() !== value.toLowerCase()) return fail('ESIM_PAYMENT_CONFLICT')
          item[field] = value
        }
        return item
      })
    },
    async retireUnsubmitted(ownerId: string, id: string) {
      return mutate(data => { const item = owned(data, ownerId, id); if (item.state === 'awaiting_payment' && !item.txHash) item.state = 'payment_failed'; return item })
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
        if (profiles.length === 1 && profiles[0].status === 'CANCEL') return mutate(data => { const current = owned(data, ownerId, id); if (current.state === 'provisioning') current.state = 'refund_eligible'; return current })
        if (profiles.length !== 1 || !profiles[0].iccid || !/^LPA:1\$[^$\s]+\$[^$\s]+(?:\$[^\s]*)?$/.test(profiles[0].activationCode)) return item
        const encrypted = encrypt(profiles[0], id)
        return mutate(data => { const current = owned(data, ownerId, id); if (current.state === 'provisioning') { current.profileCipher = encrypted; current.state = 'ready' }; return current })
      } catch { return item }
    },
    async installation(ownerId: string, id: string) {
      const item = await get(ownerId, id)
      if (item.state !== 'ready') return fail('ESIM_NOT_READY')
      const [iv, tag, encrypted] = item.profileCipher.split('.').map(value => Buffer.from(value, 'base64url'))
      const cipher = createDecipheriv('aes-256-gcm', Buffer.from(options.encryptionKey, 'hex'), iv)
      cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(tag)
      const cached = JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8'))
      // Refresh only this owner's issued profile. Older encrypted profiles did
      // not retain APN data; a provider outage must not hide installation details.
      try {
        const profiles = await options.supplier.profiles(item.orderNo)
        if (profiles.length === 1 && profiles[0].iccid === cached.iccid) {
          const profile = { ...cached, ...profiles[0], activationCode: cached.activationCode }
          const profileCipher = encrypt(profile, id)
          await mutate(data => { const current = owned(data, ownerId, id); if (current.state === 'ready') current.profileCipher = profileCipher })
          return { iccid: profile.iccid, activationCode: profile.activationCode, apn: profile.apn, status: profile.status, smdpStatus: profile.smdpStatus, totalVolume: profile.totalVolume, usedVolume: profile.usedVolume, expiresAt: profile.expiresAt }
        }
      } catch { /* Keep the encrypted, owner-scoped fallback available. */ }
      return { iccid: cached.iccid, activationCode: cached.activationCode, apn: cached.apn, status: cached.status, smdpStatus: cached.smdpStatus, totalVolume: cached.totalVolume, usedVolume: cached.usedVolume, expiresAt: cached.expiresAt }
    },
    async refund(ownerId: string, id: string) {
      if (!options.refund) return fail('ESIM_REFUND_UNAVAILABLE')
      const existing = await get(ownerId, id)
      if (existing.state === 'refunded') return existing
      if (!['refund_eligible', 'refunding'].includes(existing.state) || !existing.txHash || (!existing.orderNo && !existing.topUpFor)) return fail('ESIM_REFUND_NOT_ELIGIBLE')
      if (existing.topUpFor) {
        if (existing.supplierAttemptedAt) return fail('ESIM_REFUND_NOT_ELIGIBLE')
      } else {
        // Recheck the provider, never refund an unknown or slowly provisioning order.
        const profiles = await options.supplier.profiles(existing.orderNo)
        if (profiles.length !== 1 || profiles[0].status !== 'CANCEL') return fail('ESIM_REFUND_NOT_ELIGIBLE')
      }
      const claim = await mutate(data => {
        const item = owned(data, ownerId, id)
        if (!['refund_eligible', 'refunding'].includes(item.state) || (item.refundAttemptedAt && now() - item.refundAttemptedAt < 60_000)) return null
        item.refundKey ||= randomUUID(); item.refundAttemptedAt = now(); item.state = 'refunding'; return item
      })
      if (!claim) return get(ownerId, id)
      const result = await options.refund(claim)
      return mutate(data => { const item = owned(data, ownerId, id); item.refundTransactionId = result.transactionId; item.refundTxHash = result.txHash; if (result.confirmed) item.state = 'refunded'; return item })
    },
    async list(ownerId: string) {
      return Object.values((await storage.read<Data>(key) ?? empty()).intents).filter(item => item.ownerId === ownerId && item.state !== 'quoted').sort((a, b) => b.createdAt - a.createdAt)
    },
    async activityList(ownerId: string) {
      return Object.values((await storage.read<Data>(key) ?? empty()).intents).filter(item => item.ownerId === ownerId && item.state !== 'quoted').sort((a, b) => b.createdAt - a.createdAt)
    },
    async providerNoticeOwner(transactionId: string) {
      const item = Object.values((await storage.read<Data>(key) ?? empty()).intents).find(value => value.id === transactionId || value.supplierTransactionId === transactionId)
      return item ? { ownerId: item.ownerId, profileId: item.topUpFor || item.id } : null
    },
    async pending() {
      return Object.values((await storage.read<Data>(key) ?? empty()).intents).filter(item => ['payment_received', 'ordering', 'order_unknown', 'provisioning', 'refund_eligible', 'refunding'].includes(item.state) || (item.state === 'awaiting_payment' && item.txHash))
    },
    get,
  }
}

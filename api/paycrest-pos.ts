import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { hasRenderDurableStore, readDurableJson, writeDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.PAYCREST_POS_STORE ?? './data/paycrest-pos-orders.json'
const STORE_KEY = (process.env.PAYCREST_POS_STORE_KEY ?? 'hashpaylink:paycrest-pos-orders').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()

export type PaycrestOrderRecord = {
  intent_id: string
  paycrest_order_id: string
  merchant_id: string
  amount_ngn: string
  amount_usdc: string
  receive_address: string
  refund_address: string
  payer_email?: string
  payer_wallet?: string
  tx_hash?: string
  status: string
  valid_until?: string
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
  created_at: string
  updated_at: string
  raw?: unknown
}

type PaycrestStore = {
  orders: Record<string, PaycrestOrderRecord>
}

function paycrestBaseUrl() {
  return (process.env.PAYCREST_API_BASE ?? 'https://api.paycrest.io').replace(/\/+$/, '')
}

function paycrestApiKey() {
  return process.env.PAYCREST_API_KEY?.trim() || ''
}

function paycrestWebhookSecret() {
  return process.env.PAYCREST_WEBHOOK_SECRET?.trim() || process.env.PAYCREST_API_SECRET?.trim() || ''
}

export function isPaycrestConfigured() {
  return Boolean(paycrestApiKey())
}

export type PaycrestInstitution = {
  code: string
  name: string
  type?: string
}

function unwrapData<T = any>(body: any): T {
  if (body && typeof body === 'object' && 'data' in body && body.data != null) return body.data as T
  return body as T
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function decimalText(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d+(?:\.\d+)?$/.test(text) ? text : ''
}

function addDecimalStrings(...values: unknown[]) {
  const parsed = values.map(decimalText).filter(Boolean)
  if (!parsed.length) return ''
  const scale = Math.max(...parsed.map((value) => (value.split('.')[1] ?? '').length), 6)
  const total = parsed.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.')
    return sum + BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0').slice(0, scale) || '0')
  }, 0n)
  const whole = total / 10n ** BigInt(scale)
  const fraction = (total % (10n ** BigInt(scale))).toString().padStart(scale, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function payableCryptoAmount(data: any) {
  const explicit = firstText(
    data?.amountToPay,
    data?.amount_to_pay,
    data?.totalAmount,
    data?.total_amount,
    data?.amountDue,
    data?.amount_due,
    data?.source?.amount,
    data?.sourceAmount,
    data?.source_amount,
  )
  if (explicit) return explicit
  const amount = decimalText(data?.amount)
  if (!amount) return ''
  return addDecimalStrings(amount, data?.senderFee, data?.transactionFee)
}

async function paycrestFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = paycrestApiKey()
  if (!apiKey) throw new Error('PAYCREST_API_KEY is required for Paycrest POS off-ramp.')
  const response = await fetch(`${paycrestBaseUrl()}${path}`, {
    ...init,
    headers: {
      'API-Key': apiKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const validation = Array.isArray((body as any).errors)
      ? (body as any).errors.map((item: any) => firstText(item?.message, item?.msg, item)).filter(Boolean).join('; ')
      : firstText((body as any).details, (body as any).detail)
    const message = firstText(validation, (body as any).error, (body as any).message, 'Paycrest request failed.')
    throw new Error(message)
  }
  return unwrapData<T>(body)
}

async function readStore(): Promise<PaycrestStore> {
  try {
    const remote = await readDurableJson<Partial<PaycrestStore>>(STORE_KEY)
    if (remote) return { orders: remote.orders ?? {} }
  } catch (error) {
    console.warn('[paycrest-pos] durable load failed; using file fallback.', error instanceof Error ? error.message : String(error))
  }

  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PaycrestStore>
    return { orders: parsed.orders ?? {} }
  } catch {
    return { orders: {} }
  }
}

async function writeStore(store: PaycrestStore) {
  const normalized = { orders: store.orders ?? {} }
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

  if (IS_RENDER && !HAS_DURABLE_STORE) {
    throw new Error('Durable Paycrest POS storage is not configured. Add DATABASE_URL on Render.')
  }

  try {
    await writeDurableJson(STORE_KEY, normalized)
  } catch (error) {
    if (IS_RENDER) throw new Error('Durable Paycrest POS storage failed. Check DATABASE_URL on Render.')
    console.warn('[paycrest-pos] durable save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
  }
}

export async function verifyPaycrestAccount(input: { institution: string; accountIdentifier: string }) {
  const data = await paycrestFetch<any>('/v2/verify-account', {
    method: 'POST',
    body: JSON.stringify({
      institution: input.institution,
      accountIdentifier: input.accountIdentifier,
    }),
  })
  return firstText(data?.accountName, data?.account_name, data?.name, data)
}

export async function listPaycrestInstitutions(currency = 'NGN'): Promise<PaycrestInstitution[]> {
  const normalizedCurrency = currency.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'NGN'
  const data = await paycrestFetch<any>(`/v2/institutions/${encodeURIComponent(normalizedCurrency)}`, { method: 'GET' })
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.institutions)
      ? data.institutions
      : Array.isArray(data?.items)
        ? data.items
        : []

  return rows
    .map((row: any) => {
      const code = firstText(row?.code, row?.institution, row?.id).toUpperCase()
      const name = firstText(row?.name, row?.displayName, row?.display_name, row?.label)
      const type = firstText(row?.type, row?.channel)
      return code && name ? { code, name, type: type || undefined } : null
    })
    .filter(Boolean) as PaycrestInstitution[]
}

export async function getPaycrestOfframpRate(input: { network?: string; token?: string; fiat?: string; amount?: string } = {}) {
  const network = (input.network ?? 'base').trim().toLowerCase()
  const token = (input.token ?? 'USDC').trim().toUpperCase()
  const fiat = (input.fiat ?? 'NGN').trim().toUpperCase()
  const amount = decimalText(input.amount) || '1'
  const data = await paycrestFetch<any>(`/v2/rates/${encodeURIComponent(network)}/${encodeURIComponent(token)}/${encodeURIComponent(amount)}/${encodeURIComponent(fiat)}?side=sell`, { method: 'GET' })
  const rate = Number(firstText(data?.sell?.rate, data?.rate, data?.sellRate, data?.sell_rate))
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Paycrest did not return a valid NGN rate.')
  return rate
}

export async function createPaycrestOfframpOrder(input: {
  intentId: string
  merchantId: string
  amountNgn: string
  estimatedAmountUsdc: string
  bankCode: string
  accountNumber: string
  accountName: string
  bankName?: string
  refundAddress: string
  payerEmail?: string
  payerWallet?: string
  memo?: string
}) {
  if (!isAddress(input.refundAddress)) throw new Error('A valid Circle refund wallet is required.')
  const reference = `ngpos-${input.intentId}`.slice(0, 90)
  const senderFeePercent = process.env.PAYCREST_SENDER_FEE_PERCENT?.trim()
  const payload: Record<string, unknown> = {
    amount: input.amountNgn,
    amountIn: 'fiat',
    source: {
      type: 'crypto',
      currency: 'USDC',
      network: 'base',
      refundAddress: input.refundAddress,
    },
    destination: {
      type: 'fiat',
      currency: 'NGN',
      recipient: {
        institution: input.bankCode,
        accountIdentifier: input.accountNumber,
        accountName: input.accountName,
        memo: input.memo || 'Hash PayLink',
      },
    },
    reference,
  }
  if (senderFeePercent) payload.senderFeePercent = senderFeePercent

  const data = await paycrestFetch<any>('/v2/sender/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const providerAccount = data?.providerAccount ?? data?.provider_account ?? {}
  const receiveAddress = firstText(providerAccount.receiveAddress, providerAccount.receive_address)
  if (!isAddress(receiveAddress)) throw new Error('Paycrest did not return a valid Base receive address.')

  const amountUsdc = payableCryptoAmount(data)
  if (!amountUsdc || Number(amountUsdc) <= 0) {
    throw new Error('Paycrest did not return the exact USDC amount to collect.')
  }

  const now = new Date().toISOString()
  const record: PaycrestOrderRecord = {
    intent_id: input.intentId,
    paycrest_order_id: firstText(data?.id, data?.orderId, data?.order_id),
    merchant_id: input.merchantId,
    amount_ngn: input.amountNgn,
    amount_usdc: amountUsdc,
    receive_address: receiveAddress,
    refund_address: input.refundAddress,
    payer_email: input.payerEmail,
    payer_wallet: input.payerWallet || input.refundAddress,
    status: firstText(data?.status, 'initiated'),
    valid_until: firstText(providerAccount.validUntil, providerAccount.valid_until),
    bank_name: input.bankName,
    bank_last4: input.accountNumber.slice(-4),
    bank_account_name: input.accountName,
    created_at: now,
    updated_at: now,
    raw: data,
  }
  if (!record.paycrest_order_id) throw new Error('Paycrest did not return an order id.')

  const store = await readStore()
  store.orders[record.intent_id] = record
  store.orders[record.paycrest_order_id] = record
  await writeStore(store)
  return record
}

export async function getPaycrestPosOrder(id: string) {
  const store = await readStore()
  return store.orders[id] ?? null
}

export async function listPaycrestPosOrdersForMerchants(merchantIds: string[]) {
  const wanted = new Set(merchantIds.map(id => id.trim()).filter(Boolean))
  if (!wanted.size) return []
  const store = await readStore()
  const seen = new Set<string>()
  return Object.values(store.orders)
    .filter(order => wanted.has(order.merchant_id))
    .filter(order => {
      const key = order.intent_id || order.paycrest_order_id
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
}

export async function markPaycrestPosPayment(input: { id: string; txHash: string; payerEmail?: string; payerWallet?: string }) {
  const store = await readStore()
  const record = store.orders[input.id]
  if (!record) return null
  const updated = {
    ...record,
    tx_hash: input.txHash,
    payer_email: input.payerEmail || record.payer_email,
    payer_wallet: input.payerWallet || record.payer_wallet,
    updated_at: new Date().toISOString(),
  }
  store.orders[updated.intent_id] = updated
  store.orders[updated.paycrest_order_id] = updated
  await writeStore(store)
  return updated
}

export async function refreshPaycrestOrderStatus(id: string) {
  const record = await getPaycrestPosOrder(id)
  if (!record) return null
  const data = await paycrestFetch<any>(`/v2/sender/orders/${encodeURIComponent(record.paycrest_order_id)}`, { method: 'GET' })
  const status = firstText(data?.status, record.status)
  const store = await readStore()
  const updated = { ...record, status, raw: data, updated_at: new Date().toISOString() }
  store.orders[updated.intent_id] = updated
  store.orders[updated.paycrest_order_id] = updated
  await writeStore(store)
  return updated
}

export function verifyPaycrestWebhook(rawBody: Buffer, signature: unknown) {
  const sig = String(signature ?? '').trim().toLowerCase()
  const secret = paycrestWebhookSecret()
  if (!sig || !secret) return false
  const computed = createHmac('sha256', secret.trim()).update(rawBody).digest('hex').toLowerCase()
  if (computed.length !== sig.length) return false
  try {
    return timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(sig, 'utf8'))
  } catch {
    return false
  }
}

export async function paycrestWebhookHandler(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8')
  if (!verifyPaycrestWebhook(rawBody, req.headers['x-paycrest-signature'])) {
    return res.status(401).json({ ok: false, error: 'Invalid Paycrest signature' })
  }

  const payload = JSON.parse(rawBody.toString('utf8')) as any
  const data = payload?.data ?? {}
  const orderId = firstText(data.id, data.orderId, data.order_id)
  if (!orderId) return res.json({ ok: true })

  const store = await readStore()
  const record = store.orders[orderId]
  if (!record) return res.json({ ok: true })

  const updated = {
    ...record,
    status: firstText(data.status, record.status),
    tx_hash: firstText(data.txHash, data.tx_hash, record.tx_hash),
    raw: payload,
    updated_at: new Date().toISOString(),
  }
  store.orders[updated.intent_id] = updated
  store.orders[updated.paycrest_order_id] = updated
  await writeStore(store)
  return res.json({ ok: true })
}

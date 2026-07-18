import type { Request, Response } from 'express'
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { getFxRate } from './fx-rate'
import { listRegisteredPaymentsForEventIds } from './event-registry.js'
import { hasRenderDurableStore, readDurableJson, writeDurableJson } from './render-durable-store.js'
import {
  createPaycrestOfframpOrder,
  createPaycrestOnrampOrder,
  getPaycrestPosOrder,
  getPaycrestOfframpRate,
  getPaycrestOnrampRate,
  isPaycrestConfigured,
  listPaycrestInstitutions,
  listPaycrestPosOrdersForMerchants,
  markPaycrestPosPayment,
  refreshPaycrestOrderStatus,
  verifyPaycrestAccount,
} from './paycrest-pos.js'
import { reconcilePaycrestOrderPayment, registerPaycrestBankSendReceipt, schedulePaycrestOrderReconciliation } from './paycrest-reconcile.js'
import { verifyEvmUsdcTransfer } from './usdc-transfer-verify.js'
import { recordCirclePocketAction } from './circle-pocket-action-journal.js'

const STORE_PATH = process.env.NG_POS_STORE ?? './data/ng-pos-merchants.json'
const NG_POS_STORE_KEY = (process.env.NG_POS_STORE_KEY ?? 'hashpaylink:ng-pos-merchants').trim()
const MAX_TEXT = 90
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()
const INTERNAL_EVM_RECIPIENT = (process.env.PAYCREST_POS_EVM_ADDRESS ?? process.env.TREASURY_ADDRESS ?? '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753').trim()
const PAYCREST_MIN_USDC = 0.5

type PayoutPreference = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type SettlementType = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'
type BankSendNetwork = 'base' | 'polygon'

const POS_NETWORKS: PosNetwork[] = ['base', 'arbitrum', 'arc', 'solana']
const BANK_SEND_NETWORKS: BankSendNetwork[] = ['base', 'polygon']

type EncryptedBankDetails = {
  ciphertext: string
  iv: string
  tag: string
  keyVersion: string
}

type MerchantProfile = {
  merchant_id: string
  owner_id?: string
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  display_name: string
  country: 'NG'
  payout_preference: PayoutPreference
  encrypted_bank_details?: EncryptedBankDetails
  bank_name?: string
  bank_code?: string
  bank_last4?: string
  bank_account_name?: string
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'RESTRICTED'
  settlement_enabled: boolean
  source?: 'pos' | 'bank-receive' | 'bank-withdraw'
  created_at: string
  updated_at: string
  idempotency_key?: string
  creation_response?: Record<string, unknown>
}

type Store = {
  merchants: Record<string, MerchantProfile>
  intents?: Record<string, OfframpIntent>
  bank_send_links?: Record<string, BankSendLink>
}

type OfframpIntent = {
  intent_id: string
  merchant_id: string
  amount_ngn: string
  estimated_amount_usdc: string
  fx_rate_ngn_per_usdc: string
  source?: 'pos' | 'bank-receive' | 'bank-withdraw'
  created_at: string
  expires_at: string
}

type BankSendLink = {
  link_id: string
  owner_id?: string
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  display_name: string
  amount_ngn?: string
  flexible_amount?: boolean
  destination_network: BankSendNetwork
  destination_address: string
  country: 'NG'
  source: 'bank-send'
  created_at: string
  updated_at: string
  idempotency_key?: string
  creation_response?: Record<string, unknown>
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function creationIdempotencyKey(req: Request, body: Record<string, unknown>) {
  const value = String(req.headers['idempotency-key'] ?? body.idempotency_key ?? '').trim()
  return /^[a-zA-Z0-9:_-]{16,128}$/.test(value) ? value : ''
}

function idempotentResourceId(prefix: string, ownerId: string, idempotencyKey: string, length = 16) {
  const digest = createHash('sha256').update(`${prefix}:${ownerId}:${idempotencyKey}`).digest('base64url')
  return `${prefix}_${digest.slice(0, length)}`
}

function shortAddress(value: string) {
  const text = String(value || '').trim()
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text
}

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]
}

function isPolydeskServiceRequest(req: Request) {
  const expected = process.env.HASH_PAYLINK_POLYDESK_SERVICE_TOKEN?.trim()
  const supplied = getBearerToken(req)?.trim()
  return Boolean(expected && supplied && supplied === expected)
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.toLowerCase()
    }
  }
  return ''
}

async function verifiedPrivyUser(req: Request) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const error = new Error('Privy server auth is not configured.')
    ;(error as Error & { status?: number }).status = 503
    throw error
  }
  const token = getBearerToken(req)
  if (!token) {
    const error = new Error('Missing Privy access token.')
    ;(error as Error & { status?: number }).status = 401
    throw error
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  const user = await client.getUserById(claims.userId)
  return { userId: claims.userId, email: linkedEmail(user) }
}

async function verifiedPrivyUserId(req: Request) {
  const session = await verifiedPrivyUser(req)
  return session.userId
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').replace(/,/g, '').trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function cleanOrigin(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function normalizePosNetworks(value: unknown): PosNetwork[] {
  const raw = Array.isArray(value) ? value : [value]
  const selected = raw
    .map((item) => String(item ?? '').toLowerCase())
    .filter((item): item is PosNetwork => POS_NETWORKS.includes(item as PosNetwork))
  const deduped = Array.from(new Set(selected))
  return deduped.length ? deduped : ['base']
}

function isEvmPosNetwork(network: PosNetwork) {
  return network !== 'solana'
}

function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

function merchantNetworks(merchant: MerchantProfile): PosNetwork[] {
  return normalizePosNetworks(merchant.supported_networks)
}

function requestedNetwork(value: unknown, merchant: MerchantProfile): PosNetwork {
  const supported = merchantNetworks(merchant)
  const raw = String(value ?? supported[0] ?? 'base').toLowerCase() as PosNetwork
  return supported.includes(raw) ? raw : supported[0] ?? 'base'
}

function originFromRequest(req: Request, explicitOrigin?: unknown) {
  const browserOrigin = cleanOrigin(explicitOrigin) || cleanOrigin(req.headers.origin)
  if (browserOrigin) return browserOrigin

  const refererOrigin = cleanOrigin(req.headers.referer)
  if (refererOrigin) return refererOrigin

  const configured = process.env.PUBLIC_PAYLINK_ORIGIN ?? process.env.HASH_PAYLINK_BASE_URL
  const configuredOrigin = cleanOrigin(configured)
  if (configuredOrigin) return configuredOrigin

  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `${proto}://${host}`
}

async function readStore(): Promise<Store> {
  try {
    const remote = await readDurableJson<Partial<Store>>(NG_POS_STORE_KEY)
    if (remote) {
      return { merchants: remote.merchants ?? {}, intents: remote.intents ?? {}, bank_send_links: remote.bank_send_links ?? {} }
    }
  } catch (error) {
    console.warn('[ng-pos] durable load failed; using file fallback.', error instanceof Error ? error.message : String(error))
  }

  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { merchants: parsed.merchants ?? {}, intents: parsed.intents ?? {}, bank_send_links: parsed.bank_send_links ?? {} }
  } catch {
    return { merchants: {}, intents: {}, bank_send_links: {} }
  }
}

async function writeStore(store: Store) {
  const normalized = { merchants: store.merchants ?? {}, intents: store.intents ?? {}, bank_send_links: store.bank_send_links ?? {} }
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

  if (IS_RENDER && !HAS_DURABLE_STORE) {
    throw new Error('Durable POS storage is not configured. Add DATABASE_URL on Render before creating POS QR links.')
  }

  try {
    await writeDurableJson(NG_POS_STORE_KEY, normalized)
  } catch (error) {
    if (IS_RENDER) {
      throw new Error('Durable POS storage failed. Check DATABASE_URL on Render before creating POS QR links.')
    }
    console.warn('[ng-pos] durable save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
  }
}

async function publicMerchant(merchant: MerchantProfile) {
  const { rate, source } = await getNgnRate()
  return {
    merchant_id: merchant.merchant_id,
    display_name: merchant.display_name,
    country: merchant.country,
    payout_preference: merchant.payout_preference,
    settlement_enabled: merchant.settlement_enabled,
    kyc_status: merchant.kyc_status,
    circle_smart_wallet_address: merchant.circle_smart_wallet_address,
    solana_wallet_address: merchant.solana_wallet_address,
    supported_networks: merchantNetworks(merchant),
    bank_configured: Boolean(merchant.encrypted_bank_details),
    fx_rate_ngn_per_usdc: rate.toFixed(2),
    fx_source: source,
  }
}

async function getNgnRate() {
  try {
    return await getFxRate('NGN')
  } catch (err) {
    const configured = Number(process.env.NG_POS_USDC_NGN_RATE)
    if (Number.isFinite(configured) && configured > 0) {
      return {
        rate: configured,
        source: 'configured',
        cachedAt: Date.now(),
        stale: true,
      }
    }

    throw err
  }
}

function getBankEncryptionKey() {
  const raw = process.env.NG_POS_BANK_ENCRYPTION_KEY ?? ''
  if (!raw) return null
  return createHash('sha256').update(raw).digest()
}

function encryptBankDetails(input: {
  bank_code: string
  account_number: string
  account_name: string
}) {
  const key = getBankEncryptionKey()
  if (!key) throw new Error('NG_POS_BANK_ENCRYPTION_KEY is required before storing bank details.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify(input)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: process.env.NG_POS_BANK_KEY_VERSION ?? 'local-v1',
  }
}

function decryptBankDetails(details: EncryptedBankDetails) {
  const key = getBankEncryptionKey()
  if (!key) throw new Error('NG_POS_BANK_ENCRYPTION_KEY is required before reading bank details.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(details.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(details.tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(details.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(decrypted) as { bank_code: string; account_number: string; account_name: string }
}

function normalizeBankLookup(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function looksLikePaycrestInstitutionCode(value: string) {
  return /^[A-Z0-9]{8}$/.test(value.trim())
}

async function resolvePaycrestInstitutionCode(input: { bankCode?: string; bankName?: string; currency?: string }) {
  const rawCode = cleanText(input.bankCode, '').trim()
  const rawName = cleanText(input.bankName, '').trim()
  if (looksLikePaycrestInstitutionCode(rawCode)) return rawCode.toUpperCase()

  const lookup = normalizeBankLookup(rawName || rawCode)
  if (!lookup) return rawCode

  const institutions = await listPaycrestInstitutions(input.currency ?? 'NGN')
  const exact = institutions.find(institution =>
    normalizeBankLookup(institution.code) === lookup ||
    normalizeBankLookup(institution.name) === lookup
  )
  if (exact) return exact.code

  const fuzzy = institutions.find(institution => {
    const name = normalizeBankLookup(institution.name)
    return name.includes(lookup) || lookup.includes(name)
  })
  return fuzzy?.code ?? rawCode
}

function buildPayUrl(req: Request, merchant: MerchantProfile, network: PosNetwork, amountUsdc: string, amountNgn: string, settlementType: SettlementType, explicitOrigin?: unknown, intentId?: string, source: 'pos' | 'bank-receive' = 'pos') {
  const params = new URLSearchParams()
  if (amountUsdc) params.set('a', amountUsdc)
  else params.set('f', '1')
  params.set('n', network)
  if (settlementType === 'INSTANT_FIAT') {
    // Paycrest supplies the receive address during checkout preparation.
  } else if (network === 'solana') {
    params.set('s', merchant.solana_wallet_address ?? '')
  } else {
    params.set('e', merchant.circle_smart_wallet_address)
  }
  params.set('m', merchant.display_name)
  params.set('src', source === 'bank-receive' ? 'bank-receive' : 'ngpos')
  params.set('merchant', merchant.merchant_id)
  params.set('settlement', settlementType.toLowerCase())
  if (amountNgn) params.set('ngn', amountNgn)
  if (settlementType === 'INSTANT_FIAT') {
    params.set('offramp', 'paycrest')
    if (!amountUsdc) {
      params.set('fx', 'NGN')
      params.set('fs', '1')
    }
    if (intentId) params.set('intent', intentId)
    if (merchant.bank_name) params.set('bank', merchant.bank_name)
    if (merchant.bank_last4) params.set('acct', `****${merchant.bank_last4}`)
    if (merchant.bank_account_name) params.set('acctName', merchant.bank_account_name)
  }
  return `${originFromRequest(req, explicitOrigin)}/pay?${params.toString()}`
}

function buildDashboardUrl(req: Request, merchant: MerchantProfile, explicitOrigin?: unknown) {
  const params = new URLSearchParams()
  params.set('src', 'ngpos')
  if (merchant.source !== 'bank-receive') {
    params.set('id', `ngpos-${merchant.merchant_id}`)
  }
  return `${originFromRequest(req, explicitOrigin)}/dashboard?${params.toString()}`
}

function parseBankSendNetwork(value: unknown): BankSendNetwork {
  const normalized = String(value ?? '').trim().toLowerCase()
  return BANK_SEND_NETWORKS.includes(normalized as BankSendNetwork) ? normalized as BankSendNetwork : 'base'
}

function buildBankSendPayUrl(req: Request, link: BankSendLink, explicitOrigin?: unknown) {
  const params = new URLSearchParams()
  params.set('src', 'bank-send')
  params.set('onramp', 'paycrest')
  params.set('bankSend', link.link_id)
  params.set('n', 'base')
  params.set('destNet', link.destination_network)
  params.set('e', link.destination_address)
  params.set('m', link.display_name)
  if (link.amount_ngn) params.set('ngn', link.amount_ngn)
  else params.set('f', '1')
  return `${originFromRequest(req, explicitOrigin)}/pay?${params.toString()}`
}

function parseSettlementType(value: unknown): SettlementType {
  return value === 'INSTANT_FIAT' ? 'INSTANT_FIAT' : 'KEEP_CRYPTO'
}

function isVisiblePaycrestHistoryStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  return ['deposited', 'validated', 'settling', 'settled', 'refunding', 'refunded'].includes(normalized)
}

function isReconcileablePaycrestStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  return ['deposited', 'pending', 'validated', 'settling', 'settled', 'refunding', 'refunded'].includes(normalized)
}

function isSettledPaycrestStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  return normalized === 'settled' || normalized === 'validated'
}

export async function listNgPosHistoryForOwner(privyUserId: string) {
  const store = await readStore()
  const merchants = Object.values(store.merchants ?? {})
    .filter(merchant => merchant.owner_id === privyUserId)
  const bankSendLinks = Object.values(store.bank_send_links ?? {})
    .filter(link => link.owner_id === privyUserId)
  const merchantIds = merchants.map(merchant => merchant.merchant_id)
  const bankSendLinkIds = bankSendLinks.map(link => link.link_id)
  const payments = await listRegisteredPaymentsForEventIds([
    ...merchants.map(merchant => `ngpos-${merchant.merchant_id}`),
    ...bankSendLinkIds.map(linkId => `bank-send-${linkId}`),
  ])
  const existingTxHashes = new Set(payments.map(payment => payment.txHash.toLowerCase()).filter(Boolean))
  const bankSendById = new Map(bankSendLinks.map(link => [link.link_id, link]))
  const merchantById = new Map(merchants.map(merchant => [merchant.merchant_id, merchant]))
  const paycrestOrders = await listPaycrestPosOrdersForMerchants([...merchantIds, ...bankSendLinkIds])
  for (const order of paycrestOrders) {
    if (order.source !== 'bank-send' && !order.tx_hash && isReconcileablePaycrestStatus(order.status)) {
      schedulePaycrestOrderReconciliation(order.intent_id)
    } else if (order.source === 'bank-send' && isSettledPaycrestStatus(order.status)) {
      await registerPaycrestBankSendReceipt(order).catch(() => null)
    }
  }
  const paycrestRows = paycrestOrders
    .filter(order => isVisiblePaycrestHistoryStatus(order.status))
    .filter(order => !order.tx_hash || !existingTxHashes.has(order.tx_hash.toLowerCase()))
    .map(order => {
      const isBankSendOrder = order.source === 'bank-send'
      const link = isBankSendOrder ? bankSendById.get(order.merchant_id) : undefined
      const merchant = merchantById.get(order.merchant_id)
      const isBankWithdrawOrder = !isBankSendOrder && (order.source === 'bank-withdraw' || merchant?.source === 'bank-withdraw')
      const isBankReceiveOrder = !isBankSendOrder && (order.source === 'bank-receive' || merchant?.source === 'bank-receive')
      return {
        eventId: isBankSendOrder ? `bank-send-${order.merchant_id}` : `ngpos-${order.merchant_id}`,
        txHash: order.tx_hash || `paycrest_${order.intent_id}`,
        chain: isBankSendOrder ? (order.destination_network || link?.destination_network || 'base') : 'base',
        payer: isBankSendOrder
          ? (order.payer_name || order.payer_email || 'Bank transfer payer')
          : (order.payer_wallet || order.payer_email || 'Circle wallet payer'),
        memo: isBankSendOrder
          ? (link?.display_name || 'Bank send funding')
          : isBankWithdrawOrder
            ? 'Direct bank payout'
          : isBankReceiveOrder
            ? 'Bank receive payment'
            : 'Retail POS payment',
        amount: order.amount_usdc,
        ts: new Date(order.updated_at || order.created_at).getTime(),
        source: isBankSendOrder ? 'bank-send' : isBankWithdrawOrder ? 'bank-withdraw' : isBankReceiveOrder ? 'bank-receive' : 'ngpos',
        merchantId: order.merchant_id,
        contextLabel: isBankSendOrder
          ? `${order.destination_network || link?.destination_network || 'base'} USDC ${shortAddress(order.destination_address || link?.destination_address || '')}`.trim()
          : order.bank_name
            ? `${order.bank_name} ****${order.bank_last4 || ''}`.trim()
            : isBankWithdrawOrder ? 'Direct bank payout' : isBankReceiveOrder ? 'Bank receive' : 'Retail POS',
        settlementType: isBankSendOrder ? 'PAYCREST_ONRAMP' : 'INSTANT_FIAT',
        amountNgn: order.provider_amount_to_transfer || order.amount_ngn,
        paycrestStatus: order.status,
        bankName: isBankSendOrder ? order.provider_institution : order.bank_name,
        bankLast4: isBankSendOrder ? (order.provider_account_identifier || '').slice(-4) : order.bank_last4,
      }
    })
  return {
    merchants: merchants.map(merchant => ({
      merchant_id: merchant.merchant_id,
      display_name: merchant.display_name,
      source: merchant.source,
      bank_name: merchant.bank_name,
      bank_last4: merchant.bank_last4,
    })),
    bankSendLinks: bankSendLinks.map(link => ({
      link_id: link.link_id,
      display_name: link.display_name,
      destination_network: link.destination_network,
      destination_address: link.destination_address,
      amount_ngn: link.amount_ngn,
      flexible_amount: link.flexible_amount,
      created_at: link.created_at,
    })),
    payments: [...payments, ...paycrestRows].sort((a, b) => Number((b.ts || 0) - (a.ts || 0))),
  }
}

function ngPosRequestError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

export async function listNgPosInstitutions(currency: unknown = 'NGN') {
  if (!isPaycrestConfigured()) {
    throw ngPosRequestError(400, 'Paycrest is not configured. Add PAYCREST_API_KEY before loading banks.')
  }
  const normalizedCurrency = cleanText(currency, 'NGN').toUpperCase()
  return listPaycrestInstitutions(normalizedCurrency)
}

export async function verifyNgPosBankAccount(body: Record<string, unknown>) {
  const bankCode = cleanText(body.bank_code, '')
  const bankName = cleanText(body.bank_name, '')
  const accountNumber = cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
  if (!bankCode || accountNumber.length !== 10) {
    throw ngPosRequestError(400, 'Enter a valid bank and 10-digit account number.')
  }
  if (!isPaycrestConfigured()) {
    throw ngPosRequestError(400, 'Paycrest is not configured. Add PAYCREST_API_KEY before verifying bank accounts.')
  }
  const resolvedBankCode = await resolvePaycrestInstitutionCode({ bankCode, bankName })
  const accountName = await verifyPaycrestAccount({ institution: resolvedBankCode, accountIdentifier: accountNumber })
  if (!accountName || accountName === 'OK') {
    throw ngPosRequestError(400, 'Could not resolve this bank account name.')
  }
  return { account_name: accountName, bank_code: resolvedBankCode }
}

export async function createNgPosMerchant(req: Request, body: Record<string, unknown> = req.body ?? {}) {
  const preference = body.payout_preference === 'INSTANT_FIAT' ? 'INSTANT_FIAT' : 'KEEP_CRYPTO'
  const session = await verifiedPrivyUser(req)
  const ownerId = session.userId
  const idempotencyKey = creationIdempotencyKey(req, body)
  if (!idempotencyKey) throw ngPosRequestError(400, 'Missing or invalid idempotency key.')
  const store = await readStore()
  const existingMerchant = Object.values(store.merchants).find(merchant => (
    merchant.owner_id === ownerId && merchant.idempotency_key === idempotencyKey
  ))
  if (existingMerchant) {
    const replay = existingMerchant.creation_response ?? { ok: true, merchant: await publicMerchant(existingMerchant) }
    return { ...replay, replayed: true }
  }
  let ownerEmail = cleanText(body.owner_email, '').toLowerCase()
  if (session.email && ownerEmail && session.email !== ownerEmail) {
    throw ngPosRequestError(403, 'Signed-in email does not match this payout profile.')
  }
  ownerEmail = session.email || ownerEmail
  const ownerFirstName = cleanText(body.owner_first_name, '')
  const ownerLastName = cleanText(body.owner_last_name, '')
  const displayName = cleanText(body.display_name, 'Local merchant')
  const requestedWallet = cleanText(body.circle_smart_wallet_address, '') as `0x${string}`
  const solanaWallet = cleanText(body.solana_wallet_address, '')
  const supportedNetworks = normalizePosNetworks(body.supported_networks)
  const needsEvmWallet = supportedNetworks.some(isEvmPosNetwork)
  const needsSolanaWallet = supportedNetworks.includes('solana')
  const wallet = (preference === 'INSTANT_FIAT' ? (isAddress(requestedWallet) ? requestedWallet : INTERNAL_EVM_RECIPIENT) : requestedWallet) as `0x${string}`
  if (!displayName) throw ngPosRequestError(400, 'Merchant name is required.')
  if (needsEvmWallet && !isAddress(wallet)) throw ngPosRequestError(400, 'Enter a valid Circle EVM wallet address.')
  if (needsSolanaWallet && !isSolanaAddress(solanaWallet)) throw ngPosRequestError(400, 'Enter a valid Circle Solana wallet address.')

  let bankName = cleanText(body.bank_name, 'Nigerian bank')
  let rawBankCode = cleanText(body.bank_code, '')
  let accountNumber = cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
  let accountName = cleanText(body.account_name, '')
  if (preference === 'INSTANT_FIAT' && body.use_saved_bank === true) {
    const savedBankMerchant = Object.values(store.merchants)
      .filter(item => item.owner_id === ownerId && Boolean(item.encrypted_bank_details))
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
    if (!savedBankMerchant?.encrypted_bank_details) {
      throw ngPosRequestError(400, 'No verified bank account is saved yet.')
    }
    const savedBank = decryptBankDetails(savedBankMerchant.encrypted_bank_details)
    bankName = savedBankMerchant.bank_name || bankName
    rawBankCode = savedBank.bank_code
    accountNumber = savedBank.account_number
    accountName = savedBank.account_name
  }
  const bankCode = rawBankCode ? await resolvePaycrestInstitutionCode({ bankCode: rawBankCode, bankName }) : ''
  const hasBank = Boolean(bankCode && accountNumber.length === 10 && accountName)
  if (preference === 'INSTANT_FIAT' && !hasBank) {
    throw ngPosRequestError(400, 'Verify a bank account before creating a bank-settled POS terminal.')
  }
  const now = new Date().toISOString()
  const merchant: MerchantProfile = {
    merchant_id: idempotentResourceId('pos', ownerId, idempotencyKey),
    owner_id: ownerId || undefined,
    owner_email: ownerEmail || undefined,
    owner_first_name: ownerFirstName || undefined,
    owner_last_name: ownerLastName || undefined,
    display_name: displayName,
    country: 'NG',
    payout_preference: preference,
    circle_smart_wallet_address: wallet,
    solana_wallet_address: needsSolanaWallet ? solanaWallet : undefined,
    supported_networks: supportedNetworks,
    kyc_status: 'UNVERIFIED',
    settlement_enabled: true,
    source: 'pos',
    created_at: now,
    updated_at: now,
    idempotency_key: idempotencyKey,
  }

  if (hasBank) {
    merchant.encrypted_bank_details = encryptBankDetails({
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
    })
    merchant.bank_code = bankCode
    merchant.bank_name = bankName
    merchant.bank_last4 = accountNumber.slice(-4)
    merchant.bank_account_name = accountName
  }

  const response = { ok: true, merchant: await publicMerchant(merchant) }
  merchant.creation_response = response
  store.merchants[merchant.merchant_id] = merchant
  await writeStore(store)
  await recordCirclePocketAction({
    ownerId: createHash('sha256').update(`privy:${ownerId}`.toLowerCase()).digest('hex').slice(0, 32),
    idempotencyKey,
    action: 'create-pos-terminal',
    status: 'completed',
    resourceId: merchant.merchant_id,
    metadata: { payoutPreference: preference, networks: supportedNetworks.join(',') },
  })
  return response
}

export async function createNgPosBankReceive(req: Request, body: Record<string, unknown> = req.body ?? {}) {
  const session = await verifiedPrivyUser(req)
  const ownerId = session.userId
  const idempotencyKey = creationIdempotencyKey(req, body)
  if (!idempotencyKey) throw ngPosRequestError(400, 'Missing or invalid idempotency key.')
  const store = await readStore()
  const directPayout = body.direct_payout === true
  const merchantSource = directPayout ? 'bank-withdraw' : 'bank-receive'
  const existingMerchant = Object.values(store.merchants).find(merchant => (
    merchant.owner_id === ownerId && merchant.source === merchantSource && merchant.idempotency_key === idempotencyKey
  ))
  if (existingMerchant?.creation_response) return { ...existingMerchant.creation_response, replayed: true }
  const suppliedOwnerEmail = cleanText(body.owner_email, '').toLowerCase()
  if (session.email && suppliedOwnerEmail && session.email !== suppliedOwnerEmail) {
    throw ngPosRequestError(403, 'Signed-in email does not match this payout profile.')
  }
  const ownerEmail = session.email || suppliedOwnerEmail
  const ownerFirstName = cleanText(body.owner_first_name, '')
  const ownerLastName = cleanText(body.owner_last_name, '')
  const displayName = cleanText(body.display_name || body.memo, directPayout ? 'Direct bank payout' : 'Bank receive')
  const flexibleAmount = body.flexible_amount === true || body.flexible_amount === 'true'
  const amount = cleanAmount(body.amount)
  const useSavedBank = body.use_saved_bank === true || body.use_saved_bank === 'true'
  const savedBankMerchant = useSavedBank
    ? Object.values(store.merchants ?? {})
        .filter(item => item.owner_id === ownerId && Boolean(item.encrypted_bank_details))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
    : undefined
  if (useSavedBank && !savedBankMerchant?.encrypted_bank_details) {
    throw ngPosRequestError(404, 'No verified bank account is saved yet. Open Receive to Bank and verify one first.')
  }
  const savedBank = savedBankMerchant?.encrypted_bank_details
    ? decryptBankDetails(savedBankMerchant.encrypted_bank_details)
    : undefined
  const bankName = savedBankMerchant?.bank_name || cleanText(body.bank_name, 'Nigerian bank')
  const bankCode = savedBank?.bank_code
    || await resolvePaycrestInstitutionCode({ bankCode: cleanText(body.bank_code, ''), bankName })
  const accountNumber = savedBank?.account_number
    || cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
  const accountName = savedBank?.account_name || cleanText(body.account_name, '')
  if (!ownerEmail) throw ngPosRequestError(401, 'Sign in to create bank receive links.')
  if (!flexibleAmount && !amount) throw ngPosRequestError(400, 'Enter a valid Naira amount.')
  if (!bankCode || accountNumber.length !== 10 || !accountName) {
    throw ngPosRequestError(400, 'Verify a Nigerian bank account first.')
  }
  if (!isPaycrestConfigured()) throw ngPosRequestError(400, 'Paycrest is not configured for bank receive yet.')

  const now = new Date().toISOString()
  const merchant: MerchantProfile = {
    merchant_id: idempotentResourceId('bank', ownerId, idempotencyKey),
    owner_id: ownerId,
    owner_email: ownerEmail,
    owner_first_name: ownerFirstName || undefined,
    owner_last_name: ownerLastName || undefined,
    display_name: displayName,
    country: 'NG',
    payout_preference: 'INSTANT_FIAT',
    encrypted_bank_details: encryptBankDetails({ bank_code: bankCode, account_number: accountNumber, account_name: accountName }),
    bank_name: bankName,
    bank_code: bankCode,
    bank_last4: accountNumber.slice(-4),
    bank_account_name: accountName,
    circle_smart_wallet_address: INTERNAL_EVM_RECIPIENT,
    supported_networks: ['base'],
    kyc_status: 'UNVERIFIED',
    settlement_enabled: true,
    source: merchantSource,
    created_at: now,
    updated_at: now,
    idempotency_key: idempotencyKey,
  }
  store.merchants[merchant.merchant_id] = merchant
  let intentId = ''
  let amountNgnText = ''
  let amountUsdcText = ''
  let rateText = ''
  let source = 'paycrest'
  if (!flexibleAmount) {
    let rate: number
    ;({ rate, source } = await getNgnRate())
    try {
      rate = await getPaycrestOfframpRate({ network: 'base', token: 'USDC', fiat: 'NGN', amount: '1' })
      source = 'paycrest'
    } catch (error) {
      console.warn('[ng-pos] Paycrest rate unavailable for bank receive; using fallback FX rate.', error instanceof Error ? error.message : String(error))
    }
    const amountNgn = amount as number
    const amountUsdc = amountNgn / rate
    if (amountUsdc < PAYCREST_MIN_USDC) {
      const minimumNgn = Math.ceil(rate * PAYCREST_MIN_USDC)
      throw ngPosRequestError(400, `Minimum Naira payout is about NGN ${minimumNgn.toLocaleString('en-NG')}.`)
    }
    amountNgnText = amountNgn.toFixed(2)
    amountUsdcText = amountUsdc.toFixed(6).replace(/\.?0+$/, '')
    rateText = rate.toFixed(2)
    intentId = idempotentResourceId('intent', ownerId, idempotencyKey)
    store.intents ??= {}
    store.intents[intentId] = {
      intent_id: intentId,
      merchant_id: merchant.merchant_id,
      amount_ngn: amountNgnText,
      estimated_amount_usdc: amountUsdcText,
      fx_rate_ngn_per_usdc: rateText,
      source: merchantSource,
      created_at: now,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }
  }
  const pay_url = buildPayUrl(req, merchant, 'base', amountUsdcText, amountNgnText, 'INSTANT_FIAT', body.client_origin, intentId || undefined, 'bank-receive')
  const response = {
    ok: true,
    link: {
      payment_url: pay_url,
      dashboard_url: buildDashboardUrl(req, merchant, body.client_origin),
      merchant_id: merchant.merchant_id,
      intent_id: intentId || undefined,
      amount_ngn: amountNgnText || undefined,
      estimated_amount_usdc: amountUsdcText,
      fx_rate_ngn_per_usdc: rateText || undefined,
      fx_source: source,
      bank_name: merchant.bank_name,
      bank_last4: merchant.bank_last4,
      bank_account_name: merchant.bank_account_name,
    },
  }
  merchant.creation_response = response
  await writeStore(store)
  await recordCirclePocketAction({
    ownerId: createHash('sha256').update(`privy:${ownerId}`.toLowerCase()).digest('hex').slice(0, 32),
    idempotencyKey,
    action: directPayout ? 'prepare-direct-bank-payout' : 'create-bank-receive-paylink',
    status: 'completed',
    resourceId: merchant.merchant_id,
    metadata: { amount: amountNgnText || 'payer-selected', network: 'base' },
  })
  return response
}

export async function createNgPosBankSend(
  req: Request,
  body: Record<string, unknown> = req.body ?? {},
  options: { allowServiceRequest?: boolean } = {},
) {
  const serviceRequest = options.allowServiceRequest === true && isPolydeskServiceRequest(req)
  const session = serviceRequest ? null : await verifiedPrivyUser(req)
  // Service-token calls live in a dedicated namespace and can never claim a Privy owner.
  const ownerId = session?.userId || 'polydesk-service'
  const idempotencyKey = creationIdempotencyKey(req, body)
  if (!idempotencyKey) throw ngPosRequestError(400, 'Missing or invalid idempotency key.')
  const store = await readStore()
  const existingLink = Object.values(store.bank_send_links ?? {}).find(link => (
    link.owner_id === ownerId && link.idempotency_key === idempotencyKey
  ))
  if (existingLink?.creation_response) return { ...existingLink.creation_response, replayed: true }
  const suppliedOwnerEmail = cleanText(body.owner_email, '').toLowerCase()
  if (session?.email && suppliedOwnerEmail && session.email !== suppliedOwnerEmail) {
    throw ngPosRequestError(403, 'Signed-in email does not match this funding profile.')
  }
  const ownerEmail = session?.email || suppliedOwnerEmail
  const ownerFirstName = cleanText(body.owner_first_name, '')
  const ownerLastName = cleanText(body.owner_last_name, '')
  const displayName = cleanText(body.display_name || body.memo, 'Bank to USDC')
  const flexibleAmount = body.flexible_amount === true || body.flexible_amount === 'true'
  const amount = cleanAmount(body.amount)
  const destinationNetwork = parseBankSendNetwork(body.network)
  const destinationAddress = cleanText(body.destination_address, '') as `0x${string}`
  if (!ownerEmail) throw ngPosRequestError(401, 'Sign in to create bank-to-USDC links.')
  if (!isAddress(destinationAddress)) throw ngPosRequestError(400, 'Enter a valid USDC recipient wallet.')
  if (!flexibleAmount && !amount) throw ngPosRequestError(400, 'Enter a valid Naira amount.')
  if (!isPaycrestConfigured()) throw ngPosRequestError(400, 'Paycrest is not configured for bank-to-USDC links yet.')

  const now = new Date().toISOString()
  const link: BankSendLink = {
    link_id: idempotentResourceId('send', ownerId, idempotencyKey),
    owner_id: ownerId,
    owner_email: ownerEmail,
    owner_first_name: ownerFirstName || undefined,
    owner_last_name: ownerLastName || undefined,
    display_name: displayName,
    amount_ngn: flexibleAmount || !amount ? undefined : amount.toFixed(2),
    flexible_amount: flexibleAmount,
    destination_network: destinationNetwork,
    destination_address: destinationAddress,
    country: 'NG',
    source: 'bank-send',
    created_at: now,
    updated_at: now,
    idempotency_key: idempotencyKey,
  }
  store.bank_send_links ??= {}
  store.bank_send_links[link.link_id] = link
  const payUrl = buildBankSendPayUrl(req, link, body.client_origin)
  const response = {
    ok: true,
    link: {
      payment_url: payUrl,
      dashboard_url: `${originFromRequest(req, body.client_origin)}/dashboard?src=ngpos`,
      link_id: link.link_id,
      amount_ngn: link.amount_ngn,
      flexible_amount: Boolean(link.flexible_amount),
      destination_network: link.destination_network,
      destination_address: link.destination_address,
    },
  }
  link.creation_response = response
  await writeStore(store)
  if (session) {
    await recordCirclePocketAction({
      ownerId: createHash('sha256').update(`privy:${ownerId}`.toLowerCase()).digest('hex').slice(0, 32),
      idempotencyKey,
      action: 'create-bank-send-paylink',
      status: 'completed',
      resourceId: link.link_id,
      metadata: { amount: link.amount_ngn || 'payer-selected', network: link.destination_network },
    })
  }
  return response
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const merchantId = cleanText(req.query.merchant_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!merchantId) return res.status(400).json({ ok: false, error: 'Missing merchant_id' })
      const store = await readStore()
      const merchant = store.merchants[merchantId]
      if (!merchant) return res.status(404).json({ ok: false, error: 'Merchant not found' })
      return res.json({ ok: true, merchant: await publicMerchant(merchant) })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const body = req.body ?? {}
    const action = cleanText(body.action, '')

    if (action === 'institutions') {
      return res.json({ ok: true, institutions: await listNgPosInstitutions(body.currency) })
    }

    if (action === 'savedBankReceiveProfile') {
      const ownerId = await verifiedPrivyUserId(req)
      const store = await readStore()
      const merchant = Object.values(store.merchants ?? {})
        .filter(item => item.owner_id === ownerId && Boolean(item.encrypted_bank_details))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
      if (!merchant) return res.status(404).json({ ok: false, error: 'No verified bank account is saved yet.' })
      return res.json({
        ok: true,
        profile: {
          merchant_id: merchant.merchant_id,
          bank_name: merchant.bank_name || 'Verified bank',
          bank_last4: merchant.bank_last4 || '',
          bank_account_name: merchant.bank_account_name || '',
        },
      })
    }

    if (action === 'listHistory') {
      const privyUserId = await verifiedPrivyUserId(req)
      return res.json({ ok: true, ...await listNgPosHistoryForOwner(privyUserId) })
    }

    if (action === 'verifyAccount') {
      return res.json({ ok: true, ...await verifyNgPosBankAccount(body) })
    }

    if (action === 'createMerchant') {
      return res.json(await createNgPosMerchant(req, body))
    }

    if (action === 'createBankReceive') {
      return res.json(await createNgPosBankReceive(req, body))
    }

    if (action === 'createBankSend') {
      return res.json(await createNgPosBankSend(req, body, { allowServiceRequest: true }))
    }

    if (action === 'quote') {
      const merchantId = cleanText(body.merchant_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const requestedSettlementType = parseSettlementType(body.settlement_type)
      const amountCurrency = body.amount_currency === 'USDC' ? 'USDC' : 'NGN'
      const amount = cleanAmount(body.amount)
      if (!merchantId || !amount) return res.status(400).json({ ok: false, error: 'Missing merchant or amount.' })

      const store = await readStore()
      const merchant = store.merchants[merchantId]
      if (!merchant || !merchant.settlement_enabled) return res.status(404).json({ ok: false, error: 'Merchant is not available.' })
      if (requestedSettlementType !== merchant.payout_preference) {
        return res.status(400).json({ ok: false, error: 'Settlement selection does not match this terminal configuration.' })
      }
      const settlementType = merchant.payout_preference
      if (settlementType === 'INSTANT_FIAT' && !merchant.encrypted_bank_details) {
        return res.status(400).json({ ok: false, error: 'Bank settlement is not configured for this merchant.' })
      }
      const network = requestedNetwork(body.network, merchant)
      if (settlementType === 'INSTANT_FIAT' && network !== 'base') {
        return res.status(400).json({ ok: false, error: 'Naira payout currently supports Base USDC only.' })
      }
      if (network === 'solana' && !merchant.solana_wallet_address) {
        return res.status(400).json({ ok: false, error: 'Solana is not configured for this merchant.' })
      }
      if (isEvmPosNetwork(network) && !isAddress(merchant.circle_smart_wallet_address)) {
        return res.status(400).json({ ok: false, error: 'EVM payment is not configured for this merchant.' })
      }

      let { rate, source } = await getNgnRate()
      if (settlementType === 'INSTANT_FIAT' && isPaycrestConfigured()) {
        try {
          rate = await getPaycrestOfframpRate({ network: 'base', token: 'USDC', fiat: 'NGN', amount: '1' })
          source = 'paycrest'
        } catch (error) {
          console.warn('[ng-pos] Paycrest rate unavailable; using fallback FX rate.', error instanceof Error ? error.message : String(error))
        }
      }
      const amountNgn = amountCurrency === 'NGN' ? amount : amount * rate
      const amountUsdc = amountCurrency === 'USDC' ? amount : amount / rate
      if (settlementType === 'INSTANT_FIAT' && amountUsdc < PAYCREST_MIN_USDC) {
        const minimumNgn = Math.ceil(rate * PAYCREST_MIN_USDC)
        return res.status(400).json({
          ok: false,
          error: `Minimum Naira payout is about NGN ${minimumNgn.toLocaleString('en-NG')}.`,
        })
      }
      const amountUsdcText = amountUsdc.toFixed(6).replace(/\.?0+$/, '')
      const quoteId = randomBytes(10).toString('base64url')
      const intentId = settlementType === 'INSTANT_FIAT' ? randomBytes(12).toString('base64url') : ''
      let fiatExecutionReady = true
      if (settlementType === 'INSTANT_FIAT') {
        if (!isPaycrestConfigured()) return res.status(400).json({ ok: false, error: 'Paycrest is not configured for naira settlement yet.' })
        const intentSource = merchant.source === 'bank-withdraw' ? 'bank-withdraw' : merchant.source === 'bank-receive' ? 'bank-receive' : 'pos'
        store.intents ??= {}
        store.intents[intentId] = {
          intent_id: intentId,
          merchant_id: merchant.merchant_id,
          amount_ngn: amountNgn.toFixed(2),
          estimated_amount_usdc: amountUsdcText,
          fx_rate_ngn_per_usdc: rate.toFixed(2),
          source: intentSource,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        }
        await writeStore(store)
        fiatExecutionReady = true
      }

      return res.json({
        ok: true,
        quote: {
          quote_id: quoteId,
          merchant_id: merchant.merchant_id,
          network,
          supported_networks: merchantNetworks(merchant),
          settlement_type: settlementType,
          amount_ngn: amountNgn.toFixed(2),
          amount_usdc: amountUsdcText,
          fx_rate_ngn_per_usdc: rate.toFixed(2),
          fx_source: source,
          expires_at: new Date(Date.now() + (settlementType === 'INSTANT_FIAT' ? 10 * 60_000 : 60_000)).toISOString(),
          pay_url: buildPayUrl(req, merchant, network, amountUsdcText, amountNgn.toFixed(2), settlementType, body.client_origin, intentId, merchant.source === 'bank-receive' ? 'bank-receive' : 'pos'),
          fiat_execution_ready: fiatExecutionReady,
          offramp_provider: settlementType === 'INSTANT_FIAT' ? 'paycrest' : undefined,
          intent_id: intentId || undefined,
          bank_name: settlementType === 'INSTANT_FIAT' ? merchant.bank_name : undefined,
          bank_last4: settlementType === 'INSTANT_FIAT' ? merchant.bank_last4 : undefined,
          bank_account_name: settlementType === 'INSTANT_FIAT' ? merchant.bank_account_name : undefined,
        },
      })
    }

    if (action === 'bankSendQuote') {
      const linkId = cleanText(body.link_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const amount = cleanAmount(body.amount)
      if (!linkId) return res.status(400).json({ ok: false, error: 'Missing bank-to-USDC link.' })
      if (!amount) return res.status(400).json({ ok: false, error: 'Enter a valid Naira amount.' })
      if (!isPaycrestConfigured()) return res.status(400).json({ ok: false, error: 'Paycrest is not configured for bank-to-USDC quotes yet.' })

      const store = await readStore()
      const link = store.bank_send_links?.[linkId]
      if (!link) return res.status(404).json({ ok: false, error: 'Bank-to-USDC link was not found.' })
      if (!link.flexible_amount && link.amount_ngn && Math.abs(Number(link.amount_ngn) - amount) > 0.01) {
        return res.status(400).json({ ok: false, error: 'This payment link requires the exact Naira amount.' })
      }

      const rate = await getPaycrestOnrampRate({
        network: link.destination_network,
        token: 'USDC',
        fiat: 'NGN',
        amount: '1',
      })
      const amountUsdc = amount / rate
      if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        return res.status(400).json({ ok: false, error: 'Paycrest did not return a usable bank-to-USDC quote.' })
      }
      return res.json({
        ok: true,
        quote: {
          link_id: link.link_id,
          amount_ngn: amount.toFixed(2),
          amount_usdc: amountUsdc.toFixed(6).replace(/\.?0+$/, ''),
          fx_rate_ngn_per_usdc: rate.toFixed(2),
          fx_source: 'paycrest',
          destination_network: link.destination_network,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      })
    }

    if (action === 'createOfframpOrder') {
      const intentId = cleanText(body.intent_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const refundAddress = cleanText(body.refund_address, '') as `0x${string}`
      const payerEmail = cleanText(body.payer_email, '')
      const payerWallet = cleanText(body.payer_wallet, '') as `0x${string}`
      const payerName = cleanText(body.payer_name, '')
      if (!intentId || !isAddress(refundAddress)) return res.status(400).json({ ok: false, error: 'Circle wallet is required before creating naira settlement.' })
      if (!payerName) return res.status(400).json({ ok: false, error: 'Payer name is required before creating naira settlement.' })
      const existing = await getPaycrestPosOrder(intentId)
      if (existing) return res.json({ ok: true, order: existing })
      const store = await readStore()
      const intent = store.intents?.[intentId]
      if (!intent) return res.status(404).json({ ok: false, error: 'POS settlement intent expired. Start this payment again.' })
      if (new Date(intent.expires_at).getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'POS settlement intent expired. Start this payment again.' })
      if (Number(intent.estimated_amount_usdc) < PAYCREST_MIN_USDC) {
        return res.status(400).json({ ok: false, error: 'Minimum Paycrest payout is 0.50 USDC. Enter a higher Naira amount.' })
      }
      const merchant = store.merchants[intent.merchant_id]
      if (!merchant?.encrypted_bank_details) return res.status(404).json({ ok: false, error: 'Merchant bank payout is not available.' })
      const bank = decryptBankDetails(merchant.encrypted_bank_details)
      const bankCode = await resolvePaycrestInstitutionCode({ bankCode: bank.bank_code, bankName: merchant.bank_name })
      const order = await createPaycrestOfframpOrder({
        intentId,
        merchantId: merchant.merchant_id,
        amountNgn: intent.amount_ngn,
        estimatedAmountUsdc: intent.estimated_amount_usdc,
        bankCode,
        accountNumber: bank.account_number,
        accountName: bank.account_name,
        bankName: merchant.bank_name,
        refundAddress,
        payerEmail,
        payerWallet: isAddress(payerWallet) ? payerWallet : refundAddress,
        payerName,
        source: intent.source === 'bank-withdraw' ? 'bank-withdraw' : intent.source === 'bank-receive' ? 'bank-receive' : 'ngpos',
        memo: payerName.slice(0, 40) || 'Hash PayLink',
      })
      schedulePaycrestOrderReconciliation(order.intent_id)
      return res.json({ ok: true, order })
    }

    if (action === 'createBankSendOrder') {
      const linkId = cleanText(body.link_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const amount = cleanAmount(body.amount)
      const refundBankName = cleanText(body.refund_bank_name, 'Nigerian bank')
      const refundBankCode = await resolvePaycrestInstitutionCode({ bankCode: cleanText(body.refund_bank_code, ''), bankName: refundBankName })
      const refundAccountNumber = cleanText(body.refund_account_number, '').replace(/\D/g, '').slice(0, 10)
      const refundAccountName = cleanText(body.refund_account_name, '')
      const payerEmail = cleanText(body.payer_email, '')
      const payerName = cleanText(body.payer_name, '')
      if (!linkId) return res.status(400).json({ ok: false, error: 'Missing bank-to-USDC link.' })
      if (!amount) return res.status(400).json({ ok: false, error: 'Enter a valid Naira amount.' })
      if (!refundBankCode || refundAccountNumber.length !== 10 || !refundAccountName) {
        return res.status(400).json({ ok: false, error: 'Verify your refund bank account first.' })
      }
      if (!isPaycrestConfigured()) return res.status(400).json({ ok: false, error: 'Paycrest is not configured for bank-to-USDC funding yet.' })

      const store = await readStore()
      const link = store.bank_send_links?.[linkId]
      if (!link) return res.status(404).json({ ok: false, error: 'Bank-to-USDC link was not found.' })
      if (!link.flexible_amount && link.amount_ngn && Math.abs(Number(link.amount_ngn) - amount) > 0.01) {
        return res.status(400).json({ ok: false, error: 'This payment link requires the exact Naira amount.' })
      }
      const intentId = randomBytes(12).toString('base64url')
      const order = await createPaycrestOnrampOrder({
        intentId,
        merchantId: link.link_id,
        amountNgn: amount.toFixed(2),
        destinationNetwork: link.destination_network,
        destinationAddress: link.destination_address,
        refundBankCode,
        refundAccountNumber,
        refundAccountName,
        refundBankName,
        payerEmail,
        payerName,
      })
      return res.json({ ok: true, order })
    }

    if (action === 'markOfframpPaid') {
      const id = cleanText(body.intent_id || body.order_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const txHash = cleanText(body.tx_hash, '')
      if (!id || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return res.status(400).json({ ok: false, error: 'Valid order and tx hash are required.' })
      const existing = await getPaycrestPosOrder(id)
      if (!existing) return res.status(404).json({ ok: false, error: 'Paycrest POS order not found.' })
      try {
        await verifyEvmUsdcTransfer({
          chain: 'base',
          txHash,
          recipient: existing.receive_address,
          minAmount: existing.amount_usdc,
        })
      } catch (error) {
        return res.status(409).json({ ok: false, error: error instanceof Error ? error.message : 'Payment could not be verified on-chain.' })
      }
      const order = await markPaycrestPosPayment({
        id,
        txHash,
        payerEmail: cleanText(body.payer_email, ''),
        payerWallet: cleanText(body.payer_wallet, ''),
      })
      return res.json({ ok: true, order })
    }

    if (action === 'offrampStatus') {
      const id = cleanText(body.intent_id || body.order_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!id) return res.status(400).json({ ok: false, error: 'Missing order id.' })
      let order = body.refresh ? await refreshPaycrestOrderStatus(id) : await getPaycrestPosOrder(id)
      if (!order) return res.status(404).json({ ok: false, error: 'Paycrest POS order not found.' })
      let receipt: unknown
      if (body.refresh && order.source === 'bank-send') {
        receipt = await registerPaycrestBankSendReceipt(order).catch(() => null)
      } else if (body.refresh) {
        const reconciled = await reconcilePaycrestOrderPayment(id).catch(() => null)
        order = reconciled?.order ?? order
        receipt = reconciled?.receipt
      }
      return res.json({ ok: true, order, receipt })
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const error = err as Error & { status?: number }
    const message = error.message || 'Nigerian POS request failed'
    return res.status(error.status ?? 500).json({ ok: false, error: message.slice(0, 220) })
  }
}

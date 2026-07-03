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
  getPaycrestPosOrder,
  getPaycrestOfframpRate,
  isPaycrestConfigured,
  listPaycrestInstitutions,
  markPaycrestPosPayment,
  refreshPaycrestOrderStatus,
  verifyPaycrestAccount,
} from './paycrest-pos.js'
import { verifyEvmUsdcTransfer } from './usdc-transfer-verify.js'

const STORE_PATH = process.env.NG_POS_STORE ?? './data/ng-pos-merchants.json'
const NG_POS_STORE_KEY = (process.env.NG_POS_STORE_KEY ?? 'hashpaylink:ng-pos-merchants').trim()
const MAX_TEXT = 90
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()
const INTERNAL_EVM_RECIPIENT = (process.env.PAYCREST_POS_EVM_ADDRESS ?? process.env.TREASURY_ADDRESS ?? '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753').trim()

type PayoutPreference = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type SettlementType = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'

const POS_NETWORKS: PosNetwork[] = ['base', 'arbitrum', 'arc', 'solana']

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
  source?: 'pos' | 'bank-receive'
  created_at: string
  updated_at: string
}

type Store = {
  merchants: Record<string, MerchantProfile>
  intents?: Record<string, OfframpIntent>
}

type OfframpIntent = {
  intent_id: string
  merchant_id: string
  amount_ngn: string
  estimated_amount_usdc: string
  fx_rate_ngn_per_usdc: string
  source?: 'pos' | 'bank-receive'
  created_at: string
  expires_at: string
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]
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
      return { merchants: remote.merchants ?? {}, intents: remote.intents ?? {} }
    }
  } catch (error) {
    console.warn('[ng-pos] durable load failed; using file fallback.', error instanceof Error ? error.message : String(error))
  }

  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { merchants: parsed.merchants ?? {}, intents: parsed.intents ?? {} }
  } catch {
    return { merchants: {}, intents: {} }
  }
}

async function writeStore(store: Store) {
  const normalized = { merchants: store.merchants ?? {}, intents: store.intents ?? {} }
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
    bank_name: merchant.bank_name,
    bank_last4: merchant.bank_last4,
    bank_account_name: merchant.bank_account_name,
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

function buildPayUrl(req: Request, merchant: MerchantProfile, network: PosNetwork, amountUsdc: string, amountNgn: string, settlementType: SettlementType, explicitOrigin?: unknown, intentId?: string, source: 'pos' | 'bank-receive' = 'pos') {
  const params = new URLSearchParams()
  params.set('a', amountUsdc)
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
  params.set('ngn', amountNgn)
  if (settlementType === 'INSTANT_FIAT') {
    params.set('offramp', 'paycrest')
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

function parseSettlementType(value: unknown): SettlementType {
  return value === 'INSTANT_FIAT' ? 'INSTANT_FIAT' : 'KEEP_CRYPTO'
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
      if (!isPaycrestConfigured()) {
        return res.status(400).json({ ok: false, error: 'Paycrest is not configured. Add PAYCREST_API_KEY before loading banks.' })
      }
      const currency = cleanText(body.currency, 'NGN').toUpperCase()
      const institutions = await listPaycrestInstitutions(currency)
      return res.json({ ok: true, institutions })
    }

    if (action === 'listHistory') {
      const privyUserId = await verifiedPrivyUserId(req)
      const store = await readStore()
      const merchants = Object.values(store.merchants ?? {})
        .filter(merchant => merchant.owner_id === privyUserId)
        .filter(merchant => merchant.source === 'bank-receive' || merchant.payout_preference === 'INSTANT_FIAT')
      const payments = await listRegisteredPaymentsForEventIds(merchants.map(merchant => `ngpos-${merchant.merchant_id}`))
      return res.json({
        ok: true,
        merchants: merchants.map(merchant => ({
          merchant_id: merchant.merchant_id,
          display_name: merchant.display_name,
          source: merchant.source,
          bank_name: merchant.bank_name,
          bank_last4: merchant.bank_last4,
        })),
        payments,
      })
    }

    if (action === 'verifyAccount') {
      const bankCode = cleanText(body.bank_code, '')
      const accountNumber = cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
      if (!bankCode || accountNumber.length !== 10) {
        return res.status(400).json({ ok: false, error: 'Enter a valid bank and 10-digit account number.' })
      }
      if (!isPaycrestConfigured()) {
        return res.status(400).json({ ok: false, error: 'Paycrest is not configured. Add PAYCREST_API_KEY before verifying bank accounts.' })
      }
      const accountName = await verifyPaycrestAccount({ institution: bankCode, accountIdentifier: accountNumber })
      if (!accountName || accountName === 'OK') return res.status(400).json({ ok: false, error: 'Could not resolve this bank account name.' })
      return res.json({ ok: true, account_name: accountName })
    }

    if (action === 'createMerchant') {
      const preference = body.payout_preference === 'INSTANT_FIAT' ? 'INSTANT_FIAT' : 'KEEP_CRYPTO'
      const session = await verifiedPrivyUser(req)
      const ownerId = session.userId
      let ownerEmail = cleanText(body.owner_email, '').toLowerCase()
      if (session.email && ownerEmail && session.email !== ownerEmail) {
        return res.status(403).json({ ok: false, error: 'Signed-in email does not match this payout profile.' })
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
      if (!displayName) return res.status(400).json({ ok: false, error: 'Merchant name is required.' })
      if (needsEvmWallet && !isAddress(wallet)) return res.status(400).json({ ok: false, error: 'Enter a valid Circle EVM wallet address.' })
      if (needsSolanaWallet && !isSolanaAddress(solanaWallet)) return res.status(400).json({ ok: false, error: 'Enter a valid Circle Solana wallet address.' })

      const bankCode = cleanText(body.bank_code, '')
      const accountNumber = cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
      const accountName = cleanText(body.account_name, '')
      const hasBank = bankCode && accountNumber.length === 10 && accountName
      const now = new Date().toISOString()
      const merchant: MerchantProfile = {
        merchant_id: randomBytes(12).toString('base64url'),
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
      }

      if (hasBank) {
        merchant.encrypted_bank_details = encryptBankDetails({
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
        })
        merchant.bank_code = bankCode
        merchant.bank_name = cleanText(body.bank_name, 'Nigerian bank')
        merchant.bank_last4 = accountNumber.slice(-4)
        merchant.bank_account_name = accountName
      }

      const store = await readStore()
      store.merchants[merchant.merchant_id] = merchant
      await writeStore(store)
      return res.json({ ok: true, merchant: await publicMerchant(merchant) })
    }

    if (action === 'createBankReceive') {
      const session = await verifiedPrivyUser(req)
      const ownerId = session.userId
      const suppliedOwnerEmail = cleanText(body.owner_email, '').toLowerCase()
      if (session.email && suppliedOwnerEmail && session.email !== suppliedOwnerEmail) {
        return res.status(403).json({ ok: false, error: 'Signed-in email does not match this payout profile.' })
      }
      const ownerEmail = session.email || suppliedOwnerEmail
      const ownerFirstName = cleanText(body.owner_first_name, '')
      const ownerLastName = cleanText(body.owner_last_name, '')
      const displayName = cleanText(body.display_name || body.memo, 'Bank receive')
      const amount = cleanAmount(body.amount)
      const bankCode = cleanText(body.bank_code, '')
      const bankName = cleanText(body.bank_name, 'Nigerian bank')
      const accountNumber = cleanText(body.account_number, '').replace(/\D/g, '').slice(0, 10)
      const accountName = cleanText(body.account_name, '')
      if (!ownerEmail) return res.status(401).json({ ok: false, error: 'Sign in to create bank receive links.' })
      if (!amount) return res.status(400).json({ ok: false, error: 'Enter a valid Naira amount.' })
      if (!bankCode || accountNumber.length !== 10 || !accountName) {
        return res.status(400).json({ ok: false, error: 'Verify a Nigerian bank account first.' })
      }
      if (!isPaycrestConfigured()) return res.status(400).json({ ok: false, error: 'Paycrest is not configured for bank receive yet.' })

      let { rate, source } = await getNgnRate()
      try {
        rate = await getPaycrestOfframpRate({ network: 'base', token: 'USDC', fiat: 'NGN', amount: '1' })
        source = 'paycrest'
      } catch (error) {
        console.warn('[ng-pos] Paycrest rate unavailable for bank receive; using fallback FX rate.', error instanceof Error ? error.message : String(error))
      }
      const amountNgn = amount
      const amountUsdc = amountNgn / rate
      const amountUsdcText = amountUsdc.toFixed(6).replace(/\.?0+$/, '')
      const now = new Date().toISOString()
      const merchant: MerchantProfile = {
        merchant_id: randomBytes(12).toString('base64url'),
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
        source: 'bank-receive',
        created_at: now,
        updated_at: now,
      }
      const intentId = randomBytes(12).toString('base64url')
      const store = await readStore()
      store.merchants[merchant.merchant_id] = merchant
      store.intents ??= {}
      store.intents[intentId] = {
        intent_id: intentId,
        merchant_id: merchant.merchant_id,
        amount_ngn: amountNgn.toFixed(2),
        estimated_amount_usdc: amountUsdcText,
        fx_rate_ngn_per_usdc: rate.toFixed(2),
        source: 'bank-receive',
        created_at: now,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }
      await writeStore(store)
      const pay_url = buildPayUrl(req, merchant, 'base', amountUsdcText, amountNgn.toFixed(2), 'INSTANT_FIAT', body.client_origin, intentId, 'bank-receive')
      return res.json({
        ok: true,
        link: {
          payment_url: pay_url,
          dashboard_url: buildDashboardUrl(req, merchant, body.client_origin),
          merchant_id: merchant.merchant_id,
          intent_id: intentId,
          amount_ngn: amountNgn.toFixed(2),
          estimated_amount_usdc: amountUsdcText,
          fx_rate_ngn_per_usdc: rate.toFixed(2),
          fx_source: source,
          bank_name: merchant.bank_name,
          bank_last4: merchant.bank_last4,
          bank_account_name: merchant.bank_account_name,
        },
      })
    }

    if (action === 'quote') {
      const merchantId = cleanText(body.merchant_id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      const settlementType = parseSettlementType(body.settlement_type)
      const amountCurrency = body.amount_currency === 'USDC' ? 'USDC' : 'NGN'
      const amount = cleanAmount(body.amount)
      if (!merchantId || !amount) return res.status(400).json({ ok: false, error: 'Missing merchant or amount.' })

      const store = await readStore()
      const merchant = store.merchants[merchantId]
      if (!merchant || !merchant.settlement_enabled) return res.status(404).json({ ok: false, error: 'Merchant is not available.' })
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
      const amountUsdcText = amountUsdc.toFixed(6).replace(/\.?0+$/, '')
      const quoteId = randomBytes(10).toString('base64url')
      const intentId = settlementType === 'INSTANT_FIAT' ? randomBytes(12).toString('base64url') : ''
      let fiatExecutionReady = true
      if (settlementType === 'INSTANT_FIAT') {
        if (!isPaycrestConfigured()) return res.status(400).json({ ok: false, error: 'Paycrest is not configured for naira settlement yet.' })
        store.intents ??= {}
        store.intents[intentId] = {
          intent_id: intentId,
          merchant_id: merchant.merchant_id,
          amount_ngn: amountNgn.toFixed(2),
          estimated_amount_usdc: amountUsdcText,
          fx_rate_ngn_per_usdc: rate.toFixed(2),
          source: 'pos',
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
          pay_url: buildPayUrl(req, merchant, network, amountUsdcText, amountNgn.toFixed(2), settlementType, body.client_origin, intentId, 'pos'),
          fiat_execution_ready: fiatExecutionReady,
          offramp_provider: settlementType === 'INSTANT_FIAT' ? 'paycrest' : undefined,
          intent_id: intentId || undefined,
          bank_name: settlementType === 'INSTANT_FIAT' ? merchant.bank_name : undefined,
          bank_last4: settlementType === 'INSTANT_FIAT' ? merchant.bank_last4 : undefined,
          bank_account_name: settlementType === 'INSTANT_FIAT' ? merchant.bank_account_name : undefined,
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
      const merchant = store.merchants[intent.merchant_id]
      if (!merchant?.encrypted_bank_details) return res.status(404).json({ ok: false, error: 'Merchant bank payout is not available.' })
      const bank = decryptBankDetails(merchant.encrypted_bank_details)
      const order = await createPaycrestOfframpOrder({
        intentId,
        merchantId: merchant.merchant_id,
        amountNgn: intent.amount_ngn,
        estimatedAmountUsdc: intent.estimated_amount_usdc,
        bankCode: bank.bank_code,
        accountNumber: bank.account_number,
        accountName: bank.account_name,
        bankName: merchant.bank_name,
        refundAddress,
        payerEmail,
        payerWallet: isAddress(payerWallet) ? payerWallet : refundAddress,
        memo: `Hash PayLink payment from ${payerName}`,
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
      const order = body.refresh ? await refreshPaycrestOrderStatus(id) : await getPaycrestPosOrder(id)
      if (!order) return res.status(404).json({ ok: false, error: 'Paycrest POS order not found.' })
      return res.json({ ok: true, order })
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const error = err as Error & { status?: number }
    const message = error.message || 'Nigerian POS request failed'
    return res.status(error.status ?? 500).json({ ok: false, error: message.slice(0, 220) })
  }
}

import type { Request, Response } from 'express'
import { randomBytes, createCipheriv, createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { getFxRate } from './fx-rate'

const STORE_PATH = process.env.NG_POS_STORE ?? './data/ng-pos-merchants.json'
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_STORE_KEY = (process.env.NG_POS_STORE_KEY ?? 'hashpaylink:ng-pos-merchants').trim()
const MAX_TEXT = 90

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
  display_name: string
  country: 'NG'
  payout_preference: PayoutPreference
  encrypted_bank_details?: EncryptedBankDetails
  bank_name?: string
  bank_code?: string
  bank_last4?: string
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'RESTRICTED'
  settlement_enabled: boolean
  created_at: string
  updated_at: string
}

type Store = {
  merchants: Record<string, MerchantProfile>
}

async function upstashCommand<T>(command: unknown[]): Promise<T | undefined> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) return undefined
  const response = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Upstash request failed: ${response.status}`)
  const data = await response.json() as { result?: T }
  return data.result
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
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
    const remote = await upstashCommand<string>(['GET', UPSTASH_STORE_KEY])
    if (remote) {
      const parsed = JSON.parse(remote) as Partial<Store>
      return { merchants: parsed.merchants ?? {} }
    }
  } catch (error) {
    console.warn('[ng-pos] Upstash load failed; using file fallback.', error instanceof Error ? error.message : String(error))
  }

  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { merchants: parsed.merchants ?? {} }
  } catch {
    return { merchants: {} }
  }
}

async function writeStore(store: Store) {
  const normalized = { merchants: store.merchants ?? {} }
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  try {
    await upstashCommand(['SET', UPSTASH_STORE_KEY, JSON.stringify(normalized)])
  } catch (error) {
    console.warn('[ng-pos] Upstash save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
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

function buildPayUrl(req: Request, merchant: MerchantProfile, network: PosNetwork, amountUsdc: string, amountNgn: string, settlementType: SettlementType, explicitOrigin?: unknown) {
  const params = new URLSearchParams()
  params.set('a', amountUsdc)
  params.set('n', network)
  if (network === 'solana') {
    params.set('s', merchant.solana_wallet_address ?? '')
  } else {
    params.set('e', merchant.circle_smart_wallet_address)
  }
  params.set('m', settlementType === 'INSTANT_FIAT' ? `${merchant.display_name} bank settlement` : merchant.display_name)
  params.set('src', 'ngpos')
  params.set('merchant', merchant.merchant_id)
  params.set('settlement', settlementType.toLowerCase())
  params.set('ngn', amountNgn)
  return `${originFromRequest(req, explicitOrigin)}/pay?${params.toString()}`
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

    if (action === 'createMerchant') {
      const displayName = cleanText(body.display_name, 'Local merchant')
      const wallet = cleanText(body.circle_smart_wallet_address, '') as `0x${string}`
      const solanaWallet = cleanText(body.solana_wallet_address, '')
      const supportedNetworks = normalizePosNetworks(body.supported_networks)
      const needsEvmWallet = supportedNetworks.some(isEvmPosNetwork)
      const needsSolanaWallet = supportedNetworks.includes('solana')
      const preference = body.payout_preference === 'INSTANT_FIAT' ? 'INSTANT_FIAT' : 'KEEP_CRYPTO'
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
        display_name: displayName,
        country: 'NG',
        payout_preference: preference,
        circle_smart_wallet_address: wallet,
        solana_wallet_address: needsSolanaWallet ? solanaWallet : undefined,
        supported_networks: supportedNetworks,
        kyc_status: 'UNVERIFIED',
        settlement_enabled: true,
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
      }

      const store = await readStore()
      store.merchants[merchant.merchant_id] = merchant
      await writeStore(store)
      return res.json({ ok: true, merchant: await publicMerchant(merchant) })
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
      if (network === 'solana' && !merchant.solana_wallet_address) {
        return res.status(400).json({ ok: false, error: 'Solana is not configured for this merchant.' })
      }
      if (isEvmPosNetwork(network) && !isAddress(merchant.circle_smart_wallet_address)) {
        return res.status(400).json({ ok: false, error: 'EVM payment is not configured for this merchant.' })
      }

      const { rate, source } = await getNgnRate()
      const amountNgn = amountCurrency === 'NGN' ? amount : amount * rate
      const amountUsdc = amountCurrency === 'USDC' ? amount : amount / rate
      const amountUsdcText = amountUsdc.toFixed(6).replace(/\.?0+$/, '')
      const quoteId = randomBytes(10).toString('base64url')

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
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          pay_url: buildPayUrl(req, merchant, network, amountUsdcText, amountNgn.toFixed(2), settlementType, body.client_origin),
          fiat_execution_ready: settlementType === 'KEEP_CRYPTO' ? true : Boolean(process.env.NG_POS_VASP_ENABLED === 'true'),
        },
      })
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Nigerian POS request failed'
    return res.status(500).json({ ok: false, error: message.slice(0, 220) })
  }
}

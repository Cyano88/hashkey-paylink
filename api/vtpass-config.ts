import { isAddress } from 'viem'
import { readCircleTreasuryConfig } from './circle-developer-treasury.js'

export type VtpassEnvironment = 'sandbox' | 'live'
export type VtpassBillsCategory = 'airtime' | 'data' | 'tv' | 'electricity'

export type VtpassPhase0Config = {
  environment: VtpassEnvironment
  apiBase: string
  apiKey: string
  publicKey: string
  secretKey: string
  billsEnabled: boolean
  sandboxVendingEnabled: boolean
  liveVendingEnabled: boolean
  airtimeWhitelistConfirmed: boolean
  liveCategories: VtpassBillsCategory[]
  refundsReady: boolean
  circleTreasuryReady: boolean
  treasuryAddress: string
  minNgn: number | null
  maxNgn: number | null
  dailyLimitNgn: number | null
  minimumProviderBalanceNgn: number | null
  storeKey: string
  credentialsReady: boolean
  policyReady: boolean
  canReadProvider: boolean
  canSandboxVend: boolean
  canLiveVend: boolean
  canVend: boolean
  issues: string[]
}

const VTPASS_BASES: Record<VtpassEnvironment, string> = {
  sandbox: 'https://sandbox.vtpass.com',
  live: 'https://vtpass.com',
}

function enabled(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function positiveNumber(value: unknown) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function vtpassEnvironment(value: unknown): VtpassEnvironment {
  return String(value ?? '').trim().toLowerCase() === 'live' ? 'live' : 'sandbox'
}

function normalizedApiBase(value: unknown, environment: VtpassEnvironment) {
  const fallback = VTPASS_BASES[environment]
  const text = String(value ?? '').trim().replace(/\/+$/, '') || fallback
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'https:') return { value: text, valid: false }
    const expectedHost = environment === 'live' ? 'vtpass.com' : 'sandbox.vtpass.com'
    return { value: text, valid: parsed.hostname === expectedHost && !parsed.username && !parsed.password }
  } catch {
    return { value: text, valid: false }
  }
}

export function readVtpassPhase0Config(env: NodeJS.ProcessEnv = process.env): VtpassPhase0Config {
  const environment = vtpassEnvironment(env.VTPASS_ENVIRONMENT)
  const apiBase = normalizedApiBase(env.VTPASS_API_BASE, environment)
  const apiKey = env.VTPASS_API_KEY?.trim() || ''
  const publicKey = env.VTPASS_PUBLIC_KEY?.trim() || ''
  const secretKey = env.VTPASS_SECRET_KEY?.trim() || ''
  const billsEnabled = enabled(env.POCKET_BILLS_ENABLED)
  const sandboxVendingEnabled = enabled(env.VTPASS_SANDBOX_VENDING_ENABLED)
  const liveVendingEnabled = enabled(env.VTPASS_LIVE_VENDING_ENABLED)
  const airtimeWhitelistConfirmed = enabled(env.VTPASS_AIRTIME_WHITELIST_CONFIRMED)
  const liveCategories: VtpassBillsCategory[] = [
    ...(airtimeWhitelistConfirmed ? ['airtime' as const] : []),
    ...(enabled(env.VTPASS_DATA_WHITELIST_CONFIRMED) ? ['data' as const] : []),
    ...(enabled(env.VTPASS_TV_WHITELIST_CONFIRMED) ? ['tv' as const] : []),
    ...(enabled(env.VTPASS_ELECTRICITY_WHITELIST_CONFIRMED) ? ['electricity' as const] : []),
  ]
  const refundsReady = enabled(env.POCKET_BILLS_REFUNDS_READY)
  const circleTreasury = readCircleTreasuryConfig(env)
  const treasuryAddress = env.POCKET_BILLS_TREASURY_ADDRESS?.trim() || ''
  const minNgn = positiveNumber(env.POCKET_BILLS_MIN_NGN)
  const maxNgn = positiveNumber(env.POCKET_BILLS_MAX_NGN)
  const dailyLimitNgn = positiveNumber(env.POCKET_BILLS_DAILY_LIMIT_NGN)
  const minimumProviderBalanceNgn = positiveNumber(env.VTPASS_MINIMUM_WALLET_BALANCE_NGN)
  const storeKey = env.POCKET_BILLS_STORE_KEY?.trim() || 'hashpaylink:pocket-bills:v1'
  const issues: string[] = []

  if (!apiBase.valid) issues.push('VTPASS_API_BASE must be the official HTTPS host for the selected environment.')
  if (!apiKey) issues.push('VTPASS_API_KEY is missing.')
  if (!publicKey) issues.push('VTPASS_PUBLIC_KEY is missing.')
  if (!secretKey) issues.push('VTPASS_SECRET_KEY is missing.')
  if (!treasuryAddress || !isAddress(treasuryAddress)) issues.push('POCKET_BILLS_TREASURY_ADDRESS must be an explicit valid EVM address.')
  if (minNgn === null) issues.push('POCKET_BILLS_MIN_NGN must be a positive number.')
  if (maxNgn === null) issues.push('POCKET_BILLS_MAX_NGN must be a positive number.')
  if (minNgn !== null && maxNgn !== null && minNgn > maxNgn) issues.push('POCKET_BILLS_MIN_NGN cannot exceed POCKET_BILLS_MAX_NGN.')
  if (dailyLimitNgn === null) issues.push('POCKET_BILLS_DAILY_LIMIT_NGN must be a positive number.')
  if (maxNgn !== null && dailyLimitNgn !== null && dailyLimitNgn < maxNgn) issues.push('POCKET_BILLS_DAILY_LIMIT_NGN cannot be lower than the per-payment maximum.')
  if (minimumProviderBalanceNgn === null) issues.push('VTPASS_MINIMUM_WALLET_BALANCE_NGN must be a positive number.')
  if (!storeKey) issues.push('POCKET_BILLS_STORE_KEY is missing.')
  if (environment === 'sandbox' && liveVendingEnabled) issues.push('VTPASS_LIVE_VENDING_ENABLED cannot be enabled in sandbox mode.')
  if (refundsReady && !circleTreasury.verificationReady) {
    issues.push('POCKET_BILLS_REFUNDS_READY requires a fully configured Circle developer-controlled treasury.')
  }

  const credentialsReady = Boolean(apiKey && publicKey && secretKey && apiBase.valid)
  const policyReady = Boolean(
    treasuryAddress
    && isAddress(treasuryAddress)
    && minNgn !== null
    && maxNgn !== null
    && minNgn <= maxNgn
    && dailyLimitNgn !== null
    && dailyLimitNgn >= maxNgn
    && minimumProviderBalanceNgn !== null
    && storeKey,
  )
  const canReadProvider = credentialsReady
  const canSandboxVend = environment === 'sandbox'
    && sandboxVendingEnabled
    && liveCategories.length > 0
    && credentialsReady
    && policyReady
  const canLiveVend = billsEnabled
    && environment === 'live'
    && liveVendingEnabled
    && airtimeWhitelistConfirmed
    && refundsReady
    && circleTreasury.verificationReady
    && credentialsReady
    && policyReady
  const canVend = canSandboxVend || canLiveVend

  return {
    environment,
    apiBase: apiBase.value,
    apiKey,
    publicKey,
    secretKey,
    billsEnabled,
    sandboxVendingEnabled,
    liveVendingEnabled,
    airtimeWhitelistConfirmed,
    liveCategories,
    refundsReady,
    circleTreasuryReady: circleTreasury.verificationReady,
    treasuryAddress,
    minNgn,
    maxNgn,
    dailyLimitNgn,
    minimumProviderBalanceNgn,
    storeKey,
    credentialsReady,
    policyReady,
    canReadProvider,
    canSandboxVend,
    canLiveVend,
    canVend,
    issues,
  }
}

export function publicVtpassPhase0Status(config: VtpassPhase0Config) {
  return {
    environment: config.environment,
    billsEnabled: config.billsEnabled,
    sandboxVendingEnabled: config.sandboxVendingEnabled,
    liveVendingEnabled: config.liveVendingEnabled,
    airtimeWhitelistConfirmed: config.airtimeWhitelistConfirmed,
    liveCategories: config.liveCategories,
    refundsReady: config.refundsReady,
    circleTreasuryReady: config.circleTreasuryReady,
    credentialsReady: config.credentialsReady,
    policyReady: config.policyReady,
    canReadProvider: config.canReadProvider,
    canSandboxVend: config.canSandboxVend,
    canLiveVend: config.canLiveVend,
    canVend: config.canVend,
    treasuryConfigured: Boolean(config.treasuryAddress && isAddress(config.treasuryAddress)),
    issues: config.issues,
  }
}

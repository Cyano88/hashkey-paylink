import {BASE_STABLECOINS, type BaseStablecoin} from '../../src/lib/baseStablecoins.js'
import {isAddress, parseUnits} from 'viem'
import {paymentFeeBreakdown} from '../../src/lib/platformFees.js'

// Missing asset identifies historical USDC records. Unknown assets fail closed.
export function billAsset(value: unknown): BaseStablecoin {
  if (value === undefined || value === 'USDC') return 'USDC'
  if (value === 'USDT') return 'USDT'
  throw Object.assign(new Error('Unsupported bill payment asset.'), {status: 400})
}
export function billToken(value: unknown) { return BASE_STABLECOINS[billAsset(value)] }

// A bounded, expiring operator canary never exposes USDT to the general app.
export function usdtBillsCanary(env = process.env, now = Date.now()) {
  try {
    const value = JSON.parse(env.POCKET_USDT_BILLS_CANARY || 'null')
    if (!value || !isAddress(value.wallet) || !/^0\d{10}$/.test(value.phone) || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null
    return {wallet: value.wallet.toLowerCase() as string, phone: value.phone as string}
  } catch { return null }
}
export function usdtBillsAllowed(wallet: string, env = process.env, now = Date.now()) {
  return env.POCKET_USDT_BILLS_ENABLED === 'true' || usdtBillsCanary(env,now)?.wallet === wallet.toLowerCase()
}
export function usdtBillsCanaryQuoteAllowed(input: {wallet:string;phone:string;country:string;category:string;amountNgn:string;amount:string}, env = process.env, now = Date.now()) {
  if (env.POCKET_USDT_BILLS_ENABLED === 'true') return true
  const canary = usdtBillsCanary(env,now)
  if (!canary || canary.wallet !== input.wallet.toLowerCase() || canary.phone !== input.phone || input.country !== 'NG' || input.category !== 'airtime' || Number(input.amountNgn) > 100) return false
  try { return paymentFeeBreakdown(parseUnits(input.amount,6),0n,'gross',false).total <= 100000n } catch { return false }
}

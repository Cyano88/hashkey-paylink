import { parseUnits } from 'viem'
const CACHE_MS = 60_000
const MAX_PRICE_AGE_MS = 180_000
let cache: { at: number; expiresAt: number; ratio: bigint } | null = null
let pending: Promise<bigint> | null = null
/** ETH is the gas asset on Base and Arbitrum. No stale or hard-coded price fallback. */
export async function readEthUsdcRate(fetcher = fetch, now = Date.now): Promise<bigint> {
  if (cache && now() >= cache.at && now() < cache.expiresAt) return cache.ratio
  if (pending) return pending
  pending = (async () => {
    const response = await fetcher('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin&vs_currencies=usd&include_last_updated_at=true', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Network fee pricing is temporarily unavailable.')
    const body = await response.json() as Record<string, { usd?: number; last_updated_at?: number }>
    for (const id of ['ethereum', 'usd-coin']) {
      const value = body[id]
      if (!value || !Number.isFinite(value.usd) || value.usd! <= 0 || !Number.isFinite(value.last_updated_at) || now() - value.last_updated_at! * 1000 > MAX_PRICE_AGE_MS || value.last_updated_at! * 1000 > now() + 30_000) throw new Error('Network fee pricing is not fresh. Try again.')
    }
    const rate = body.ethereum.usd! / body['usd-coin'].usd!
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000_000) throw new Error('Invalid network fee conversion rate.')
    const ratio = BigInt(Math.ceil(rate * 1e8))
    const oldestPriceAt = Math.min(body.ethereum.last_updated_at!, body['usd-coin'].last_updated_at!) * 1000
    cache = { at: now(), expiresAt: Math.min(now() + CACHE_MS, oldestPriceAt + MAX_PRICE_AGE_MS), ratio }
    return ratio
  })().finally(() => { pending = null })
  return pending
}
export function nativeFeeToUsdcUnits(networkFee: string, rateScaled8: bigint) {
  if (!/^\d+(?:\.\d{1,18})?$/.test(networkFee) || rateScaled8 <= 0n) throw new Error('Invalid network fee estimate.')
  const value = parseUnits(networkFee, 18)
  if (value <= 0n) throw new Error('Network fee estimate is unavailable.')
  const numerator = value * rateScaled8
  const denominator = 10n ** 20n
  return (numerator + denominator - 1n) / denominator
}

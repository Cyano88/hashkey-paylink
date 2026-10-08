import { parseUnits } from 'viem'
const CACHE_MS = 60_000
const MAX_PRICE_AGE_MS = 180_000
type NativeAsset = 'ethereum' | 'polygon' | 'solana'
const PRICE_IDS = { ethereum: 'ethereum', polygon: 'polygon-ecosystem-token', solana: 'solana' } as const
const caches = new Map<string, { at: number; expiresAt: number; ratio: bigint }>()
const requests = new Map<string, Promise<bigint>>()
/** ETH is the gas asset on Base and Arbitrum. No stale or hard-coded price fallback. */
export const readEthUsdcRate = (fetcher = fetch, now = Date.now) => readNativeUsdcRate('ethereum', fetcher, now)
export async function readNativeUsdcRate(asset: NativeAsset, fetcher = fetch, now = Date.now, stablecoin: 'USDC' | 'USDT' = 'USDC'): Promise<bigint> {
  const stableId = stablecoin === 'USDT' ? 'tether' : 'usd-coin'
  const cacheKey = asset + ':' + stablecoin
  const priceId = PRICE_IDS[asset]
  if (!priceId) throw new Error('Unsupported gas asset.')
  const cache = caches.get(cacheKey)
  const pending = requests.get(cacheKey)
  if (cache && now() >= cache.at && now() < cache.expiresAt) return cache.ratio
  if (pending) return pending
  const work = (async () => {
    const response = await fetcher(`https://api.coingecko.com/api/v3/simple/price?ids=${priceId},${stableId}&vs_currencies=usd&include_last_updated_at=true`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Network fee pricing is temporarily unavailable.')
    const body = await response.json() as Record<string, { usd?: number; last_updated_at?: number }>
    for (const id of [priceId, stableId]) {
      const value = body[id]
      if (!value || !Number.isFinite(value.usd) || value.usd! <= 0 || !Number.isFinite(value.last_updated_at) || now() - value.last_updated_at! * 1000 > MAX_PRICE_AGE_MS || value.last_updated_at! * 1000 > now() + 30_000) throw new Error('Network fee pricing is not fresh. Try again.')
    }
    const rate = body[priceId].usd! / body[stableId].usd!
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000_000) throw new Error('Invalid network fee conversion rate.')
    const ratio = BigInt(Math.ceil(rate * 1e8))
    const oldestPriceAt = Math.min(body[priceId].last_updated_at!, body[stableId].last_updated_at!) * 1000
    caches.set(cacheKey, { at: now(), expiresAt: Math.min(now() + CACHE_MS, oldestPriceAt + MAX_PRICE_AGE_MS), ratio })
    return ratio
  })().finally(() => { requests.delete(cacheKey) })
  requests.set(cacheKey, work)
  return work
}
export function nativeFeeToUsdcUnits(networkFee: string, rateScaled8: bigint) {
  if (!/^\d+(?:\.\d{1,18})?$/.test(networkFee) || rateScaled8 <= 0n) throw new Error('Invalid network fee estimate.')
  const value = parseUnits(networkFee, 18)
  if (value <= 0n) throw new Error('Network fee estimate is unavailable.')
  const numerator = value * rateScaled8
  const denominator = 10n ** 20n
  return (numerator + denominator - 1n) / denominator
}

/**
 * GET /api/fx-rate?currency=NGN
 *
 * Proxies Fixer.io and converts EUR-based rates to USD-based rates.
 * Caches each currency independently for 10 minutes to minimise API calls.
 *
 * Fixer free plan uses EUR as base — conversion:
 *   1 USD = (EUR→TARGET) / (EUR→USD)
 *
 * Env:  FIXER_API_KEY — your Fixer.io access key
 */

import type { Request, Response } from 'express'

// ── Supported currencies ──────────────────────────────────────────────────────
export const FX_META: Record<string, { symbol: string; name: string; decimals: number }> = {
  NGN: { symbol: '₦',   name: 'Nigerian Naira',   decimals: 0 },
  GHS: { symbol: '₵',   name: 'Ghanaian Cedi',    decimals: 2 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling',  decimals: 2 },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar', decimals: 2 },
}

// ── In-memory cache — keyed by currency code, 10-minute TTL ──────────────────
const CACHE_TTL = 10 * 60 * 1_000

interface CacheEntry { rate: number; fetchedAt: number }
const cache = new Map<string, CacheEntry>()

function isFresh(e: CacheEntry) { return Date.now() - e.fetchedAt < CACHE_TTL }

// ── Fixer.io fetch ────────────────────────────────────────────────────────────
async function fetchRate(currency: string): Promise<number> {
  const key = process.env.FIXER_API_KEY
  if (!key) throw new Error('FIXER_API_KEY not configured')

  const url = `http://data.fixer.io/api/latest?access_key=${key}&symbols=USD,${currency}`
  const res  = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  const data = await res.json() as {
    success: boolean
    rates?: Record<string, number>
    error?: { info: string }
  }

  if (!data.success || !data.rates) throw new Error(data.error?.info ?? 'Fixer.io failed')

  const eurToUsd  = data.rates['USD']
  const eurToTarget = data.rates[currency]
  if (!eurToUsd || !eurToTarget) throw new Error(`Missing rate data for ${currency}`)

  // 1 USD = eurToTarget / eurToUsd
  return eurToTarget / eurToUsd
}

export async function getFxRate(currency: string): Promise<{ rate: number; source: string; cachedAt: number; stale: boolean }> {
  if (!(currency in FX_META)) throw new Error(`Unsupported currency: ${currency}`)

  const cached = cache.get(currency)
  if (cached && isFresh(cached)) {
    return { rate: cached.rate, source: 'fixer', cachedAt: cached.fetchedAt, stale: false }
  }

  try {
    const rate = await fetchRate(currency)
    const fetchedAt = Date.now()
    cache.set(currency, { rate, fetchedAt })
    return { rate, source: 'fixer', cachedAt: fetchedAt, stale: false }
  } catch (err) {
    if (cached) {
      return { rate: cached.rate, source: 'fixer', cachedAt: cached.fetchedAt, stale: true }
    }
    throw err
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: Request, res: Response) {
  const { currency } = req.query as { currency?: string }

  if (!currency || !(currency in FX_META)) {
    return res.status(400).json({
      ok: false,
      error: `Unsupported currency. Supported: ${Object.keys(FX_META).join(', ')}`,
    })
  }

  const meta   = FX_META[currency]
  try {
    const quote = await getFxRate(currency)
    return res.json({ ok: true, rate: quote.rate, currency, ...meta, cachedAt: quote.cachedAt, stale: quote.stale })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fx-rate]', msg)
    return res.status(503).json({ ok: false, error: msg.slice(0, 200) })
  }
}

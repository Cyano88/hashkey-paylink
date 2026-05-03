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
  NGN: { symbol: '₦',   name: 'Nigerian Naira',      decimals: 0 },
  GHS: { symbol: '₵',   name: 'Ghanaian Cedi',        decimals: 2 },
  RWF: { symbol: 'RF',  name: 'Rwandan Franc',         decimals: 0 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar',      decimals: 2 },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar',      decimals: 2 },
  JPY: { symbol: '¥',   name: 'Japanese Yen',          decimals: 0 },
  SCR: { symbol: 'SR',  name: 'Seychellois Rupee',     decimals: 2 },
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
  const cached = cache.get(currency)

  // Return fresh cache immediately
  if (cached && isFresh(cached)) {
    return res.json({ ok: true, rate: cached.rate, currency, ...meta, cachedAt: cached.fetchedAt, stale: false })
  }

  try {
    const rate = await fetchRate(currency)
    cache.set(currency, { rate, fetchedAt: Date.now() })
    return res.json({ ok: true, rate, currency, ...meta, cachedAt: Date.now(), stale: false })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fx-rate]', msg)

    // Serve stale cache rather than hard-failing
    if (cached) {
      return res.json({ ok: true, rate: cached.rate, currency, ...meta, cachedAt: cached.fetchedAt, stale: true })
    }
    return res.status(503).json({ ok: false, error: msg.slice(0, 200) })
  }
}

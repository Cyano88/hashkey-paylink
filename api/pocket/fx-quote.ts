import type { Request, Response } from 'express'
import { readDurableJson, writeDurableJson } from '../render-durable-store.js'

const PAYCREST_QUOTE_CACHE_MS = 30_000
const PAYCREST_QUOTE_VALIDITY_MS = 60_000
const PAYCREST_QUOTE_TIMEOUT_MS = 5_000
const PAYCREST_LAST_KNOWN_MAX_AGE_MS = 6 * 60 * 60_000
const PAYCREST_QUOTE_STORE_KEY = 'hashpaylink:pocket:paycrest-ngn-quote'

export type PocketFxQuote = {
  asset?: 'USDC' | 'USDT'
  currency: 'NGN' | 'UGX'
  symbol: '₦' | 'UGX'
  amount: string
  rate: number
  source: 'paycrest'
  side: 'sell'
  quotedAt: number
  expiresAt: number
  stale?: boolean
}

type PocketFxQuoteReaderDependencies = {
  asset?: 'USDC' | 'USDT'
  currency?: 'NGN' | 'UGX'
  fetcher?: typeof fetch
  now?: () => number
  baseUrl?: string
  readLastKnown?: () => Promise<PocketFxQuote | undefined>
  writeLastKnown?: (quote: PocketFxQuote) => Promise<void>
}

export function createPocketFxQuoteReader({
  currency = 'NGN',
  asset = 'USDC',
  fetcher = fetch,
  now = Date.now,
  baseUrl = process.env.PAYCREST_API_BASE ?? 'https://api.paycrest.io',
  readLastKnown = () => readDurableJson<PocketFxQuote>(PAYCREST_QUOTE_STORE_KEY + ":" + currency + (asset === 'USDT' ? ':USDT' : '')),
  writeLastKnown = quote => writeDurableJson(PAYCREST_QUOTE_STORE_KEY + ":" + currency + (asset === 'USDT' ? ':USDT' : ''), quote),
}: PocketFxQuoteReaderDependencies = {}) {
  let cached: PocketFxQuote | null = null
  let durableLoaded = false
  let inFlight: { amount: string; promise: Promise<PocketFxQuote> } | null = null

  return async function readPocketFxQuote(amount = '1'): Promise<PocketFxQuote> {
    const currentTime = now()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw new Error('Enter a valid stablecoin quote amount.')
    if (!durableLoaded) {
      durableLoaded = true
      void readLastKnown().then(saved => {
        if (saved?.currency === currency && (saved.asset ?? 'USDC') === asset && saved.source === 'paycrest' && Number.isFinite(saved.rate) && saved.rate > 0
          && (!cached || saved.quotedAt > cached.quotedAt)) cached = saved
      }).catch(() => undefined)
    }
    if (cached?.amount === amount && !cached.stale && cached.expiresAt > currentTime && currentTime - cached.quotedAt < PAYCREST_QUOTE_CACHE_MS) return cached
    if (inFlight?.amount === amount) return inFlight.promise

    const promise = (async () => {
      const response = await fetcher(
        `${baseUrl.replace(/\/+$/, '')}/v2/rates/base/${asset}/${encodeURIComponent(amount)}/${currency}?side=sell`,
        { method: 'GET', signal: AbortSignal.timeout(PAYCREST_QUOTE_TIMEOUT_MS) },
      )
      const body = await response.json().catch(() => undefined) as {
        status?: unknown
        message?: unknown
        data?: { sell?: { rate?: unknown } }
      } | undefined
      const rate = Number(body?.data?.sell?.rate)
      if (!response.ok || body?.status !== 'success' || !Number.isFinite(rate) || rate <= 0) {
        if (cached?.amount === amount && currentTime - cached.quotedAt <= PAYCREST_LAST_KNOWN_MAX_AGE_MS) {
          return { ...cached, stale: true, expiresAt: currentTime + PAYCREST_QUOTE_CACHE_MS }
        }
        const message = typeof body?.message === 'string' ? body.message : 'Paycrest FX quote is still resolving.'
        throw new Error(message)
      }

      const quotedAt = now()
      cached = {
        ...(asset === 'USDT' ? {asset} : {}),
        currency,
        symbol: currency === 'NGN' ? '₦' : 'UGX',
        amount,
        rate,
        source: 'paycrest',
        side: 'sell',
        quotedAt,
        expiresAt: quotedAt + PAYCREST_QUOTE_VALIDITY_MS,
        stale: false,
      }
      // Persistence must not delay delivery of a fresh provider rate.
      void writeLastKnown(cached).catch(() => undefined)
      return cached
    })().finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
    inFlight = { amount, promise }
    return promise
  }
}

type PocketFxQuoteHandlerDependencies = {
  readQuote: (amount?: string, currency?: 'NGN' | 'UGX', asset?: 'USDC' | 'USDT') => Promise<PocketFxQuote>
}

export function createPocketFxQuoteHandler({ readQuote }: PocketFxQuoteHandlerDependencies) {
  return async function pocketFxQuoteHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })

    const currency = String(req.query.currency ?? 'NGN').trim().toUpperCase()
    if (currency !== 'NGN' && currency !== 'UGX') {
      return res.status(400).json({ ok: false, error: 'Choose NGN or UGX for a local currency quote.' })
    }

    const asset = String(req.query.asset ?? 'USDC').trim().toUpperCase()
    if (asset !== 'USDC' && asset !== 'USDT') return res.status(400).json({ok:false,error:'Choose USDC or USDT.'})
    const amount = String(req.query.amount ?? '1').trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      return res.status(400).json({ ok: false, error: 'Enter a valid stablecoin quote amount.' })
    }

    try {
      const quote = await readQuote(amount, currency, asset)
      if (quote.currency !== currency || (quote.asset ?? 'USDC') !== asset) throw new Error('Quote currency did not match.')
      return res.json({ ok: true, quote })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paycrest FX quote is unavailable.'
      return res.status(503).json({ ok: false, error: message.slice(0, 200) })
    }
  }
}

const readers = {
  USDC: { NGN: createPocketFxQuoteReader(), UGX: createPocketFxQuoteReader({ currency: 'UGX' }) },
  USDT: { NGN: createPocketFxQuoteReader({asset:'USDT'}), UGX: createPocketFxQuoteReader({currency:'UGX',asset:'USDT'}) },
}
export const readPocketPaycrestQuote = (amount = '1', currency: 'NGN' | 'UGX' = 'NGN', asset:'USDC'|'USDT'='USDC') => readers[asset][currency](amount)
export default createPocketFxQuoteHandler({ readQuote: readPocketPaycrestQuote })

import type { Request, Response } from 'express'

const PAYCREST_QUOTE_CACHE_MS = 30_000
const PAYCREST_QUOTE_VALIDITY_MS = 60_000
const PAYCREST_QUOTE_TIMEOUT_MS = 5_000

export type PocketFxQuote = {
  currency: 'NGN'
  symbol: '₦'
  rate: number
  source: 'paycrest'
  side: 'sell'
  quotedAt: number
  expiresAt: number
}

type PocketFxQuoteReaderDependencies = {
  fetcher?: typeof fetch
  now?: () => number
  baseUrl?: string
}

export function createPocketFxQuoteReader({
  fetcher = fetch,
  now = Date.now,
  baseUrl = process.env.PAYCREST_API_BASE ?? 'https://api.paycrest.io',
}: PocketFxQuoteReaderDependencies = {}) {
  let cached: PocketFxQuote | null = null
  let inFlight: Promise<PocketFxQuote> | null = null

  return async function readPocketFxQuote(): Promise<PocketFxQuote> {
    const currentTime = now()
    if (cached && currentTime - cached.quotedAt < PAYCREST_QUOTE_CACHE_MS) return cached
    if (inFlight) return inFlight

    inFlight = (async () => {
      const response = await fetcher(
        `${baseUrl.replace(/\/+$/, '')}/v2/rates/base/USDC/1/NGN?side=sell`,
        { method: 'GET', signal: AbortSignal.timeout(PAYCREST_QUOTE_TIMEOUT_MS) },
      )
      const body = await response.json().catch(() => undefined) as {
        status?: unknown
        message?: unknown
        data?: { sell?: { rate?: unknown } }
      } | undefined
      if (!response.ok || body?.status !== 'success') {
        const message = typeof body?.message === 'string' ? body.message : 'Paycrest FX quote is unavailable.'
        throw new Error(message)
      }
      const rate = Number(body.data?.sell?.rate)
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Paycrest returned an invalid NGN quote.')

      const quotedAt = now()
      cached = {
        currency: 'NGN',
        symbol: '₦',
        rate,
        source: 'paycrest',
        side: 'sell',
        quotedAt,
        expiresAt: quotedAt + PAYCREST_QUOTE_VALIDITY_MS,
      }
      return cached
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}

type PocketFxQuoteHandlerDependencies = {
  readQuote: () => Promise<PocketFxQuote>
}

export function createPocketFxQuoteHandler({ readQuote }: PocketFxQuoteHandlerDependencies) {
  return async function pocketFxQuoteHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })

    const currency = String(req.query.currency ?? 'NGN').trim().toUpperCase()
    if (currency !== 'NGN') {
      return res.status(400).json({ ok: false, error: 'Pocket live FX currently supports NGN only.' })
    }

    try {
      const quote = await readQuote()
      return res.json({ ok: true, quote })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paycrest FX quote is unavailable.'
      return res.status(503).json({ ok: false, error: message.slice(0, 200) })
    }
  }
}

const readQuote = createPocketFxQuoteReader()
export default createPocketFxQuoteHandler({ readQuote })

import type { Request, Response } from 'express'

const PAYCREST_QUOTE_CACHE_MS = 30_000
const PAYCREST_QUOTE_VALIDITY_MS = 60_000
const PAYCREST_QUOTE_TIMEOUT_MS = 5_000

export type PocketFxQuote = {
  currency: 'NGN'
  symbol: '₦'
  amount: string
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
  let inFlight: { amount: string; promise: Promise<PocketFxQuote> } | null = null

  return async function readPocketFxQuote(amount = '1'): Promise<PocketFxQuote> {
    const currentTime = now()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw new Error('Enter a valid USDC quote amount.')
    if (cached?.amount === amount && currentTime - cached.quotedAt < PAYCREST_QUOTE_CACHE_MS) return cached
    if (inFlight?.amount === amount) return inFlight.promise

    const promise = (async () => {
      const response = await fetcher(
        `${baseUrl.replace(/\/+$/, '')}/v2/rates/base/USDC/${encodeURIComponent(amount)}/NGN?side=sell`,
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
        amount,
        rate,
        source: 'paycrest',
        side: 'sell',
        quotedAt,
        expiresAt: quotedAt + PAYCREST_QUOTE_VALIDITY_MS,
      }
      return cached
    })().finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
    inFlight = { amount, promise }
    return promise
  }
}

type PocketFxQuoteHandlerDependencies = {
  readQuote: (amount?: string) => Promise<PocketFxQuote>
}

export function createPocketFxQuoteHandler({ readQuote }: PocketFxQuoteHandlerDependencies) {
  return async function pocketFxQuoteHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })

    const currency = String(req.query.currency ?? 'NGN').trim().toUpperCase()
    if (currency !== 'NGN') {
      return res.status(400).json({ ok: false, error: 'Pocket live FX currently supports NGN only.' })
    }

    const amount = String(req.query.amount ?? '1').trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      return res.status(400).json({ ok: false, error: 'Enter a valid USDC quote amount.' })
    }

    try {
      const quote = await readQuote(amount)
      return res.json({ ok: true, quote })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paycrest FX quote is unavailable.'
      return res.status(503).json({ ok: false, error: message.slice(0, 200) })
    }
  }
}

const readQuote = createPocketFxQuoteReader()
export default createPocketFxQuoteHandler({ readQuote })

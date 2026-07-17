import { POCKET_API } from '../lib/pocketSchemas'

export type PocketFxQuote = {
  currency: 'NGN'
  symbol: '₦'
  rate: number
  source: 'paycrest'
  side: 'sell'
  quotedAt: number
  expiresAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePocketFxQuote(value: unknown): PocketFxQuote {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.quote)) {
    const message = isRecord(value) && typeof value.error === 'string' ? value.error : 'Live FX rate is unavailable.'
    throw new Error(message)
  }
  const quote = value.quote
  if (
    quote.currency !== 'NGN'
    || quote.symbol !== '₦'
    || quote.source !== 'paycrest'
    || quote.side !== 'sell'
    || typeof quote.rate !== 'number'
    || !Number.isFinite(quote.rate)
    || quote.rate <= 0
    || typeof quote.quotedAt !== 'number'
    || typeof quote.expiresAt !== 'number'
    || quote.expiresAt <= quote.quotedAt
  ) {
    throw new Error('Live FX rate response was invalid.')
  }
  return quote as PocketFxQuote
}

export async function readPocketFxQuote(fetcher: typeof fetch = fetch): Promise<PocketFxQuote> {
  const response = await fetcher(`${POCKET_API.fxQuote}?currency=NGN`, { method: 'GET' })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = isRecord(data) && typeof data.error === 'string' ? data.error : 'Live FX rate is unavailable.'
    throw new Error(message)
  }
  return parsePocketFxQuote(data)
}

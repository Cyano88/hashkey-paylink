import type { Request, Response } from 'express'
import { createHmac } from 'node:crypto'
import { okxCredentials } from './xstocks-swap-provider.js'
import { stockAssets } from '../../src/pocket/lib/pocketXStocksWallet.js'
const allowed = new Set(stockAssets.map(a => a.address.toLowerCase()))
type Price = { usd: number; fetchedAt: number; change: null; volume: number }
const cache = new Map<string, Price>()
const attempts = new Map<string, number>()
const pending = new Map<string, Promise<void>>()
export function parseStockMarketPrices(rows: unknown, addresses: string[], now = Date.now()) {
  if (!Array.isArray(rows)) throw Error('Invalid price response.')
  const requested = new Set(addresses)
  const result: Record<string, Price> = {}
  for (const row of rows) {
    const address = String(row.tokenContractAddress || '').toLowerCase(), price = Number(row.price), time = Number(row.time)
    if (String(row.chainIndex) !== '196' || !requested.has(address) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || time > now + 5000 || now - time >= 60_000) continue
    result[address] = { usd: price, fetchedAt: time, change: null, volume: 0 }
  }
  return result
}
export async function readStockMarketPrices(addresses: string[], fetcher = fetch) {
  const now = Date.now(), needed = addresses.filter(a => !pending.has(a) && now - (attempts.get(a) || 0) >= 30_000)
  if (needed.length) {
    needed.forEach(a => attempts.set(a, now))
    const work = (async () => {
      const c = okxCredentials()
      if (!c.key || !c.secret || !c.passphrase) throw Error('Prices are unavailable.')
      const path = '/api/v6/dex/market/price', body = JSON.stringify(needed.map(tokenContractAddress => ({ chainIndex: '196', tokenContractAddress }))), timestamp = new Date().toISOString()
      const sign = createHmac('sha256', c.secret).update(timestamp + 'POST' + path + body).digest('base64')
      const response = await fetcher('https://web3.okx.com' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'OK-ACCESS-KEY': c.key, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-PASSPHRASE': c.passphrase, 'OK-ACCESS-TIMESTAMP': timestamp }, body, signal: AbortSignal.timeout(10_000), redirect: 'error' })
      const data = await response.json() as any
      if (!response.ok || String(data.code) !== '0') throw Error('Prices are unavailable.')
      const fresh = parseStockMarketPrices(data.data, needed)
      needed.forEach(a => { if (fresh[a]) cache.set(a, fresh[a]); else cache.delete(a) })
    })().finally(() => needed.forEach(a => pending.delete(a)))
    needed.forEach(a => pending.set(a, work))
  }
  await Promise.all([...new Set(addresses.flatMap(a => pending.has(a) ? [pending.get(a)!] : []))])
  return Object.fromEntries(addresses.flatMap(a => { const q = cache.get(a); return q && Date.now() - q.fetchedAt < 60_000 ? [[a, q]] : [] }))
}
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  const raw = req.body?.addresses
  if (!Array.isArray(raw) || !raw.length || raw.length > 100 || raw.some(a => typeof a !== 'string' || !allowed.has(a.toLowerCase()))) return res.status(400).json({ ok: false, error: 'Choose up to 100 supported stock contracts.' })
  try { const quotes = await readStockMarketPrices([...new Set(raw.map(a => a.toLowerCase()))]); return res.json({ ok: true, quotes, source: 'OKX' }) }
  catch { return res.status(503).json({ ok: false, error: 'Prices are temporarily unavailable.' }) }
}

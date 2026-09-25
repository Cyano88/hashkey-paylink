import type { Request, Response } from 'express'
import { walletReceiveDetails } from './wallet-receive-details.js'
import { formatUnits, getAddress, isAddress, zeroAddress } from 'viem'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { readServerStockBalances } from './pocket/xstocks-balances.js'
import { readStockMarketPrices } from './pocket/xstocks-prices.js'
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
const defaults = { policy: resolveDeveloperApiKeyPolicy, balances: readServerStockBalances, prices: readStockMarketPrices, now: Date.now }
// Read-only public on-chain data. The builder must authenticate its user and select
// the user's verified wallet. This endpoint never asserts ownership or grants signing.
export function createStockWalletBalancesHandler(overrides: Partial<typeof defaults> = {}) {
  const d = { ...defaults, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (req.method !== 'POST') fail(405, 'Use POST.')
      assertLiveDeveloperRequest(req)
      const policy = await d.policy(req)
      if (!policy || policy.environment !== 'live' || policy.checkoutMode !== 'human') fail(403, 'A live stock balance read key is required.')
      const wallet = req.body?.wallet
      if (typeof wallet !== 'string' || !isAddress(wallet) || getAddress(wallet) === zeroAddress) fail(400, 'Provide a valid X Layer wallet.')
      const snapshot = await d.balances('developer:' + policy.partnerId, getAddress(wallet))
      const stale = d.now() - snapshot.observedAt >= 60000
      let prices: Awaited<ReturnType<typeof readStockMarketPrices>> = {}
      try { for (let i = 0; i < snapshot.holdings.length; i += 100) Object.assign(prices, await d.prices(snapshot.holdings.slice(i, i + 100).map(h => h.asset.address.toLowerCase()))) } catch { /* Unknown prices never become zero. */ }
      const holdings = snapshot.holdings.map(h => {
        const balance = formatUnits(h.units, h.decimals), quote = prices[h.asset.address.toLowerCase()]
        const value = quote && d.now() - quote.fetchedAt < 60000 ? Number(balance) * quote.usd : NaN
        return { address: h.asset.address, symbol: h.asset.symbol, name: h.asset.name, decimals: h.decimals, units: h.units.toString(), balance, estimatedValueUsd: Number.isFinite(value) ? value : null, priceObservedAt: quote?.fetchedAt ?? null }
      })
      const pricingComplete = holdings.every(h => h.estimatedValueUsd !== null)
      const sum = holdings.reduce((total, h) => total + (h.estimatedValueUsd ?? 0), 0)
      return res.json({ ok: true, wallet: getAddress(wallet), chainId: 196, receive: walletReceiveDetails('xlayer', getAddress(wallet)), gas: { symbol: 'OKB', decimals: 18, units: snapshot.gas.toString(), balance: formatUnits(snapshot.gas, 18), observedAt: snapshot.observedAt, stale }, holdings, complete: snapshot.complete, stale, observedAt: snapshot.observedAt, blockNumber: snapshot.blockNumber.toString(), pricingComplete, estimatedValueUsd: snapshot.complete && !stale && pricingComplete && Number.isFinite(sum) ? sum : null })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'Stock balances are unavailable. Try again.' })
    }
  }
}
export default createStockWalletBalancesHandler()

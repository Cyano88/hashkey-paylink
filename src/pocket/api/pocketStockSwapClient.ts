import { pocketApiUrl } from '../lib/pocketRoutes'
import { type StockSwapQuote } from '../lib/pocketXStocksSwap'
export async function stockSwapRequest(getAccessToken: () => Promise<string | null>, body: Record<string, string>): Promise<{ quote: StockSwapQuote; quoteToken: string }> {
  const token = await getAccessToken()
  if (!token) throw Error('Sign in to Pocket again.')
  const response = await fetch(pocketApiUrl('/api/pocket/xstocks/swap'), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  const data = await response.json()
  if (!response.ok || !data.ok || !data.quote) throw Error(data.error || 'Could not load a stock quote.')
  return data
}

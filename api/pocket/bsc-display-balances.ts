import {createHmac} from 'node:crypto'
import {parseUnits} from 'viem'
import {POCKET_BSC, type PocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import {okxCredentials} from './xstocks-swap-provider.js'
import {createBscRuntime} from './bsc-runtime.js'

type Balances = Record<PocketBscAsset, bigint>
const assets = Object.values(POCKET_BSC.assets)
const unavailable = () => new Error('BNB display balances are temporarily unavailable.')

export function parseBscDisplayBalances(data: unknown, wallet: string): Balances {
  const groups = data as any
  if (!Array.isArray(groups) || groups.length !== 1 || !Array.isArray(groups[0]?.tokenAssets) || groups[0].tokenAssets.length !== 3) throw unavailable()
  const found = new Map<string, bigint>()
  for (const row of groups[0].tokenAssets) {
    if (!row || String(row.chainIndex) !== '56' || typeof row.tokenContractAddress !== 'string' || (row.address && String(row.address).toLowerCase() !== wallet.toLowerCase())) throw unavailable()
    const address = row.tokenContractAddress.toLowerCase()
    const asset = assets.find(a => (a.native ? '' : a.address.toLowerCase()) === address)
    if (!asset || found.has(asset.symbol) || typeof row.balance !== 'string' || !/^\d{1,78}(?:\.\d{1,18})?$/.test(row.balance)) throw unavailable()
    const units = parseUnits(row.balance, 18)
    if (units >= 2n ** 256n || row.rawBalance !== undefined && row.rawBalance !== '' && (typeof row.rawBalance !== 'string' || !/^\d+$/.test(row.rawBalance) || BigInt(row.rawBalance) !== units)) throw unavailable()
    found.set(asset.symbol, units)
  }
  if (found.size !== 3) throw unavailable()
  return Object.fromEntries(found) as Balances
}

export async function fetchBscDisplayBalances(wallet: string, fetcher = fetch): Promise<Balances> {
  if (!/^0x[0-9a-f]{40}$/i.test(wallet)) throw unavailable()
  const c = okxCredentials()
  if (!c.key || !c.secret || !c.passphrase) throw unavailable()
  const path = '/api/v6/dex/balance/token-balances-by-address'
  const body = JSON.stringify({address: wallet, tokenContractAddresses: assets.map(a => ({chainIndex: '56', tokenContractAddress: a.native ? '' : a.address})), excludeRiskToken: '1'})
  const timestamp = new Date().toISOString()
  const response = await fetcher('https://web3.okx.com' + path, {method: 'POST', headers: {
    'Content-Type': 'application/json', 'OK-ACCESS-KEY': c.key, 'OK-ACCESS-PASSPHRASE': c.passphrase,
    'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-SIGN': createHmac('sha256', c.secret).update(timestamp + 'POST' + path + body).digest('base64'),
  }, body, redirect: 'error', signal: AbortSignal.timeout(6000)})
  if (!response.ok) throw unavailable()
  const value = await response.json()
  if (value.code !== '0') throw unavailable()
  return parseBscDisplayBalances(value.data, wallet)
}

/** Display only: never use this cache for quotes, signatures or settlement.
 * No stale balance or invented zero is returned when both providers fail. */
export function createBscDisplayReader(provider: (wallet: string) => Promise<Balances>, fallback: (wallet: string) => Promise<Balances>, now = Date.now) {
  type Entry = {value?: Balances; observedAt?: number; retryAt: number; failedUntil: number; pending?: Promise<{units: Balances; observedAt: number}>}
  const entries = new Map<string, Entry>()
  return async (wallet: string): Promise<{units: Balances; observedAt: number}> => {
    if (!/^0x[0-9a-f]{40}$/i.test(wallet)) throw unavailable()
    const key = wallet.toLowerCase()
    let entry = entries.get(key)
    if (!entry) {
      if (entries.size >= 256) {
        const victim = [...entries].find(([, e]) => !e.pending)
        if (!victim) throw unavailable()
        entries.delete(victim[0])
      }
      entry = {retryAt: 0, failedUntil: 0}; entries.set(key, entry)
    }
    if (entry.pending) { const result = await entry.pending; return {...result, units: {...result.units}} }
    if (entry.value && entry.observedAt !== undefined && now() - entry.observedAt < 15_000) return {units: {...entry.value}, observedAt: entry.observedAt}
    if (now() < entry.failedUntil) throw unavailable()
    const current = entry
    current.pending = (async () => {
      const observedAt = now()
      let units: Balances | undefined
      if (now() >= current.retryAt) {
        try { units = await provider(wallet); current.retryAt = 0 }
        catch { current.retryAt = now() + 60_000 }
      }
      units ??= await fallback(wallet)
      current.value = {...units}; current.observedAt = observedAt; current.failedUntil = 0
      return {units, observedAt}
    })().catch(() => { current.failedUntil = now() + 10_000; throw unavailable() }).finally(() => { current.pending = undefined })
    const result = await current.pending
    return {...result, units: {...result.units}}
  }
}

export const readBscDisplayBalances = createBscDisplayReader(fetchBscDisplayBalances, async wallet => {
  const runtime = createBscRuntime()
  return Object.fromEntries(await Promise.all(assets.map(async a => [a.symbol, await runtime.balance(a.symbol, wallet as `0x${string}`)]))) as Balances
})

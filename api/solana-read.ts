const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com'
const METHODS = new Set(['getAccountInfo', 'getTokenAccountBalance', 'getSignaturesForAddress', 'getTransaction'])
export class SolanaReadError extends Error {
  constructor(public reason: 'quota' | 'configuration' | 'network' | 'rpc' | 'capacity' | 'scope', public code = -32004) {
    super('Solana read temporarily unavailable.')
  }
}

/** Server-owned read transport. Never used for signing, submission or settlement verification. */
export function createSolanaReadFetch(fetcher: typeof fetch = fetch, now = Date.now, endpoint = () => process.env.SOLANA_RPC_URL?.trim() || PUBLIC_RPC): typeof fetch {
  let cooldownUntil = 0, unavailableUntil = 0, active = 0, windowStart = now(), used = 0
  async function upstream(url: string, init: RequestInit, cost: number) {
    init.signal?.throwIfAborted()
    if (now() - windowStart >= 60_000) { windowStart = now(); used = 0 }
    if (used + cost > 120) throw new SolanaReadError('capacity', -32005)
    used += cost
    let response: Response
    try {
      response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: init.body,
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000), redirect: 'error' })
    } catch { init.signal?.throwIfAborted(); throw new SolanaReadError('network') }
    if (!response.ok) {
      await response.body?.cancel()
      throw new SolanaReadError(response.status === 429 ? 'quota' : response.status >= 500 ? 'network' : 'configuration', response.status === 429 || response.status >= 500 ? -32004 : -32003)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new SolanaReadError('network')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        size += value.byteLength
        if (size > 2_097_152) { await reader.cancel(); throw new SolanaReadError('rpc', -32003) }
        chunks.push(value)
      }
    } catch (error) { init.signal?.throwIfAborted(); if (error instanceof SolanaReadError) throw error; throw new SolanaReadError('network') }
    const text = Buffer.concat(chunks).toString('utf8')
    let data: any
    try { data = JSON.parse(text) } catch { throw new SolanaReadError('rpc', -32003) }
    const results = Array.isArray(data) ? data : [data]
    for (const item of results) {
      if (item?.error) {
        const quota = /quota|rate.limit|compute units|capacity|throughput/i.test(String(item.error.message)) || item.error.code === 429
        throw new SolanaReadError(quota ? 'quota' : 'rpc', quota ? -32004 : -32003)
      }
      if (!item || !Object.hasOwn(item, 'result')) throw new SolanaReadError('rpc', -32003)
    }
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return async (_input, init: RequestInit = {}) => {
    init.signal?.throwIfAborted()
    let payload: any
    try { if (typeof init.body !== 'string' || init.body.length > 65_536) throw Error(); payload = JSON.parse(init.body) } catch { throw new SolanaReadError('scope', -32602) }
    const batch = Array.isArray(payload) ? payload : [payload]
    if (!batch.length || batch.length > 20 || batch.some(item => !item || item.jsonrpc !== '2.0' || !METHODS.has(item.method))) throw new SolanaReadError('scope', -32601)
    if (active >= 8 || unavailableUntil > now()) throw new SolanaReadError('capacity', -32005)
    active++
    try {
      const configured = endpoint(), primary = cooldownUntil > now() ? PUBLIC_RPC : configured
      try { return await upstream(primary, init, batch.length) }
      catch (error) {
        init.signal?.throwIfAborted()
        if (!(error instanceof SolanaReadError) || error.code !== -32004) throw error
        if (primary === PUBLIC_RPC) { unavailableUntil = now() + 15_000; throw error }
        cooldownUntil = now() + 60_000
        console.warn('[solana-read] provider cooldown', { reason: error.reason })
        try { return await upstream(PUBLIC_RPC, init, batch.length) }
        catch (fallbackError) { init.signal?.throwIfAborted(); unavailableUntil = now() + 15_000; throw fallbackError }
      }
    } finally { active-- }
  }
}
export const solanaReadFetch = createSolanaReadFetch()

import type { Request, Response } from 'express'

const NETWORKS = {
  base: { id: 8453, env: 'PRIVATE_RPC_URL', fallback: 'https://mainnet.base.org' },
  arc: { id: 5042, env: 'PRIVATE_RPC_URL_ARC_MAINNET', fallback: 'https://rpc.mainnet.arc.io' },
  arbitrum: { id: 42161, env: 'PRIVATE_RPC_URL_ARB', fallback: 'https://arb1.arbitrum.io/rpc' },
  polygon: { id: 137, env: 'POLYMARKET_RPC_URL', fallback: 'https://polygon-rpc.com' },
} as const
export type ReadNetwork = keyof typeof NETWORKS
const address = (v: unknown) => typeof v === 'string' && /^0x[\da-f]{40}$/i.test(v)
const hash = (v: unknown) => typeof v === 'string' && /^0x[\da-f]{64}$/i.test(v)
const quantity = (v: unknown) => typeof v === 'string' && /^0x[\da-f]{1,16}$/i.test(v)
const block = (v: unknown) => v === 'latest' || v === 'pending' || v === 'safe' || v === 'finalized' || quantity(v)
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const only = (v: Record<string, any>, keys: string[]) => Object.keys(v).every(k => keys.includes(k))
export class ReadRpcError extends Error {
  constructor(public code: number, message: string) { super(message) }
}

/** No URLs, writes, state overrides, batches, filters or unbounded history scans. */
export function validateRead(method: unknown, input: unknown): { method: string; params: any[] } {
  if (typeof method !== 'string' || !Array.isArray(input)) throw new ReadRpcError(-32600, 'Invalid read request.')
  const p = input
  let valid = false
  switch (method) {
    case 'eth_chainId': case 'eth_blockNumber': case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas':
      valid = p.length === 0; break
    case 'eth_getBalance': case 'eth_getCode': case 'eth_getTransactionCount':
      valid = p.length === 2 && address(p[0]) && block(p[1]); break
    case 'eth_getTransactionReceipt': case 'eth_getTransactionByHash':
      valid = p.length === 1 && hash(p[0]); break
    case 'eth_getBlockByNumber':
      valid = p.length === 2 && block(p[0]) && typeof p[1] === 'boolean'; break
    case 'eth_getBlockByHash':
      valid = p.length === 2 && hash(p[0]) && typeof p[1] === 'boolean'; break
    case 'eth_feeHistory':
      valid = p.length === 3 && quantity(p[0]) && BigInt(p[0]) > 0n && BigInt(p[0]) <= 20n && block(p[1]) && Array.isArray(p[2]) && p[2].length <= 5 && p[2].every((v: unknown) => typeof v === 'number' && v >= 0 && v <= 100); break
    case 'eth_call': {
      const tx = p[0]
      valid = p.length === 2 && record(tx) && only(tx, ['to', 'from', 'data', 'gas', 'value']) &&
        (tx.to === undefined || address(tx.to)) && (tx.from === undefined || address(tx.from)) &&
        typeof tx.data === 'string' && /^0x([\da-f]{2})*$/i.test(tx.data) && tx.data.length <= 65_538 &&
        (tx.gas === undefined || (quantity(tx.gas) && BigInt(tx.gas) <= 1_000_000n)) &&
        (tx.value === undefined || (quantity(tx.value) && BigInt(tx.value) === 0n)) && block(p[1])
      if (valid) return { method, params: [{ ...tx, gas: tx.gas ?? '0xf4240' }, p[1]] }
      break
    }
    case 'eth_getLogs': {
      const f = p[0]
      valid = p.length === 1 && record(f) && only(f, ['address', 'topics', 'fromBlock', 'toBlock']) && address(f.address) &&
        quantity(f.fromBlock) && quantity(f.toBlock) && BigInt(f.toBlock) >= BigInt(f.fromBlock) && BigInt(f.toBlock) - BigInt(f.fromBlock) < 2048n &&
        Array.isArray(f.topics) && f.topics.length >= 2 && f.topics.length <= 4 && hash(f.topics[0]) && f.topics.slice(1).some(hash) && f.topics.every((v: unknown) => v === null || hash(v))
      break
    }
    default: throw new ReadRpcError(-32601, 'RPC method is not available on the read endpoint.')
  }
  if (!valid) throw new ReadRpcError(-32602, 'Read parameters exceed the supported scope.')
  return { method, params: p }
}

// Limits are per server process. This endpoint is not a general developer RPC product.
export function createReadService(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { expires: number; result: unknown }>()
  const pending = new Map<string | symbol, Promise<unknown>>()
  const cooldown = new Map<string, number>()
  let windowStart = now(), used = 0
  async function upstream(url: string, method: string, params: any[], signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (now() - windowStart >= 60_000) { windowStart = now(); used = 0 }
    if (++used > 300) throw new ReadRpcError(-32005, 'Read capacity reached. Try again shortly.')
    const response = await fetcher(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    })
    if (response.status === 429 || response.status >= 500) throw new ReadRpcError(-32004, 'Upstream temporarily unavailable.')
    if (!response.ok) throw new ReadRpcError(-32003, 'Upstream configuration unavailable.')
    // Bound allocation even when a provider streams without a content-length.
    const reader = response.body?.getReader()
    if (!reader) throw new ReadRpcError(-32004, 'Empty upstream response.')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 1_048_576) { await reader.cancel(); throw new ReadRpcError(-32004, 'Read response exceeds limit.') }
      chunks.push(value)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (data.error) {
      if (/limit|quota|capacity|throughput/i.test(String(data.error.message))) throw new ReadRpcError(-32004, 'Upstream temporarily unavailable.')
      // Do not expose upstream messages: they may include credentials or URLs.
      const error = new ReadRpcError(Number.isInteger(data.error.code) ? data.error.code : -32000, 'Contract read failed.')
      throw error
    }
    if (!Object.hasOwn(data, 'result')) throw new ReadRpcError(-32004, 'Invalid upstream response.')
    return data.result
  }
  return async (network: ReadNetwork, method: string, params: any[], signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const validated = validateRead(method, params)
    const config = NETWORKS[network]
    if (!config) throw new ReadRpcError(-32602, 'Unsupported network.')
    if (method === 'eth_chainId') return '0x' + config.id.toString(16)
    const key = JSON.stringify([network, validated])
    const hit = cache.get(key)
    if (hit && hit.expires > now()) return hit.result
    // Cancellable scans share work at the wallet level; their abort must not
    // cancel an unrelated checkout read with identical RPC parameters.
    if (!signal && pending.has(key)) return pending.get(key)
    const pendingKey = signal ? Symbol(key) : key
    if (pending.size >= 16) throw new ReadRpcError(-32005, 'Read service busy. Try again shortly.')
    const work = (async () => {
      const configured = process.env[config.env]?.trim() || config.fallback
      const primary = (cooldown.get(network) ?? 0) > now() ? config.fallback : configured
      let result: unknown
      try { result = await upstream(primary, method, validated.params, signal) }
      catch (error) {
        signal?.throwIfAborted()
        if (primary === config.fallback || (error instanceof ReadRpcError && error.code !== -32004)) throw error
        cooldown.set(network, now() + 60_000)
        console.warn('[evm-read] provider cooldown', { network })
        result = await upstream(config.fallback, method, validated.params, signal)
      }
      signal?.throwIfAborted()
      if (cache.size >= 256) cache.delete(cache.keys().next().value!)
      // Never reuse a nonce or an arbitrary contract-state read when preparing signatures.
      const cacheable = method !== 'eth_getTransactionCount' && (method !== 'eth_call' || validated.params[0].data.startsWith('0x70a08231'))
      if (cacheable && JSON.stringify(result).length <= 65_536) cache.set(key, { result, expires: now() + (result === null ? 1_000 : 3_000) })
      return result
    })().finally(() => pending.delete(pendingKey))
    pending.set(pendingKey, work)
    return work
  }
}
export const readEvmRpc = createReadService()

export function createReadHandler(read = readEvmRpc) {
 return async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const body = req.body
  const id = record(body) && (typeof body.id === 'number' || (typeof body.id === 'string' && body.id.length <= 64)) ? body.id : null
  try {
    if (!record(body) || !only(body, ['jsonrpc', 'id', 'method', 'params']) || body.jsonrpc !== '2.0' || id === null || JSON.stringify(body).length > 70_000) throw new ReadRpcError(-32600, 'Invalid read request.')
    const network = String(req.params.network)
    if (!Object.hasOwn(NETWORKS, network)) throw new ReadRpcError(-32602, 'Unsupported network.')
    const result = await read(network as ReadNetwork, body.method, body.params ?? [])
    return res.json({ jsonrpc: '2.0', id, result })
  } catch (error) {
    const safe = error instanceof ReadRpcError ? error : new ReadRpcError(-32004, 'Network read temporarily unavailable.')
    return res.json({ jsonrpc: '2.0', id, error: { code: safe.code, message: safe.message } })
  }
}

}
export default createReadHandler()

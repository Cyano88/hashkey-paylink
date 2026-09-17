/**
 * POST /api/tx-status
 * Probes supported payment networks in parallel for a given tx hash.
 * Returns the first network that reports a result.
 *
 * Body:  { hash: string, network?: 'base' | 'arc' | 'arbitrum' }
 * Response:
 *   { found: false }
 *   { found: true, network, status: 'confirmed'|'pending', explorerName, explorerUrl, estimatedSeconds? }
 */

import type { Request, Response } from 'express'

const NETWORKS = [
  {
    key:         'base',
    name:        'Base',
    rpc:         'https://mainnet.base.org',
    type:        'evm' as const,
    explorerName:'Basescan',
    explorerUrl: (h: string) => `https://basescan.org/tx/${h}`,
    finalitySec: 12,
  },
  {
    key:         'arc',
    name:        'Arc',
    rpc:         'https://rpc.mainnet.arc.io',
    type:        'evm' as const,
    explorerName:'Arcscan',
    explorerUrl: (h: string) => `https://explorer.arc.io/tx/${h}`,
    finalitySec: 2,
  },
  {
    key:         'arbitrum',
    name:        'Arbitrum',
    rpc:         'https://arb1.arbitrum.io/rpc',
    type:        'evm' as const,
    explorerName:'Arbiscan',
    explorerUrl: (h: string) => `https://arbiscan.io/tx/${h}`,
    finalitySec: 12,
  },
]

async function probeEvm(rpc: string, hash: string): Promise<'confirmed' | 'pending' | null> {
  try {
    const r = await fetch(rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }),
      signal:  AbortSignal.timeout(5_000),
    })
    const d = await r.json() as { result?: { blockNumber?: string | null } | null }
    if (!d.result) return null
    return d.result.blockNumber != null ? 'confirmed' : 'pending'
  } catch {
    return null
  }
}

type LookupResult = { found: boolean; network?: string; status?: 'confirmed' | 'pending'; explorerName?: string; explorerUrl?: string; estimatedSeconds?: number }
const lookupCache = new Map<string, { expiresAt: number; pending: Promise<LookupResult> }>()
const LOOKUP_TTL_MS = 2_000
const MAX_LOOKUPS = 256

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const { hash, network } = (req.body ?? {}) as { hash?: unknown; network?: unknown }
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return res.status(400).json({ found: false, error: 'Invalid hash format' })
  }
  if (network !== undefined && (typeof network !== 'string' || !NETWORKS.some(net => net.key === network))) {
    return res.status(400).json({ found: false, error: 'Unsupported network' })
  }
  const key = String(network ?? 'all') + ':' + hash.toLowerCase()
  let entry = lookupCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    if (lookupCache.size >= MAX_LOOKUPS) lookupCache.delete(lookupCache.keys().next().value as string)
    const networks = network ? NETWORKS.filter(net => net.key === network) : NETWORKS
    const pending = Promise.all(networks.map(async net => ({ net, status: await probeEvm(net.rpc, hash) })))
      .then((results): LookupResult => {
        const hit = results.find(result => result.status !== null)
        if (!hit) return { found: false }
        return {
          found: true,
          network: hit.net.name,
          status: hit.status!,
          explorerName: hit.net.explorerName,
          explorerUrl: hit.net.explorerUrl(hash),
          estimatedSeconds: hit.status === 'pending' ? hit.net.finalitySec : undefined,
        }
      })
    entry = { expiresAt: Infinity, pending }
    lookupCache.set(key, entry)
    const created = entry
    void pending.then(result => {
      if (lookupCache.get(key) !== created) return
      // Do not cache misses or upstream failures; allow the next request to retry.
      if (!result.found) lookupCache.delete(key)
      else created.expiresAt = Date.now() + LOOKUP_TTL_MS
    })
  }
  return res.json(await entry.pending)
}

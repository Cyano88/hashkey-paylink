/**
 * POST /api/tx-status
 * Probes Base, HashKey, Arc, and Starknet in parallel for a given tx hash.
 * Returns the first network that reports a result.
 *
 * Body:  { hash: string }
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
    key:         'hashkey',
    name:        'HashKey',
    rpc:         'https://mainnet.hsk.xyz',
    type:        'evm' as const,
    explorerName:'HashKey Explorer',
    explorerUrl: (h: string) => `https://explorer.hsk.xyz/tx/${h}`,
    finalitySec: 3,
  },
  {
    key:         'arc',
    name:        'Arc',
    rpc:         'https://rpc.testnet.arc.network',
    type:        'evm' as const,
    explorerName:'Arcscan',
    explorerUrl: (h: string) => `https://testnet.arcscan.app/tx/${h}`,
    finalitySec: 2,
  },
  {
    key:         'starknet',
    name:        'Starknet',
    rpc:         'https://rpc.starknet.lava.build',
    type:        'stark' as const,
    explorerName:'Starkscan',
    explorerUrl: (h: string) => `https://starkscan.co/tx/${h}`,
    finalitySec: 30,
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

async function probeStark(rpc: string, hash: string): Promise<'confirmed' | 'pending' | null> {
  try {
    const r = await fetch(rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_getTransactionStatus', params: [hash] }),
      signal:  AbortSignal.timeout(5_000),
    })
    const d = await r.json() as { result?: { finality_status?: string } | null; error?: unknown }
    if (!d.result || d.error) return null
    const s = d.result.finality_status ?? ''
    if (s === 'ACCEPTED_ON_L2' || s === 'ACCEPTED_ON_L1') return 'confirmed'
    if (s === 'RECEIVED') return 'pending'
    return null
  } catch {
    return null
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const { hash } = (req.body ?? {}) as { hash?: string }
  if (!hash || !/^0x[0-9a-fA-F]{1,64}$/.test(hash)) {
    return res.status(400).json({ found: false, error: 'Invalid hash format' })
  }

  const results = await Promise.all(
    NETWORKS.map(async (net) => ({
      net,
      status: net.type === 'evm'
        ? await probeEvm(net.rpc, hash)
        : await probeStark(net.rpc, hash),
    })),
  )

  const hit = results.find(r => r.status !== null)
  if (!hit) return res.json({ found: false })

  return res.json({
    found:           true,
    network:         hit.net.name,
    status:          hit.status,
    explorerName:    hit.net.explorerName,
    explorerUrl:     hit.net.explorerUrl(hash),
    estimatedSeconds: hit.status === 'pending' ? hit.net.finalitySec : undefined,
  })
}

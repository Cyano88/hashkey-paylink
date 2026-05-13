/**
 * /api/store-content  POST - creator uploads content/URL before sharing gate link
 * /api/get-content    GET  - viewer fetches after USDC approval is verified on Arc
 *
 * Storage: in-memory Map. For production replace with Redis or Postgres.
 */

import type { Request, Response } from 'express'
import {
  createPublicClient, http, defineChain,
  parseAbi, isAddress,
} from 'viem'

const arcChain = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const arcClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network'),
})

const ARC_USDC = '0x3600000000000000000000000000000000000000' as const
const ALLOW_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
])

type ContentEntry = {
  type: 'text' | 'url'
  content: string
  creator: string
  capRaw: number
  ts: number
}

const store = new Map<string, ContentEntry>()
const MAX_CONTENT_ID_LENGTH = 128
const MAX_CONTENT_LENGTH = 100_000

export async function storeContent(req: Request, res: Response) {
  const { contentId, creator, type, content, capRaw } = (req.body ?? {}) as {
    contentId?: string
    creator?: string
    type?: string
    content?: string
    capRaw?: number
  }

  if (!contentId || !creator || !type || !content) {
    return res.status(400).json({ ok: false, error: 'contentId, creator, type, content are required' })
  }
  if (contentId.length > MAX_CONTENT_ID_LENGTH || content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ ok: false, error: 'contentId or content is too large' })
  }
  if (type !== 'text' && type !== 'url') {
    return res.status(400).json({ ok: false, error: 'type must be "text" or "url"' })
  }
  if (!isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }

  const existing = store.get(contentId)
  if (existing && existing.creator.toLowerCase() !== creator.toLowerCase()) {
    return res.status(409).json({ ok: false, error: 'contentId is already registered' })
  }

  store.set(contentId, {
    type,
    content,
    creator,
    capRaw: Math.max(0, Number(capRaw) || 0),
    ts: Date.now(),
  })

  return res.status(200).json({ ok: true })
}

export async function getContent(req: Request, res: Response) {
  const { id, viewer } = req.query as { id?: string; viewer?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
  if (!viewer || !isAddress(viewer)) {
    return res.status(400).json({ ok: false, error: 'viewer must be a valid EVM address' })
  }

  const entry = store.get(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }

  const poaContract = process.env.ARC_POA_CONTRACT
  if (!poaContract || !isAddress(poaContract)) {
    return res.status(503).json({ ok: false, error: 'Content gate is not configured' })
  }

  try {
    const allowance = await arcClient.readContract({
      address: ARC_USDC,
      abi: ALLOW_ABI,
      functionName: 'allowance',
      args: [viewer as `0x${string}`, poaContract as `0x${string}`],
    }) as bigint

    if (allowance < BigInt(entry.capRaw)) {
      return res.status(403).json({
        ok: false,
        error: 'USDC spending is not approved. Complete the gate first.',
      })
    }
  } catch {
    return res.status(503).json({ ok: false, error: 'Content gate verification unavailable' })
  }

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content })
}

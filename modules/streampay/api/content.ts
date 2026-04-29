/**
 * /api/store-content  POST  — creator uploads content/URL before sharing gate link
 * /api/get-content    GET   — viewer fetches after USDC approval verified on Arc
 *
 * Storage: in-memory Map — data survives for the lifetime of the server process.
 * For production replace with Redis or Postgres (Render add-ons).
 *
 * Authorization model: the server reads USDC.allowance(viewer, POA_CONTRACT) on
 * Arc. If the viewer has approved at least capRaw USDC, the content is returned.
 * This means the viewer CANNOT retrieve the content before completing Step 4.
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

const ARC_USDC  = '0x3600000000000000000000000000000000000000' as const
const ALLOW_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
])

// ── In-memory store ───────────────────────────────────────────────────────────
type ContentEntry = {
  type:    'text' | 'url'
  content: string   // article text OR private URL
  creator: string
  capRaw:  number   // minimum USDC allowance required (6-decimal raw)
  ts:      number
}

const store = new Map<string, ContentEntry>()

// ── POST /api/store-content ───────────────────────────────────────────────────
export async function storeContent(req: Request, res: Response) {
  const { contentId, creator, type, content, capRaw } = (req.body ?? {}) as {
    contentId?: string
    creator?:   string
    type?:      string
    content?:   string
    capRaw?:    number
  }

  if (!contentId || !creator || !type || !content) {
    return res.status(400).json({ ok: false, error: 'contentId, creator, type, content are required' })
  }
  if (type !== 'text' && type !== 'url') {
    return res.status(400).json({ ok: false, error: 'type must be "text" or "url"' })
  }
  if (!isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }

  store.set(contentId, {
    type:    type as 'text' | 'url',
    content,
    creator,
    capRaw:  Number(capRaw) || 0,
    ts:      Date.now(),
  })

  return res.status(200).json({ ok: true })
}

// ── GET /api/get-content ──────────────────────────────────────────────────────
export async function getContent(req: Request, res: Response) {
  const { id, viewer } = req.query as { id?: string; viewer?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const entry = store.get(id)
  if (!entry) {
    return res.status(404).json({
      ok:    false,
      error: 'Content not found — the server may have restarted. Ask the creator to re-generate the link.',
    })
  }

  // Verify viewer has USDC approval >= capRaw on Arc
  const poaContract = process.env.ARC_POA_CONTRACT
  if (poaContract && isAddress(poaContract) && viewer && isAddress(viewer)) {
    try {
      const allowance = await arcClient.readContract({
        address:      ARC_USDC,
        abi:          ALLOW_ABI,
        functionName: 'allowance',
        args:         [viewer as `0x${string}`, poaContract as `0x${string}`],
      }) as bigint

      if (allowance < BigInt(entry.capRaw)) {
        return res.status(403).json({
          ok:    false,
          error: 'USDC spending not approved — complete Step 4 of the gate first',
        })
      }
    } catch {
      // Arc RPC error — allow through rather than blocking a legitimate viewer
    }
  }

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content })
}

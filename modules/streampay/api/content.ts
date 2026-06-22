/**
 * /api/store-content  POST - creator uploads content/URL before sharing gate link
 * /api/get-content    GET  - viewer fetches after USDC approval is verified on Arc
 *
 * Storage: in-memory Map. For production replace with Redis or Postgres.
 */

import type { Request, Response } from 'express'
import pg from 'pg'
import {
  createPublicClient, http, defineChain,
  parseAbi, isAddress, keccak256, toBytes, verifyMessage, verifyTypedData, hashTypedData,
  type Address, type Hex,
} from 'viem'
import type { NextFunction } from 'express'

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
const ERC1271_ABI = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])
const ERC1271_MAGIC_VALUE = '0x1626ba7e'

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
const MAX_CREATOR_PROOF_AGE_MS = 10 * 60 * 1000
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const CREATOR_X402_NETWORKS = (process.env.X402_CREATOR_ACCEPT_NETWORKS ?? 'eip155:5042002')
  .split(',')
  .map(network => network.trim())
  .filter(Boolean)
const CREATOR_X402_FACILITATOR_URL = process.env.X402_CREATOR_FACILITATOR_URL?.trim()
  || process.env.X402_FACILITATOR_URL?.trim()
  || 'https://gateway-api-testnet.circle.com'

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

const gatewayCache = new Map<string, (req: Request, res: Response, next: NextFunction) => void | Promise<void>>()
const CREATOR_PROOF_TYPES = {
  CreatorContent: [
    { name: 'contentId', type: 'string' },
    { name: 'creator', type: 'address' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'capRaw', type: 'uint256' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const
const { Pool } = pg
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function ensureSchema() {
  if (!pool) return Promise.resolve()
  if (!schemaReady) {
    schemaReady = pool.query(`
      create table if not exists streampay_creator_content (
        content_id text primary key,
        creator text not null,
        type text not null,
        content text not null,
        cap_raw integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_content_creator_idx on streampay_creator_content (creator);
    `).then(() => undefined)
  }
  return schemaReady
}

function rowToContentEntry(row: Record<string, unknown>): ContentEntry {
  return {
    type: String(row.type) === 'url' ? 'url' : 'text',
    content: String(row.content ?? ''),
    creator: String(row.creator ?? ''),
    capRaw: Number(row.cap_raw ?? 0),
    ts: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  }
}

async function readContentEntry(contentId: string): Promise<ContentEntry | null> {
  if (pool) {
    await ensureSchema()
    const result = await pool.query('select * from streampay_creator_content where content_id = $1 limit 1', [contentId])
    if (!result.rowCount) return null
    return rowToContentEntry(result.rows[0])
  }
  return store.get(contentId) ?? null
}

async function writeContentEntry(contentId: string, entry: ContentEntry) {
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_creator_content (content_id, creator, type, content, cap_raw, created_at, updated_at)
       values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), now())
       on conflict (content_id) do update set
         creator = excluded.creator,
         type = excluded.type,
         content = excluded.content,
         cap_raw = excluded.cap_raw,
         updated_at = now()`,
      [contentId, entry.creator, entry.type, entry.content, entry.capRaw, entry.ts],
    )
    return
  }
  store.set(contentId, entry)
}

function creatorPrice(entry: ContentEntry) {
  const raw = Math.max(1, Math.round(Number(entry.capRaw) || 0))
  return `$${(raw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
}

function isHexSignature(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{130}$/.test(value)
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function creatorProofMessage(params: {
  contentId: string
  creator: string
  contentHash: string
  capRaw: number
  issuedAt: number
}) {
  return [
    'Create a Hash PayLink Creator Studio gate',
    '',
    `Content ID: ${shortId(params.contentId)}`,
    `Creator wallet: ${params.creator}`,
    `Price: ${(params.capRaw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} USDC`,
    'Network: Arc Testnet',
    '',
    'This signature proves you control the creator wallet.',
    'It does not move funds or approve spending.',
    '',
    `Content hash: ${params.contentHash}`,
    `Issued at: ${params.issuedAt}`,
  ].join('\n')
}

async function verifyCreatorProof(params: {
  contentId: string
  creator: Address
  content: string
  capRaw: number
  issuedAt: number
  signature: Hex
  proofType: 'message' | 'typedData'
}) {
  const age = Math.abs(Date.now() - params.issuedAt)
  if (!Number.isFinite(params.issuedAt) || age > MAX_CREATOR_PROOF_AGE_MS) return false
  const contentHash = keccak256(toBytes(params.content))

  if (params.proofType === 'message') {
    return verifyMessage({
      address: params.creator,
      message: creatorProofMessage({
        contentId: params.contentId,
        creator: params.creator,
        contentHash,
        capRaw: params.capRaw,
        issuedAt: params.issuedAt,
      }),
      signature: params.signature,
    })
  }

  const typedData = {
    address: params.creator,
    domain: {
      name: 'Hash PayLink Creator Studio',
      version: '1',
      chainId: 5042002,
      verifyingContract: params.creator,
    },
    types: CREATOR_PROOF_TYPES,
    primaryType: 'CreatorContent',
    message: {
      contentId: params.contentId,
      creator: params.creator,
      contentHash,
      capRaw: BigInt(params.capRaw),
      issuedAt: BigInt(params.issuedAt),
    },
    signature: params.signature,
  } as const
  const eoaValid = await verifyTypedData(typedData)
  if (eoaValid) return true

  const bytecode = await arcClient.getBytecode({ address: params.creator }).catch(() => undefined)
  if (!bytecode || bytecode === '0x') return false

  const digest = hashTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
  const magic = await arcClient.readContract({
    address: params.creator,
    abi: ERC1271_ABI,
    functionName: 'isValidSignature',
    args: [digest, params.signature],
  }).catch(() => null)
  return typeof magic === 'string' && magic.toLowerCase() === ERC1271_MAGIC_VALUE
}

async function creatorGatewayMiddleware(entry: ContentEntry) {
  const price = creatorPrice(entry)
  const cacheKey = `${entry.creator.toLowerCase()}:${price}:${CREATOR_X402_NETWORKS.join(',')}:${CREATOR_X402_FACILITATOR_URL}`
  const cached = gatewayCache.get(cacheKey)
  if (cached) return cached

  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
  const gateway = createGatewayMiddleware({
    sellerAddress: entry.creator,
    networks: CREATOR_X402_NETWORKS,
    facilitatorUrl: CREATOR_X402_FACILITATOR_URL,
    description: 'Hash PayLink Creator Studio content access',
  })
  const middleware = gateway.require(price)
  gatewayCache.set(cacheKey, middleware)
  return middleware
}

export async function storeContent(req: Request, res: Response) {
  const { contentId, creator, type, content, capRaw, issuedAt, signature, proofType } = (req.body ?? {}) as {
    contentId?: string
    creator?: string
    type?: string
    content?: string
    capRaw?: number
    issuedAt?: number
    signature?: string
    proofType?: string
  }

  if (!contentId || !creator || !type || !content || !issuedAt || !signature) {
    return res.status(400).json({ ok: false, error: 'contentId, creator, type, content, issuedAt, and signature are required' })
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
  const safeCapRaw = Math.max(0, Number(capRaw) || 0)
  if (!isHexSignature(signature)) {
    return res.status(400).json({ ok: false, error: 'creator signature is invalid' })
  }
  const creatorVerified = await verifyCreatorProof({
    contentId,
    creator,
    content,
    capRaw: safeCapRaw,
    issuedAt: Number(issuedAt),
    signature,
    proofType: proofType === 'typedData' ? 'typedData' : 'message',
  }).catch(() => false)
  if (!creatorVerified) {
    return res.status(401).json({ ok: false, error: 'Creator wallet proof failed. Sign again and retry.' })
  }

  const existing = await readContentEntry(contentId)
  if (existing && existing.creator.toLowerCase() !== creator.toLowerCase()) {
    return res.status(409).json({ ok: false, error: 'contentId is already registered' })
  }

  await writeContentEntry(contentId, {
    type,
    content,
    creator,
    capRaw: safeCapRaw,
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

  const entry = await readContentEntry(id)
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

export async function getContentX402(req: PaidRequest, res: Response) {
  const { id } = req.query as { id?: string }
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }

  const middleware = await creatorGatewayMiddleware(entry)
  return middleware(req, res, () => {
    return res.status(200).json({
      ok: true,
      type: entry.type,
      content: entry.content,
      payment: req.payment ?? null,
    })
  })
}

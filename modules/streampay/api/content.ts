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
import { payAgentX402Service } from '../../../api/agent-wallet.js'
import { getPolyWorldcupNewsFeed, polyWorldcupArticleId } from '../../../api/poly-worldcup-news.js'

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
  type: 'text' | 'url' | 'scores'
  content: string
  creator: string
  capRaw: number
  rateRaw: number
  mode: 'unlock' | 'stream'
  title: string
  description: string
  authorName: string
  xHandle: string
  coverImage: string
  category: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedAt: number | null
  reviewNote: string
  ts: number
}

const store = new Map<string, ContentEntry>()
const MAX_CONTENT_ID_LENGTH = 128
const MAX_CONTENT_LENGTH = 100_000
const MAX_META_TEXT_LENGTH = 2_000
const MAX_CREATOR_PROOF_AGE_MS = 10 * 60 * 1000
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const CREATOR_X402_NETWORKS = (process.env.X402_CREATOR_ACCEPT_NETWORKS ?? 'eip155:5042002')
  .split(',')
  .map(network => network.trim())
  .filter(Boolean)
const CREATOR_X402_FACILITATOR_URL = process.env.X402_CREATOR_FACILITATOR_URL?.trim()
  || process.env.X402_FACILITATOR_URL?.trim()
  || 'https://gateway-api-testnet.circle.com'
const CREATOR_AGENT_X402_PAY_CHAIN = process.env.CREATOR_AGENT_X402_PAY_CHAIN?.trim() || 'ARC-TESTNET'
const CREATOR_ADMIN_KEY = (process.env.CREATOR_ADMIN_KEY ?? '').trim()

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

type CreatorUnlockResponse = {
  ok?: boolean
  type?: 'text' | 'url' | 'scores'
  content?: string
  payment?: PaidRequest['payment'] | null
  error?: string
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

const OFFICIAL_CREATOR_ADDRESS = (
  process.env.CREATOR_OFFICIAL_WALLET
  ?? process.env.DEFAULT_AGENT_WALLET_ADDRESS
  ?? process.env.TREASURY_ADDRESS
  ?? '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'
).trim()
const OFFICIAL_WORLD_CUP_NEWS_URL = (
  process.env.CREATOR_WORLD_CUP_NEWS_URL
  ?? 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026'
).trim()
const SAFE_OFFICIAL_CREATOR = isAddress(OFFICIAL_CREATOR_ADDRESS)
  ? OFFICIAL_CREATOR_ADDRESS
  : '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'

const OFFICIAL_CONTENT: Record<string, ContentEntry> = {
  'worldcup-news': {
    type: 'url',
    content: OFFICIAL_WORLD_CUP_NEWS_URL,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_NEWS_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'World Cup News Pulse',
    description: 'Paid tournament context and market-moving headlines for readers who want the full source.',
    authorName: 'Hash PayLink Pulse',
    xHandle: 'Hash_PayLink',
    coverImage: '/brand/world-globe.png',
    category: 'worldcup-news',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  },
  'worldcup-scores': {
    type: 'scores',
    content: 'worldcup-scores',
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_SCORES_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'World Cup Scores',
    description: 'Live World Cup scores with exact Polymarket market routes when a fixture is confidently matched.',
    authorName: 'Hash PayLink desk',
    xHandle: 'Hash_PayLink',
    coverImage: '/brand/world-globe.png',
    category: 'live-scores',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  },
}

async function readOfficialWorldCupNewsEntry(contentId: string): Promise<ContentEntry | null> {
  if (!contentId.startsWith('worldcup-news-')) return null
  const feed = await getPolyWorldcupNewsFeed().catch(() => null)
  const articles = feed?.articles ?? []
  const match = articles.find((article, index) => polyWorldcupArticleId(article, index) === contentId)
  if (!match?.url) return null
  return {
    type: 'url',
    content: match.url,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_NEWS_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: match.title,
    description: match.description,
    authorName: match.source || 'Hash PayLink Pulse',
    xHandle: 'Hash_PayLink',
    coverImage: match.image || '/brand/world-globe.png',
    category: 'worldcup-news',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  }
}
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
        rate_raw integer not null default 0,
        mode text not null default 'unlock',
        title text not null default '',
        description text not null default '',
        author_name text not null default '',
        x_handle text not null default '',
        cover_image text not null default '',
        category text not null default 'crypto',
        review_status text not null default 'pending',
        reviewed_at timestamptz,
        review_note text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_content_creator_idx on streampay_creator_content (creator);
      alter table streampay_creator_content add column if not exists rate_raw integer not null default 0;
      alter table streampay_creator_content add column if not exists mode text not null default 'unlock';
      alter table streampay_creator_content add column if not exists title text not null default '';
      alter table streampay_creator_content add column if not exists description text not null default '';
      alter table streampay_creator_content add column if not exists author_name text not null default '';
      alter table streampay_creator_content add column if not exists x_handle text not null default '';
      alter table streampay_creator_content add column if not exists cover_image text not null default '';
      alter table streampay_creator_content add column if not exists category text not null default 'crypto';
      alter table streampay_creator_content add column if not exists review_status text not null default 'pending';
      alter table streampay_creator_content add column if not exists reviewed_at timestamptz;
      alter table streampay_creator_content add column if not exists review_note text not null default '';
      create index if not exists streampay_creator_content_review_idx on streampay_creator_content (review_status, updated_at desc);
    `).then(() => undefined)
  }
  return schemaReady
}

function cleanReviewStatus(value: unknown): ContentEntry['reviewStatus'] {
  const status = String(value ?? 'pending').trim().toLowerCase()
  return status === 'approved' || status === 'rejected' ? status : 'pending'
}

function rowToContentEntry(row: Record<string, unknown>): ContentEntry {
  return {
    type: String(row.type) === 'url' ? 'url' : 'text',
    content: String(row.content ?? ''),
    creator: String(row.creator ?? ''),
    capRaw: Number(row.cap_raw ?? 0),
    rateRaw: Number(row.rate_raw ?? 0),
    mode: String(row.mode) === 'stream' ? 'stream' : 'unlock',
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    authorName: String(row.author_name ?? ''),
    xHandle: String(row.x_handle ?? ''),
    coverImage: String(row.cover_image ?? ''),
    category: String(row.category ?? 'crypto'),
    reviewStatus: cleanReviewStatus(row.review_status),
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.getTime() : null,
    reviewNote: String(row.review_note ?? ''),
    ts: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  }
}

async function readContentEntry(contentId: string): Promise<ContentEntry | null> {
  if (OFFICIAL_CONTENT[contentId]) return OFFICIAL_CONTENT[contentId]
  const officialNews = await readOfficialWorldCupNewsEntry(contentId)
  if (officialNews) return officialNews
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
      `insert into streampay_creator_content (
         content_id, creator, type, content, cap_raw, rate_raw, mode,
         title, description, author_name, x_handle, cover_image, category,
         review_status, reviewed_at, review_note,
         created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, to_timestamp($17 / 1000.0), now())
       on conflict (content_id) do update set
         creator = excluded.creator,
         type = excluded.type,
         content = excluded.content,
         cap_raw = excluded.cap_raw,
         rate_raw = excluded.rate_raw,
         mode = excluded.mode,
         title = excluded.title,
         description = excluded.description,
         author_name = excluded.author_name,
         x_handle = excluded.x_handle,
         cover_image = excluded.cover_image,
         category = excluded.category,
         review_status = excluded.review_status,
         reviewed_at = excluded.reviewed_at,
         review_note = excluded.review_note,
         updated_at = now()`,
      [
        contentId,
        entry.creator,
        entry.type,
        entry.content,
        entry.capRaw,
        entry.rateRaw,
        entry.mode,
        entry.title,
        entry.description,
        entry.authorName,
        entry.xHandle,
        entry.coverImage,
        entry.category,
        entry.reviewStatus,
        entry.reviewedAt ? new Date(entry.reviewedAt) : null,
        entry.reviewNote,
        entry.ts,
      ],
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

function normalizeAgentSlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function cleanMetaText(value: unknown, max = MAX_META_TEXT_LENGTH) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanCategory(value: unknown) {
  const category = String(value ?? 'crypto').trim().toLowerCase()
  if (category === 'news') return 'worldcup-news'
  if (category === 'sports') return 'live-scores'
  if (category === 'general') return 'crypto'
  return ['worldcup-news', 'live-scores', 'ebooks', 'crypto'].includes(category) ? category : 'crypto'
}

function baseUrl() {
  return (process.env.HASH_PAYLINK_BASE_URL ?? process.env.PUBLIC_APP_URL ?? 'https://hashpaylink.com').replace(/\/+$/, '')
}

function buildGateLink(params: {
  contentId: string
  creator: string
  rateRaw: number
  capRaw: number
  title: string
  mode: 'unlock' | 'stream'
}) {
  const p = new URLSearchParams()
  p.set('app', 'streampay')
  p.set('id', params.contentId)
  p.set('cr', params.creator)
  p.set('r', String(params.rateRaw))
  p.set('cap', String(params.capRaw))
  p.set('mode', params.mode)
  if (params.title.trim()) p.set('t', params.title.trim())
  return `${baseUrl()}/gate?${p.toString()}`
}

function entryToPost(contentId: string, entry: ContentEntry) {
  return {
    id: contentId,
    contentId,
    creator: entry.creator,
    title: entry.title,
    description: entry.description,
    authorName: entry.authorName,
    xHandle: entry.xHandle,
    coverImage: entry.coverImage,
    category: entry.category,
    reviewStatus: entry.reviewStatus,
    reviewedAt: entry.reviewedAt,
    reviewNote: entry.reviewNote,
    type: entry.type,
    mode: entry.mode,
    capRaw: entry.capRaw,
    rateRaw: entry.rateRaw,
    createdAt: entry.ts,
    gateLink: buildGateLink({
      contentId,
      creator: entry.creator,
      rateRaw: entry.rateRaw,
      capRaw: entry.capRaw,
      title: entry.title,
      mode: entry.mode,
    }),
  }
}

function requireCreatorAdmin(req: Request, res: Response) {
  if (!CREATOR_ADMIN_KEY) {
    res.status(503).json({ ok: false, error: 'Creator admin approval is not configured.' })
    return false
  }
  const headerKey = String(req.headers['x-creator-admin-key'] ?? '').trim()
  const bodyKey = String((req.body as { adminKey?: unknown } | undefined)?.adminKey ?? '').trim()
  const queryKey = String((req.query as { adminKey?: string }).adminKey ?? '').trim()
  if (headerKey !== CREATOR_ADMIN_KEY && bodyKey !== CREATOR_ADMIN_KEY && queryKey !== CREATOR_ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Admin approval key is invalid.' })
    return false
  }
  return true
}

function creatorProofMessage(params: {
  contentId: string
  creator: string
  contentHash: string
  capRaw: number
  issuedAt: number
}) {
  return [
    'Publish Hash PayLink Creator Studio content',
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
  const {
    contentId,
    creator,
    type,
    content,
    capRaw,
    rateRaw,
    mode,
    title,
    description,
    authorName,
    xHandle,
    coverImage,
    category,
    issuedAt,
    signature,
    proofType,
  } = (req.body ?? {}) as {
    contentId?: string
    creator?: string
    type?: string
    content?: string
    capRaw?: number
    rateRaw?: number
    mode?: string
    title?: string
    description?: string
    authorName?: string
    xHandle?: string
    coverImage?: string
    category?: string
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
  const safeRateRaw = Math.max(0, Number(rateRaw) || 0)
  const safeMode = mode === 'stream' ? 'stream' : 'unlock'
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
    rateRaw: safeRateRaw,
    mode: safeMode,
    title: cleanMetaText(title, 100),
    description: cleanMetaText(description, 180),
    authorName: cleanMetaText(authorName, 80),
    xHandle: cleanMetaText(xHandle, 40).replace(/^@+/, ''),
    coverImage: String(coverImage ?? '').trim().slice(0, 120_000),
    category: cleanCategory(category),
    reviewStatus: existing?.reviewStatus ?? 'pending',
    reviewedAt: existing?.reviewedAt ?? null,
    reviewNote: existing?.reviewNote ?? '',
    ts: Date.now(),
  })

  return res.status(200).json({ ok: true, reviewStatus: existing?.reviewStatus ?? 'pending' })
}

export async function listCreatorContent(req: Request, res: Response) {
  const { creator } = req.query as { creator?: string }
  if (!creator || !isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }

  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      'select * from streampay_creator_content where lower(creator) = lower($1) order by updated_at desc limit 50',
      [creator],
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.creator.toLowerCase() === creator.toLowerCase())
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 50)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

export async function listApprovedCreatorContent(_req: Request, res: Response) {
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_creator_content
       where review_status = 'approved'
       order by coalesce(reviewed_at, updated_at) desc, updated_at desc
       limit 50`,
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.reviewStatus === 'approved')
    .sort((a, b) => (b[1].reviewedAt ?? b[1].ts) - (a[1].reviewedAt ?? a[1].ts))
    .slice(0, 50)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

export async function listCreatorAdminContent(req: Request, res: Response) {
  if (!requireCreatorAdmin(req, res)) return
  const status = cleanReviewStatus((req.query as { status?: string }).status || 'pending')

  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_creator_content
       where review_status = $1
       order by updated_at desc
       limit 100`,
      [status],
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.reviewStatus === status)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 100)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

export async function reviewCreatorContent(req: Request, res: Response) {
  if (!requireCreatorAdmin(req, res)) return
  const { contentId, action, note } = (req.body ?? {}) as {
    contentId?: string
    action?: string
    note?: string
  }
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH) {
    return res.status(400).json({ ok: false, error: 'contentId is required.' })
  }
  const reviewStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null
  if (!reviewStatus) {
    return res.status(400).json({ ok: false, error: 'action must be approve or reject.' })
  }

  const existing = await readContentEntry(contentId)
  if (!existing) return res.status(404).json({ ok: false, error: 'Content not found.' })
  const updated: ContentEntry = {
    ...existing,
    reviewStatus,
    reviewedAt: Date.now(),
    reviewNote: cleanMetaText(note, 240),
    ts: Date.now(),
  }
  await writeContentEntry(contentId, updated)
  return res.status(200).json({ ok: true, post: entryToPost(contentId, updated) })
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

export async function unlockContentX402WithAgent(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const { contentId, agentSlug } = (req.body ?? {}) as { contentId?: string; agentSlug?: string }
  const safeAgentSlug = normalizeAgentSlug(agentSlug)

  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH) {
    return res.status(400).json({ ok: false, error: 'Valid content ID is required.' })
  }
  if (!safeAgentSlug) {
    return res.status(400).json({ ok: false, error: 'Choose an agent wallet before unlocking.' })
  }

  const entry = await readContentEntry(contentId)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }

  const maxAmount = Math.max(0.000001, Math.ceil(Math.max(1, Number(entry.capRaw) || 0)) / 1_000_000)
  const serviceUrl = `${baseUrl()}/api/get-content-x402?id=${encodeURIComponent(contentId)}`

  try {
    const paid = await payAgentX402Service({
      agentSlug: safeAgentSlug,
      sellerAgentSlug: '',
      serviceUrl,
      maxAmount,
      paymentChain: CREATOR_AGENT_X402_PAY_CHAIN,
      spendTitle: 'Unlocked creator content',
      spendDetail: `Paid ${maxAmount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} USDC to unlock ${shortId(contentId)}`,
      resultTitle: 'Creator content unlocked',
      resultDetail: entry.type === 'url' ? 'Private link revealed after x402 payment' : 'Article revealed after x402 payment',
      result: { contentId, type: entry.type, creator: entry.creator },
      appendResultActivity: true,
    })
    const response = paid.response as CreatorUnlockResponse | undefined
    if (response?.ok === false) {
      return res.status(502).json({ ok: false, error: response.error ?? 'Creator content service rejected the payment.' })
    }

    return res.status(200).json({
      ok: true,
      type: response?.type ?? entry.type,
      content: response?.content ?? entry.content,
      payment: response?.payment ?? null,
      walletAddress: paid.walletAddress,
    })
  } catch (err) {
    const error = err as Error & { status?: number; code?: string }
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502
    return res.status(status).json({
      ok: false,
      code: error.code,
      error: error.message || 'Circle Gateway payment failed.',
    })
  }
}

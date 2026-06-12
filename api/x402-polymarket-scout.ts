import type { NextFunction, Request, Response } from 'express'
import { formatUnits } from 'viem'

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

const SELLER_ADDRESS = process.env.X402_SELLER_ADDRESS ?? process.env.TREASURY_ADDRESS
const PRICE = process.env.X402_POLYMARKET_SCOUT_PRICE ?? '$0.01'
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL?.trim()
const REQUEST_TIMEOUT_MS = 12_000
const ACCEPT_NETWORKS = process.env.X402_ACCEPT_NETWORKS
  ?.split(',')
  .map(network => network.trim())
  .filter(Boolean)

let gatewayMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | undefined

type PolymarketRewardMarket = Record<string, unknown>

type PolymarketBookLevel = {
  price?: string | number
  size?: string | number
}

type PolymarketBookResponse = {
  bids?: PolymarketBookLevel[]
  asks?: PolymarketBookLevel[]
}

type PolymarketBookSummary = {
  bestBid?: number
  bestAsk?: number
  midpoint?: number
  spread?: number
  bidDepth?: number
  askDepth?: number
  depthAtTwoCents?: number
}

type ScoutMode = 'best' | 'theme' | 'market'

type ScoutOptions = {
  mode: ScoutMode
  context?: string
  budget?: string
}

type PolymarketLpOpportunity = {
  title: string
  slug?: string
  tokenId?: string
  endDate?: string
  daysToResolve?: number
  oneDayPriceChange?: number
  dailyReward?: number
  maxSpread?: number
  minSize?: number
  liquidity?: number
  bestBid?: number
  bestAsk?: number
  midpoint?: number
  spread?: number
  bidDepth?: number
  askDepth?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  eligible?: boolean
  sourceUrl?: string
  executionPlan?: string[]
  lpExecutionRisk: 'low' | 'medium' | 'high'
  outcomeRisk: 'medium' | 'high'
  score: number
  marketUrl?: string
  scoutReason?: string
}

async function getGatewayMiddleware() {
  if (!SELLER_ADDRESS) throw new Error('X402_SELLER_ADDRESS or TREASURY_ADDRESS is required')
  if (!gatewayMiddleware) {
    const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
    const gateway = createGatewayMiddleware({
      sellerAddress: SELLER_ADDRESS,
      ...(FACILITATOR_URL ? { facilitatorUrl: FACILITATOR_URL } : {}),
      ...(ACCEPT_NETWORKS?.length ? { networks: ACCEPT_NETWORKS } : {}),
      description: 'Hash PayLink Polymarket LP Scout x402 API',
    })
    gatewayMiddleware = gateway.require(PRICE)
  }
  return gatewayMiddleware
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPolymarketJson(url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'HashPayLinkX402Scout/0.1',
        },
      })
      if (!response.ok) return null
      return await response.json() as unknown
    } catch (err) {
      lastError = err
      await sleep(250 * (attempt + 1))
    }
  }
  console.warn('[x402-polymarket-scout] request failed:', lastError instanceof Error ? lastError.message : String(lastError))
  return null
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function readStringArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => typeof item === 'string' ? item.trim() : '')
            .filter(Boolean)
        }
      } catch {
        return value.split(',').map(item => item.trim()).filter(Boolean)
      }
    }
  }
  return []
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readNestedNumber(record: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record
    for (const part of path) current = asRecord(current)?.[part]
    const parsed = typeof current === 'number' ? current : typeof current === 'string' ? Number(current) : Number.NaN
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeProbability(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = value > 1 && value <= 100 ? value / 100 : value
  return Math.min(0.99, Math.max(0.01, normalized))
}

function normalizeSpread(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1 ? value / 100 : value
}

function clampPrice(value: number) {
  return Math.min(0.99, Math.max(0.01, value))
}

function cleanContext(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180)
}

function normalizeScoutMode(value: unknown): ScoutMode {
  const mode = String(value ?? '').trim().toLowerCase()
  if (mode === 'theme') return 'theme'
  if (mode === 'market') return 'market'
  return 'best'
}

function parseMarketSlug(value: string | undefined) {
  if (!value) return ''
  const clean = value.trim()
  try {
    const url = new URL(clean)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.at(-1)?.trim() ?? ''
  } catch {
    return clean.replace(/^\/+|\/+$/g, '')
  }
}

function daysUntil(rawDate: string | undefined) {
  if (!rawDate) return undefined
  const timestamp = new Date(rawDate).getTime()
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86_400_000))
}

function conservativeDurationScore(days: number | undefined) {
  if (typeof days !== 'number') return -8
  if (days < 7) return -85
  if (days <= 21) return 42
  if (days <= 45) return 30
  if (days <= 90) return 12
  return -10
}

function conservativeDepthScore(depth: number | undefined) {
  if (typeof depth !== 'number') return -20
  if (depth >= 50_000) return 35
  if (depth >= 15_000) return 22
  if (depth >= 5_000) return 8
  return -35
}

function conservativePriceScore(midpoint: number | undefined) {
  if (typeof midpoint !== 'number') return -15
  if (midpoint >= 0.25 && midpoint <= 0.75) return 24
  if (midpoint >= 0.15 && midpoint <= 0.85) return 8
  return -40
}

function isHeadlineSensitiveMarket(title: string) {
  return /\b(war|ceasefire|peace deal|nuclear|iran|russia|ukraine|israel|gaza|tariff|fed|rate cut|election|president|trump|biden|supreme court|hurricane|earthquake)\b/i.test(title)
}

function isConservativeCandidate(opportunity: PolymarketLpOpportunity) {
  const longEnough = typeof opportunity.daysToResolve !== 'number' || opportunity.daysToResolve >= 7
  const notTooFar = typeof opportunity.daysToResolve !== 'number' || opportunity.daysToResolve <= 90
  const confirmedSpread = typeof opportunity.spread === 'number' && opportunity.spread <= Math.min(opportunity.maxSpread ?? 0.03, 0.025)
  const confirmedDepth = typeof opportunity.depthAtTwoCents === 'number' && opportunity.depthAtTwoCents >= 5_000
  const tradableMid = typeof opportunity.midpoint === 'number' && opportunity.midpoint >= 0.15 && opportunity.midpoint <= 0.85
  return opportunity.lpExecutionRisk !== 'high' && longEnough && notTooFar && confirmedSpread && confirmedDepth && tradableMid
}

function extractRewardMarkets(data: unknown): PolymarketRewardMarket[] {
  if (Array.isArray(data)) return data.map(asRecord).filter((item): item is PolymarketRewardMarket => Boolean(item))
  const record = asRecord(data)
  if (!record) return []
  for (const key of ['data', 'markets', 'results']) {
    const value = record[key]
    if (Array.isArray(value)) return value.map(asRecord).filter((item): item is PolymarketRewardMarket => Boolean(item))
  }
  return []
}

async function fetchPolymarketRewardMarkets(query?: string) {
  const search = query ? `&q=${encodeURIComponent(query)}` : ''
  const urls = [
    `https://clob.polymarket.com/rewards/markets/multi?page_size=100&order_by=rate_per_day&position=DESC${search}`,
    'https://clob.polymarket.com/rewards/markets/current',
  ]

  for (const url of urls) {
    const data = await fetchPolymarketJson(url)
    const markets = extractRewardMarkets(data)
    if (markets.length) return markets
  }

  return []
}

async function fetchGammaMarkets(query?: string) {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: '40',
  })
  if (query) params.set('search', query)
  const data = await fetchPolymarketJson(`https://gamma-api.polymarket.com/markets?${params.toString()}`)
  const record = asRecord(data)
  if (Array.isArray(data)) return data.map(asRecord).filter((item): item is PolymarketRewardMarket => Boolean(item))
  if (record) {
    for (const key of ['data', 'markets', 'results']) {
      const value = record[key]
      if (Array.isArray(value)) return value.map(asRecord).filter((item): item is PolymarketRewardMarket => Boolean(item))
    }
  }
  return []
}

async function fetchGammaMarketBySlug(slug: string) {
  if (!slug) return undefined
  const urls = [
    `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
    `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
  ]
  for (const url of urls) {
    const data = await fetchPolymarketJson(url)
    const items = Array.isArray(data)
      ? data.map(asRecord).filter((item): item is PolymarketRewardMarket => Boolean(item))
      : extractRewardMarkets(data)
    if (items.length) {
      const direct = items.find(item => readString(item, ['slug', 'market_slug', 'event_slug']) === slug)
      return direct ?? items[0]
    }
  }
  return undefined
}

function extractPolymarketTokenIds(market: PolymarketRewardMarket) {
  const ids = new Set<string>()
  for (const key of ['token_id', 'tokenId', 'asset_id', 'assetId', 'clobTokenId']) {
    const value = market[key]
    if (typeof value === 'string' && value.trim()) ids.add(value.trim())
    if (typeof value === 'number' && Number.isFinite(value)) ids.add(String(value))
  }

  for (const key of ['tokens', 'outcomes', 'outcomeTokens', 'rewards']) {
    const items = market[key]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const record = asRecord(item)
      if (!record) continue
      for (const idKey of ['token_id', 'tokenId', 'asset_id', 'assetId', 'clobTokenId']) {
        const value = record[idKey]
        if (typeof value === 'string' && value.trim()) ids.add(value.trim())
        if (typeof value === 'number' && Number.isFinite(value)) ids.add(String(value))
      }
    }
  }

  for (const id of readStringArray(market, ['clobTokenIds', 'clob_token_ids', 'tokenIds', 'token_ids'])) {
    if (id) ids.add(id)
  }

  return [...ids]
}

function readBookPrice(level: PolymarketBookLevel) {
  const parsed = typeof level.price === 'number' ? level.price : typeof level.price === 'string' ? Number(level.price) : Number.NaN
  return normalizeProbability(parsed)
}

async function fetchPolymarketBook(tokenId: string): Promise<PolymarketBookSummary> {
  const data = await fetchPolymarketJson(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`) as PolymarketBookResponse | null
  if (!data) return {}
  const bidLevels = (data.bids ?? []).map(level => ({ price: readBookPrice(level), size: readNumber(level as Record<string, unknown>, ['size']) }))
  const askLevels = (data.asks ?? []).map(level => ({ price: readBookPrice(level), size: readNumber(level as Record<string, unknown>, ['size']) }))
  const bidPrices = bidLevels.map(level => level.price).filter((price): price is number => typeof price === 'number')
  const askPrices = askLevels.map(level => level.price).filter((price): price is number => typeof price === 'number')
  const bestBid = bidPrices.length ? Math.max(...bidPrices) : undefined
  const bestAsk = askPrices.length ? Math.min(...askPrices) : undefined
  const spread = typeof bestBid === 'number' && typeof bestAsk === 'number' ? Math.max(0, bestAsk - bestBid) : undefined
  const midpoint = typeof bestBid === 'number' && typeof bestAsk === 'number' ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk
  const bidDepth = bidLevels.reduce((sum, level) => sum + (level.size ?? 0), 0)
  const askDepth = askLevels.reduce((sum, level) => sum + (level.size ?? 0), 0)
  const depthAtTwoCents =
    typeof bestBid === 'number' || typeof bestAsk === 'number'
      ? bidLevels.reduce((sum, level) => sum + (typeof level.price === 'number' && typeof bestBid === 'number' && bestBid - level.price <= 0.02 ? level.size ?? 0 : 0), 0)
        + askLevels.reduce((sum, level) => sum + (typeof level.price === 'number' && typeof bestAsk === 'number' && level.price - bestAsk <= 0.02 ? level.size ?? 0 : 0), 0)
      : undefined
  return { bestBid, bestAsk, midpoint, spread, bidDepth, askDepth, depthAtTwoCents }
}

function baseLpOpportunity(market: PolymarketRewardMarket): PolymarketLpOpportunity {
  const title = readString(market, ['question', 'title', 'market_slug', 'slug', 'condition_id']) ?? 'Untitled reward market'
  const rewardsConfig = Array.isArray(market.rewards_config) ? market.rewards_config : []
  const configDailyReward = rewardsConfig.reduce((sum, item) => {
    const record = asRecord(item)
    return sum + (record ? readNumber(record, ['rate_per_day', 'ratePerDay']) ?? 0 : 0)
  }, 0)
  const dailyReward =
    readNumber(market, ['total_daily_rate', 'native_daily_rate', 'daily_reward', 'dailyRewards', 'rewards_daily_rate', 'rate_per_day', 'reward']) ??
    (configDailyReward > 0 ? configDailyReward : undefined) ??
    readNestedNumber(market, [['reward_config', 'daily_reward'], ['rewardConfig', 'dailyReward']])
  const maxSpread = normalizeSpread(
    readNumber(market, ['max_spread', 'maxSpread', 'rewards_max_spread', 'rewardsMaxSpread']) ??
    readNestedNumber(market, [['reward_config', 'max_spread'], ['rewardConfig', 'maxSpread']]),
  )
  const minSize =
    readNumber(market, ['min_size', 'minSize', 'rewards_min_size', 'rewardsMinSize']) ??
    readNestedNumber(market, [['reward_config', 'min_size'], ['rewardConfig', 'minSize']])
  const liquidity = readNumber(market, ['liquidity', 'volume_24hr', 'volume24hr', 'volume', 'oneDayVolume'])
  const endDate = readString(market, ['end_date', 'endDate', 'resolution_date', 'resolutionDate', 'closed_time'])
  const slug = readString(market, ['slug', 'market_slug', 'event_slug'])
  const marketUrl = readString(market, ['marketUrl', 'url']) ?? (slug ? `https://polymarket.com/market/${slug}` : undefined)

  return {
    title,
    slug,
    tokenId: extractPolymarketTokenIds(market)[0],
    endDate,
    daysToResolve: daysUntil(endDate),
    oneDayPriceChange: readNumber(market, ['one_day_price_change', 'oneDayPriceChange', 'price_change_24h', 'priceChange24h']),
    dailyReward,
    maxSpread,
    minSize,
    liquidity,
    lpExecutionRisk: 'medium',
    outcomeRisk: 'high',
    score: 0,
    marketUrl,
    sourceUrl: marketUrl,
  }
}

function buildExecutionPlan(opportunity: PolymarketLpOpportunity, budget?: string) {
  const budgetText = budget ? `Use ${budget} only as a cap. Start with a small maker quote first, not the full amount.` : 'Start with a small maker quote first; add more only if the book still looks stable.'
  const spreadText = typeof opportunity.spread === 'number'
    ? `Current spread is ${(opportunity.spread * 100).toFixed(1)}c. Quote inside that spread and avoid market orders.`
    : 'Re-check the live order book before quoting; skip if bid/ask is unavailable.'
  const depthText = typeof opportunity.depthAtTwoCents === 'number'
    ? `Depth within 2c is about ${opportunity.depthAtTwoCents.toFixed(0)} shares. Keep your quote small compared with that depth.`
    : 'Depth could not be confirmed; keep size conservative until the book refreshes.'
  const priceText = typeof opportunity.suggestedYesBid === 'number'
    ? `Human quote guide: try YES near ${opportunity.suggestedYesBid.toFixed(3)} or NO near ${opportunity.suggestedNoBid?.toFixed(3) ?? 'n/a'}, then refresh before the next quote.`
    : 'Do not quote until midpoint and bid/ask are available.'
  return [
    budgetText,
    spreadText,
    depthText,
    priceText,
    'Cancel stale quotes quickly before news, match starts, or fast price movement.',
  ]
}

async function analyzePolymarketLpMarket(market: PolymarketRewardMarket): Promise<PolymarketLpOpportunity> {
  const opportunity = baseLpOpportunity(market)
  const book = opportunity.tokenId ? await fetchPolymarketBook(opportunity.tokenId).catch(() => ({})) : {}
  const midpoint = book.midpoint ?? normalizeProbability(readNumber(market, ['last_trade_price', 'lastPrice', 'price', 'midpoint']))
  const spread = book.spread
  const offset = Math.min(0.02, Math.max(0.005, (opportunity.maxSpread ?? 0.03) * 0.35))
  const suggestedYesBid = typeof midpoint === 'number' ? clampPrice(midpoint - offset) : undefined
  const suggestedNoBid = typeof midpoint === 'number' ? clampPrice((1 - midpoint) - offset) : undefined
  const eligible = typeof spread === 'number' && typeof opportunity.maxSpread === 'number' ? spread <= opportunity.maxSpread : undefined

  let lpExecutionRisk: PolymarketLpOpportunity['lpExecutionRisk'] = 'medium'
  if (isHeadlineSensitiveMarket(opportunity.title)) lpExecutionRisk = 'high'
  if (typeof midpoint === 'number' && (midpoint < 0.08 || midpoint > 0.92)) lpExecutionRisk = 'high'
  if (typeof spread === 'number' && typeof opportunity.maxSpread === 'number' && spread > opportunity.maxSpread) lpExecutionRisk = 'high'
  if (typeof opportunity.oneDayPriceChange === 'number' && Math.abs(opportunity.oneDayPriceChange) > 0.08) lpExecutionRisk = 'high'
  if (lpExecutionRisk !== 'high' && typeof spread === 'number' && spread <= 0.02 && typeof midpoint === 'number' && midpoint > 0.15 && midpoint < 0.85 && typeof book.depthAtTwoCents === 'number' && book.depthAtTwoCents >= 15_000) {
    lpExecutionRisk = 'low'
  }

  const rewardScore = Math.min(80, (opportunity.dailyReward ?? 0) / 25)
  const liquidityScore = Math.min(35, (opportunity.liquidity ?? 0) / 1_000)
  const eligibilityScore = eligible === false ? -50 : eligible === true ? 25 : 0
  const durationScore = conservativeDurationScore(opportunity.daysToResolve)
  const depthScore = conservativeDepthScore(book.depthAtTwoCents)
  const priceScore = conservativePriceScore(midpoint)
  const nearResolutionPenalty = typeof opportunity.daysToResolve === 'number' && opportunity.daysToResolve < 7 ? 100 : 0
  const volatilityPenalty = typeof opportunity.oneDayPriceChange === 'number' ? Math.min(80, Math.abs(opportunity.oneDayPriceChange) * 500) : 10
  const spreadPenalty = typeof spread === 'number' ? spread * 650 : 18
  const riskPenalty = lpExecutionRisk === 'high' ? 220 : lpExecutionRisk === 'medium' ? 18 : 0
  const scoutReason = [
    typeof opportunity.daysToResolve === 'number' ? `${opportunity.daysToResolve} days left` : 'duration unknown',
    typeof spread === 'number' ? `${(spread * 100).toFixed(1)}c spread` : 'spread unknown',
    typeof book.depthAtTwoCents === 'number' ? `${book.depthAtTwoCents.toFixed(0)} depth within 2c` : 'depth unknown',
    typeof opportunity.dailyReward === 'number' ? `${opportunity.dailyReward.toFixed(0)} USDC/day rewards` : 'reward rate unknown',
  ].join(' · ')

  return {
    ...opportunity,
    ...book,
    midpoint,
    suggestedYesBid,
    suggestedNoBid,
    eligible,
    lpExecutionRisk,
    outcomeRisk: 'high',
    scoutReason,
    score: rewardScore + liquidityScore + eligibilityScore + durationScore + depthScore + priceScore - spreadPenalty - riskPenalty - volatilityPenalty - nearResolutionPenalty,
  }
}

function rounded(value: number | undefined, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined
}

function scoutModeTitle(mode: ScoutMode) {
  if (mode === 'theme') return 'theme scout'
  if (mode === 'market') return 'single market inspection'
  return 'best reward markets'
}

async function loadScoutMarkets(options: ScoutOptions) {
  if (options.mode === 'market') {
    const slug = parseMarketSlug(options.context)
    const exact = await fetchGammaMarketBySlug(slug)
    return exact ? [exact] : []
  }

  if (options.mode === 'theme') {
    const query = cleanContext(options.context)
    const [rewardMarkets, gammaMarkets] = await Promise.all([
      fetchPolymarketRewardMarkets(query),
      fetchGammaMarkets(query),
    ])
    const seen = new Set<string>()
    return [...rewardMarkets, ...gammaMarkets].filter(market => {
      const key = readString(market, ['condition_id', 'conditionId', 'id', 'slug', 'market_slug']) ?? JSON.stringify(market).slice(0, 80)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  return fetchPolymarketRewardMarkets()
}

function formatOpportunitySignal(opportunity: ReturnType<typeof serializeOpportunity>, index: number, mode: ScoutMode) {
  const depth = typeof opportunity.depthAtTwoCents === 'number' ? ` | depth ${opportunity.depthAtTwoCents}` : ''
  const spread = typeof opportunity.liveSpread === 'number' ? `${(opportunity.liveSpread * 100).toFixed(1)}c` : 'n/a'
  const reward = opportunity.dailyReward ?? 'n/a'
  const prefix = mode === 'market' ? 'Market checked' : mode === 'theme' ? 'Best match for this request' : 'Best current LP candidate'
  const days = typeof opportunity.daysToResolve === 'number' ? ` | ${opportunity.daysToResolve}d left` : ''
  return `${prefix}: ${opportunity.title.slice(0, 82)} | reward/day ${reward} USDC | spread ${spread}${depth}${days} | risk ${opportunity.lpExecutionRisk}`
}

function serializeOpportunity(opportunity: PolymarketLpOpportunity, budget?: string) {
  return {
    title: opportunity.title,
    marketUrl: opportunity.marketUrl,
    daysToResolve: opportunity.daysToResolve,
    dailyReward: rounded(opportunity.dailyReward, 2),
    maxSpread: rounded(opportunity.maxSpread),
    minSize: rounded(opportunity.minSize, 2),
    liquidity: rounded(opportunity.liquidity, 2),
    bestBid: rounded(opportunity.bestBid),
    bestAsk: rounded(opportunity.bestAsk),
    liveSpread: rounded(opportunity.spread),
    bidDepth: rounded(opportunity.bidDepth, 2),
    askDepth: rounded(opportunity.askDepth, 2),
    depthAtTwoCents: rounded(opportunity.depthAtTwoCents, 2),
    suggestedYesBid: rounded(opportunity.suggestedYesBid),
    suggestedNoBid: rounded(opportunity.suggestedNoBid),
    eligible: opportunity.eligible,
    lpExecutionRisk: opportunity.lpExecutionRisk,
    outcomeRisk: opportunity.outcomeRisk,
    score: rounded(opportunity.score, 2),
    scoutReason: opportunity.scoutReason,
    executionPlan: buildExecutionPlan(opportunity, budget),
  }
}

export async function buildLiveScout(options: Partial<ScoutOptions> = {}) {
  const mode = normalizeScoutMode(options.mode)
  const context = cleanContext(options.context)
  const budget = cleanContext(options.budget)
  const markets = await loadScoutMarkets({ mode, context, budget })
  if (!markets.length) {
    const requestText = mode === 'theme' && context ? ` for "${context}"` : mode === 'market' && context ? ` for "${context}"` : ''
    return {
      summary: `Live Polymarket ${scoutModeTitle(mode)} data is unavailable${requestText} right now.`,
      signals: ['No paid pick was forced. Retry shortly and confirm the market page plus order book before quoting.'],
      opportunities: [],
      nextAction: 'Retry LP Scout after Polymarket public APIs are available.',
      disclaimer: 'Educational product signal only. Not financial advice.',
      source: 'Polymarket Gamma and CLOB public APIs',
      request: { mode, context, budget },
    }
  }

  const candidates = markets.slice(0, mode === 'market' ? 4 : 24)
  const analyzed = (await Promise.all(candidates.map(analyzePolymarketLpMarket)))
  const conservative = analyzed.filter(isConservativeCandidate)
  if (mode !== 'market' && !conservative.length) {
    const themeText = mode === 'theme' && context ? ` for "${context}"` : ''
    return {
      summary: `Live LP Scout did not find a clean conservative Polymarket LP candidate${themeText} right now.`,
      signals: [
        'No paid pick was forced. Current markets failed the safety screen for time left, spread, depth, headline risk, or tradable midpoint.',
      ],
      opportunities: [],
      nextAction: 'Wait for a cleaner setup. Re-run LP Scout later before committing USDC.',
      disclaimer: 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.',
      source: 'Polymarket Gamma markets/events plus CLOB rewards and order book APIs',
      request: { mode, context, budget },
    }
  }
  const opportunities = (conservative.length ? conservative : analyzed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map(opportunity => serializeOpportunity(opportunity, budget))

  const themeText = mode === 'theme' && context ? ` for "${context}"` : ''
  const marketText = mode === 'market' && context ? ` for "${context}"` : ''
  const summary = mode === 'market'
    ? `Live LP Scout checked the requested Polymarket market${marketText} using current book, spread, depth, and maker-order risk.`
    : mode === 'theme'
    ? `Live LP Scout selected one conservative Polymarket LP candidate${themeText} after checking rewards, spread, depth, time left, and volatility.`
    : `Live LP Scout selected one conservative Polymarket reward market after checking rewards, spread, depth, time left, and volatility.`

  return {
    summary,
    signals: opportunities.map((opportunity, index) => formatOpportunitySignal(opportunity, index, mode)),
    opportunities,
    nextAction: 'Human action only: open the market, confirm the live book still matches this scout, then place a small maker quote inside the spread. Do not use market orders.',
    disclaimer: 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.',
    source: 'Polymarket Gamma markets/events plus CLOB rewards and order book APIs',
    request: { mode, context, budget },
  }
}

async function scoutResponse(req: PaidRequest) {
  const payment = req.payment
  const amount = payment?.amount ? `${formatUnits(BigInt(payment.amount), 6)} USDC` : PRICE
  const scout = await buildLiveScout({
    mode: normalizeScoutMode(req.query.scoutMode),
    context: cleanContext(req.query.context),
    budget: cleanContext(req.query.budget),
  })
  return {
    ok: true,
    service: 'Hash PayLink x402 Polymarket LP Scout',
    paid: true,
    payment: payment
      ? {
          payer: payment.payer,
          amount,
          network: payment.network,
          transaction: payment.transaction,
        }
      : undefined,
    scout,
    receipt: {
      provider: 'Circle Gateway x402',
      price: PRICE,
      seller: SELLER_ADDRESS,
      generatedAt: new Date().toISOString(),
    },
  }
}

export default async function handler(req: Request, res: Response, next?: NextFunction) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const middleware = await getGatewayMiddleware()
    return middleware(req, res, async () => res.json(await scoutResponse(req as PaidRequest)))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'x402 scout unavailable'
    if (next) return next(err)
    return res.status(500).json({ ok: false, error: message })
  }
}

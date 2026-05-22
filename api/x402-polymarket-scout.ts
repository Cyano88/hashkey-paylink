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
  suggestedYesBid?: number
  suggestedNoBid?: number
  eligible?: boolean
  lpExecutionRisk: 'low' | 'medium' | 'high'
  outcomeRisk: 'medium' | 'high'
  score: number
  marketUrl?: string
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

function daysUntil(rawDate: string | undefined) {
  if (!rawDate) return undefined
  const timestamp = new Date(rawDate).getTime()
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86_400_000))
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

  return [...ids]
}

function readBookPrice(level: PolymarketBookLevel) {
  const parsed = typeof level.price === 'number' ? level.price : typeof level.price === 'string' ? Number(level.price) : Number.NaN
  return normalizeProbability(parsed)
}

async function fetchPolymarketBook(tokenId: string): Promise<PolymarketBookSummary> {
  const data = await fetchPolymarketJson(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`) as PolymarketBookResponse | null
  if (!data) return {}
  const bidPrices = (data.bids ?? []).map(readBookPrice).filter((price): price is number => typeof price === 'number')
  const askPrices = (data.asks ?? []).map(readBookPrice).filter((price): price is number => typeof price === 'number')
  const bestBid = bidPrices.length ? Math.max(...bidPrices) : undefined
  const bestAsk = askPrices.length ? Math.min(...askPrices) : undefined
  const spread = typeof bestBid === 'number' && typeof bestAsk === 'number' ? Math.max(0, bestAsk - bestBid) : undefined
  const midpoint = typeof bestBid === 'number' && typeof bestAsk === 'number' ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk
  return { bestBid, bestAsk, midpoint, spread }
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
    marketUrl: slug ? `https://polymarket.com/market/${slug}` : undefined,
  }
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
  if (typeof midpoint === 'number' && (midpoint < 0.08 || midpoint > 0.92)) lpExecutionRisk = 'high'
  if (typeof spread === 'number' && typeof opportunity.maxSpread === 'number' && spread > opportunity.maxSpread) lpExecutionRisk = 'high'
  if (typeof opportunity.oneDayPriceChange === 'number' && Math.abs(opportunity.oneDayPriceChange) > 0.08) lpExecutionRisk = 'high'
  if (lpExecutionRisk !== 'high' && typeof spread === 'number' && spread <= 0.02 && typeof midpoint === 'number' && midpoint > 0.15 && midpoint < 0.85) {
    lpExecutionRisk = 'low'
  }

  const rewardScore = Math.min(150, opportunity.dailyReward ?? 0)
  const liquidityScore = Math.min(500, opportunity.liquidity ?? 0) / 25
  const eligibilityScore = eligible === false ? -50 : eligible === true ? 25 : 0
  const durationScore = typeof opportunity.daysToResolve === 'number'
    ? Math.min(35, Math.max(-60, opportunity.daysToResolve - 7))
    : 0
  const nearResolutionPenalty = typeof opportunity.daysToResolve === 'number' && opportunity.daysToResolve < 7 ? 75 : 0
  const volatilityPenalty = typeof opportunity.oneDayPriceChange === 'number' ? Math.min(60, Math.abs(opportunity.oneDayPriceChange) * 400) : 8
  const spreadPenalty = typeof spread === 'number' ? spread * 100 : 8
  const riskPenalty = lpExecutionRisk === 'high' ? 30 : lpExecutionRisk === 'medium' ? 10 : 0

  return {
    ...opportunity,
    ...book,
    midpoint,
    suggestedYesBid,
    suggestedNoBid,
    eligible,
    lpExecutionRisk,
    outcomeRisk: 'high',
    score: rewardScore + liquidityScore + eligibilityScore + durationScore - spreadPenalty - riskPenalty - volatilityPenalty - nearResolutionPenalty,
  }
}

function rounded(value: number | undefined, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined
}

export async function buildLiveScout() {
  const markets = await fetchPolymarketRewardMarkets()
  if (!markets.length) {
    return {
      summary: 'Live Polymarket reward markets are unavailable right now.',
      signals: ['Retry shortly, then compare active reward markets with live order books before quoting.'],
      opportunities: [],
      nextAction: 'Retry /lp x402 after the Polymarket rewards API is available.',
      disclaimer: 'Educational product signal only. Not financial advice.',
      source: 'Polymarket CLOB rewards and order book APIs',
    }
  }

  const candidates = markets.slice(0, 12)
  const opportunities = (await Promise.all(candidates.map(analyzePolymarketLpMarket)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(opportunity => ({
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
      suggestedYesBid: rounded(opportunity.suggestedYesBid),
      suggestedNoBid: rounded(opportunity.suggestedNoBid),
      eligible: opportunity.eligible,
      lpExecutionRisk: opportunity.lpExecutionRisk,
      outcomeRisk: opportunity.outcomeRisk,
      score: rounded(opportunity.score, 2),
    }))

  return {
    summary: `Live LP Scout ranked ${opportunities.length} active Polymarket reward markets by rewards, book spread, duration, liquidity, and volatility.`,
    signals: opportunities.map((opportunity, index) => (
      `${index + 1}. ${opportunity.title.slice(0, 82)} | reward/day ${opportunity.dailyReward ?? 'n/a'} USDC | spread ${typeof opportunity.liveSpread === 'number' ? `${(opportunity.liveSpread * 100).toFixed(1)}c` : 'n/a'} | risk ${opportunity.lpExecutionRisk}`
    )),
    opportunities,
    nextAction: 'Before quoting, have the agent re-check the market page and order book depth, then place maker orders only inside the reward spread.',
    disclaimer: 'Educational product signal only. Not financial advice.',
    source: 'Polymarket CLOB rewards and order book APIs',
  }
}

async function scoutResponse(req: PaidRequest) {
  const payment = req.payment
  const amount = payment?.amount ? `${formatUnits(BigInt(payment.amount), 6)} USDC` : PRICE
  const scout = await buildLiveScout()
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

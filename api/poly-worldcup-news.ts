import type { Request, Response } from 'express'

type ProviderArticle = Record<string, unknown>

export type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
}

type CacheEntry = {
  expiresAt: number
  feed: {
    ok: true
    providerConfigured: boolean
    source: string
    updatedAt: string
    articles: PolyWorldCupArticle[]
  }
}

const DEFAULT_QUERY = 'World Cup 2026 OR FIFA World Cup'
const DEFAULT_CACHE_MS = 15 * 60 * 1000
const FALLBACK_IMAGE = '/brand/world-globe.png'

let cache: CacheEntry | null = null

export function polyWorldcupArticleId(article: Pick<PolyWorldCupArticle, 'title' | 'url'>, index = 0) {
  const input = `${article.title}|${article.url}|${index}`.toLowerCase()
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const slug = article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'headline'
  return `worldcup-news-${slug}-${(hash >>> 0).toString(36)}`
}

function envValue(primary: string, fallback: string) {
  return process.env[primary]?.trim() || process.env[fallback]?.trim() || ''
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function articleSource(article: ProviderArticle) {
  const source = article.source
  if (source && typeof source === 'object' && 'name' in source) {
    return asString((source as { name?: unknown }).name)
  }
  return asString(article.source) || asString(article.provider) || asString(article.author) || 'News provider'
}

function articleImage(article: ProviderArticle) {
  return (
    asString(article.image)
    || asString(article.urlToImage)
    || asString(article.image_url)
    || asString(article.thumbnail)
    || FALLBACK_IMAGE
  )
}

function articleUrl(article: ProviderArticle) {
  return asString(article.url) || asString(article.link)
}

function tagFor(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase()
  if (/(polymarket|odds|market|liquidity|reward|spread|trading|prediction)/.test(text)) return 'Markets'
  if (/(injury|injured|squad|roster|lineup|selection)/.test(text)) return 'Squads'
  if (/(qualif|draw|fixture|schedule|group|match)/.test(text)) return 'Fixtures'
  if (/(ticket|stadium|venue|host|city)/.test(text)) return 'Venues'
  return 'World Cup'
}

function normalizeArticle(article: ProviderArticle): PolyWorldCupArticle | null {
  const title = asString(article.title) || asString(article.headline)
  if (!title) return null
  const description =
    asString(article.description)
    || asString(article.summary)
    || asString(article.content)
    || 'World Cup update for market context.'
  return {
    title,
    description,
    source: articleSource(article),
    image: articleImage(article),
    url: articleUrl(article),
    publishedAt: asString(article.publishedAt)
      || asString(article.published_at)
      || asString(article.pubDate)
      || asString(article.published)
      || asString(article.created_at)
      || asString(article.date)
      || new Date().toISOString(),
    tag: tagFor(title, description),
  }
}

function articleTimeValue(article: PolyWorldCupArticle) {
  const timestamp = Date.parse(article.publishedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function extractArticles(payload: unknown): ProviderArticle[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as ProviderArticle[]
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  const candidates = [data.articles, data.items, data.results, data.data]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(item => item && typeof item === 'object') as ProviderArticle[]
  }
  return []
}

function fallbackArticles(): PolyWorldCupArticle[] {
  const now = new Date().toISOString()
  return [
    {
      title: 'World Cup outright markets need fresh news checks before quoting',
      description: 'Use team news, injury context, and current order-book depth before placing maker orders in World Cup markets.',
      source: 'Hash PayLink desk',
      image: FALLBACK_IMAGE,
      url: '',
      publishedAt: now,
      tag: 'Markets',
    },
    {
      title: 'Squad and injury headlines can move national-team prices quickly',
      description: 'Before committing USDC, check whether the latest squad update changes the market price or makes liquidity thinner.',
      source: 'Hash PayLink desk',
      image: FALLBACK_IMAGE,
      url: '',
      publishedAt: now,
      tag: 'Squads',
    },
    {
      title: 'Fixture and venue context matters for longer World Cup positions',
      description: 'Longer campaigns may be safer for LP rewards, but every quote should still be reviewed against schedule and volatility.',
      source: 'Hash PayLink desk',
      image: FALLBACK_IMAGE,
      url: '',
      publishedAt: now,
      tag: 'Fixtures',
    },
  ]
}

async function fetchProviderArticles(): Promise<PolyWorldCupArticle[]> {
  const apiUrl = envValue('POLY_NEWS_API_URL', 'NEWS_API_URL')
  if (!apiUrl) return []

  const url = new URL(apiUrl)
  const queryParam = process.env.POLY_NEWS_QUERY_PARAM?.trim() || 'q'
  const limitParam = process.env.POLY_NEWS_LIMIT_PARAM?.trim() || 'max'
  if (!url.searchParams.has(queryParam)) url.searchParams.set(queryParam, envValue('POLY_NEWS_QUERY', 'NEWS_QUERY') || DEFAULT_QUERY)
  if (!url.searchParams.has(limitParam)) url.searchParams.set(limitParam, process.env.POLY_NEWS_LIMIT?.trim() || '10')

  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = envValue('POLY_NEWS_API_KEY', 'NEWS_API_KEY')
  const authHeader = process.env.POLY_NEWS_API_AUTH_HEADER?.trim()
  if (apiKey && authHeader) {
    headers[authHeader] = apiKey
  } else if (apiKey) {
    const keyParam = process.env.POLY_NEWS_API_KEY_PARAM?.trim() || 'apikey'
    if (!url.searchParams.has(keyParam)) url.searchParams.set(keyParam, apiKey)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new Error(`News provider returned ${response.status}`)
    const payload = await response.json()
    return (extractArticles(payload).map(normalizeArticle).filter(Boolean) as PolyWorldCupArticle[])
      .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
      .slice(0, 10)
  } finally {
    clearTimeout(timeout)
  }
}

export async function getPolyWorldcupNewsFeed() {
  const cacheMs = Number(envValue('POLY_NEWS_CACHE_MS', 'NEWS_CACHE_MS') || DEFAULT_CACHE_MS)
  const ttl = Number.isFinite(cacheMs) && cacheMs > 0 ? cacheMs : DEFAULT_CACHE_MS
  if (cache && cache.expiresAt > Date.now()) return cache.feed

  const providerConfigured = Boolean(envValue('POLY_NEWS_API_URL', 'NEWS_API_URL'))
  try {
    const providerArticles = await fetchProviderArticles()
    const articles = providerArticles.length ? providerArticles : fallbackArticles()
    const feed = {
      ok: true as const,
      providerConfigured,
      source: providerArticles.length ? envValue('POLY_NEWS_PROVIDER', 'NEWS_PROVIDER') || 'provider' : 'fallback',
      updatedAt: new Date().toISOString(),
      articles,
    }
    cache = { expiresAt: Date.now() + ttl, feed }
    return feed
  } catch {
    const feed = {
      ok: true as const,
      providerConfigured,
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      articles: fallbackArticles(),
    }
    cache = { expiresAt: Date.now() + Math.min(ttl, 60_000), feed }
    return feed
  }
}

export default async function polyWorldcupNewsHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  return res.json(await getPolyWorldcupNewsFeed())
}

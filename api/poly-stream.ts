import type { Request, Response } from 'express'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

type ProviderMatch = Record<string, unknown>

type PolyStreamMatch = {
  tag: string
  title: string
  time: string
  venue: string
  status: string
  marketContext: string
  sourceUrl: string
  watchUrl: string
  watchProviders?: Array<{ label: string; url: string }>
}

type CacheEntry = {
  expiresAt: number
  feed: {
    ok: true
    providerConfigured: boolean
    source: string
    providerStatus: string
    updatedAt: string
    matches: PolyStreamMatch[]
  }
}

const DEFAULT_CACHE_MS = 10 * 60 * 1000
const DEFAULT_QUERY = 'World Cup'

let cache: CacheEntry | null = null
let lastProviderError = ''
const __dirname = dirname(fileURLToPath(import.meta.url))

function envValue(primary: string, fallback = '') {
  return process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() || '' : '')
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function providerName() {
  return envValue('POLY_STREAM_PROVIDER', 'SPORTS_PROVIDER').toLowerCase()
}

function defaultProviderUrl(provider: string) {
  const key = envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY')
  if (provider === 'scorebat') {
    const url = new URL('https://www.scorebat.com/video-api/v3/feed/')
    if (key) url.searchParams.set('token', key)
    return url.toString()
  }
  if (provider === 'thesportsdb') {
    const apiKey = key || '3'
    const query = encodeURIComponent(process.env.POLY_STREAM_QUERY?.trim() || 'World Cup')
    return `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchevents.php?e=${query}`
  }
  return ''
}

function safeProviderMessage(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .slice(0, 260)
}

function configuredWatchUrls() {
  const raw = process.env.POLY_STREAM_WATCH_URLS?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch (_err) {
    return {}
  }
}

function watchUrlFor(title: string) {
  const urls = configuredWatchUrls()
  const direct = urls[title]
  if (typeof direct === 'string') return direct.trim()
  const normalizedTitle = title.toLowerCase()
  for (const [key, value] of Object.entries(urls)) {
    if (typeof value === 'string' && key.toLowerCase() === normalizedTitle) return value.trim()
  }
  return ''
}

function normalizeWatchProviders(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      const record = asRecord(item)
      const label = asString(record.label)
      const url = asString(record.url)
      return label && url ? { label, url } : null
    })
    .filter(Boolean) as Array<{ label: string; url: string }>
}

function extractMatches(payload: unknown): ProviderMatch[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as ProviderMatch[]
  const data = asRecord(payload)
  const candidates = [
    data.matches,
    data.fixtures,
    data.events,
    data.results,
    data.data,
    data.response,
    data.items,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(item => item && typeof item === 'object') as ProviderMatch[]
  }
  return []
}

function normalizeFeedMatch(match: ProviderMatch): PolyStreamMatch | null {
  const title = asString(match.title)
  if (!title) return null
  return {
    tag: asString(match.tag) || 'Fixture',
    title,
    time: asString(match.time) || 'Schedule pending',
    venue: asString(match.venue) || 'World Cup venue',
    status: asString(match.status) || 'Scheduled',
    marketContext: asString(match.marketContext) || `${title}. Check related Polymarket books before asking LP Scout.`,
    sourceUrl: asString(match.sourceUrl),
    watchUrl: asString(match.watchUrl),
    watchProviders: normalizeWatchProviders(match.watchProviders),
  }
}

async function fetchFeedMatches(): Promise<PolyStreamMatch[]> {
  const feedUrl = process.env.POLY_STREAM_FEED_URL?.trim()
  if (!feedUrl) {
    const localFeedPath = join(__dirname, '..', 'public', 'poly-stream-feed.json')
    try {
      const text = await readFile(localFeedPath, 'utf8')
      const payload = JSON.parse(text)
      return extractMatches(payload).map(normalizeFeedMatch).filter(Boolean).slice(0, 12) as PolyStreamMatch[]
    } catch (_err) {
      return []
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Poly Stream feed returned ${response.status}: ${safeProviderMessage(text)}`)
    const payload = JSON.parse(text)
    return extractMatches(payload).map(normalizeFeedMatch).filter(Boolean).slice(0, 12) as PolyStreamMatch[]
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapTeamName(team: unknown) {
  if (typeof team === 'string') return team.trim()
  const record = asRecord(team)
  return asString(record.name) || asString(record.team_name) || asString(record.shortName)
}

function fixtureTeams(match: ProviderMatch) {
  const teams = asRecord(match.teams)
  const home =
    unwrapTeamName(match.home)
    || unwrapTeamName(match.homeTeam)
    || unwrapTeamName(match.home_team)
    || unwrapTeamName(teams.home)
    || asString(match.strHomeTeam)
    || asString(match.team1)
  const away =
    unwrapTeamName(match.away)
    || unwrapTeamName(match.awayTeam)
    || unwrapTeamName(match.away_team)
    || unwrapTeamName(teams.away)
    || asString(match.strAwayTeam)
    || asString(match.team2)
  return { home, away }
}

function fixtureDate(match: ProviderMatch) {
  const fixture = asRecord(match.fixture)
  const dateEvent = asString(match.dateEvent)
  const timeEvent = asString(match.strTime)
  const sportsDbDate = dateEvent ? `${dateEvent}${timeEvent ? `T${timeEvent.replace(/Z$/, '')}` : ''}` : ''
  return (
    asString(fixture.date)
    || asString(match.date)
    || asString(match.utcDate)
    || asString(match.event_date)
    || asString(match.strTimestamp)
    || sportsDbDate
    || asString(match.publishedAt)
  )
}

function fixtureStatus(match: ProviderMatch) {
  const fixture = asRecord(match.fixture)
  const status = asRecord(fixture.status)
  return (
    asString(status.short)
    || asString(status.long)
    || asString(match.status)
    || asString(match.statusShort)
    || asString(match.matchStatus)
    || asString(match.strStatus)
    || 'Scheduled'
  )
}

function fixtureVenue(match: ProviderMatch) {
  const fixture = asRecord(match.fixture)
  const venue = asRecord(fixture.venue)
  return (
    asString(venue.name)
    || asString(match.venue)
    || asString(match.strVenue)
    || asString(match.location)
    || asString(match.strCountry)
    || 'World Cup venue'
  )
}

function fixtureUrl(match: ProviderMatch) {
  const videos = Array.isArray(match.videos) ? match.videos : []
  const firstVideo = asRecord(videos[0])
  return (
    asString(match.url)
    || asString(match.link)
    || asString(match.matchviewUrl)
    || asString(match.sourceUrl)
    || asString(match.strVideo)
    || asString(firstVideo.url)
    || asString(firstVideo.embed)
  )
}

function tagFor(status: string, date: string) {
  const text = status.toLowerCase()
  if (/(live|1h|2h|ht|et|p|in play|in-play)/.test(text)) return 'Live'
  if (/(ft|aet|pen|finished|complete|post)/.test(text)) return 'Result'
  if (date) {
    const ts = Date.parse(date)
    if (Number.isFinite(ts)) {
      const hours = (ts - Date.now()) / 36e5
      if (hours >= 0 && hours <= 24) return 'Today'
    }
  }
  return 'Fixture'
}

function readableTime(date: string) {
  if (!date) return 'Schedule pending'
  const ts = Date.parse(date)
  if (!Number.isFinite(ts)) return date
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ts))
}

function normalizeMatch(match: ProviderMatch): PolyStreamMatch | null {
  const { home, away } = fixtureTeams(match)
  const title = asString(match.title) || asString(match.name) || asString(match.strEvent) || (home && away ? `${home} vs ${away}` : '')
  if (!title) return null

  const date = fixtureDate(match)
  const status = fixtureStatus(match)
  const venue = fixtureVenue(match)
  const url = fixtureUrl(match)
  const competition = asString(asRecord(match.league).name) || asString(asRecord(match.competition).name) || asString(match.strLeague) || 'World Cup'
  const context = `${title}. ${competition}. ${status}. Check related Polymarket team, group, qualification, scorer, and outright markets before asking for paid LP alpha.`

  return {
    tag: tagFor(status, date),
    title,
    time: readableTime(date),
    venue,
    status,
    marketContext: context,
    sourceUrl: url,
    watchUrl: watchUrlFor(title) || url,
    watchProviders: normalizeWatchProviders(match.watchProviders),
  }
}

function fallbackMatches(): PolyStreamMatch[] {
  return [
    {
      tag: 'Live now',
      title: 'USA vs Paraguay',
      time: 'June 12/13',
      venue: 'Los Angeles Stadium',
      status: 'Live/recent',
      marketContext: 'Host-nation Group D opener. Check USA momentum, Paraguay response, group qualification, scorer, and live sentiment markets before asking LP Scout.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('USA vs Paraguay'),
    },
    {
      tag: 'Today',
      title: 'Haiti vs Scotland',
      time: 'June 13',
      venue: 'Boston Stadium',
      status: 'Desk mode',
      marketContext: 'Group C opener. Check Scotland, Haiti, group qualification, and underdog headline markets before asking LP Scout for paid book depth.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('Haiti vs Scotland'),
    },
    {
      tag: 'Today',
      title: 'Australia vs Turkiye',
      time: 'June 13',
      venue: 'BC Place Vancouver',
      status: 'Desk mode',
      marketContext: 'Group D match with strong regional interest. Watch team news and early price movement before checking related Polymarket liquidity.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('Australia vs Turkiye'),
    },
    {
      tag: 'Today',
      title: 'Brazil vs Morocco',
      time: 'June 13',
      venue: 'New York New Jersey Stadium',
      status: 'Desk mode',
      marketContext: 'High-attention Group C fixture. Watch Brazil outright, Morocco upset, scorer, and group-table markets before asking LP Scout.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('Brazil vs Morocco'),
    },
    {
      tag: 'Today',
      title: 'Qatar vs Switzerland',
      time: 'June 13',
      venue: 'San Francisco Bay Area Stadium',
      status: 'Desk mode',
      marketContext: 'Group B fixture. Check qualification, match winner, and news-driven pricing before committing to any LP strategy.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('Qatar vs Switzerland'),
    },
    {
      tag: 'Tomorrow',
      title: "Cote d'Ivoire vs Ecuador",
      time: 'June 14',
      venue: 'Philadelphia Stadium',
      status: 'Desk mode',
      marketContext: 'Group E opener. Use early news and lineup context to decide if related Polymarket books deserve a paid scout.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor("Cote d'Ivoire vs Ecuador"),
    },
    {
      tag: 'Tomorrow',
      title: 'Germany vs Curacao',
      time: 'June 14',
      venue: 'Houston Stadium',
      status: 'Desk mode',
      marketContext: 'High-attention Group E fixture. Watch favorite pricing, handicap narratives, and scorer markets before asking LP Scout.',
      sourceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026',
      watchUrl: watchUrlFor('Germany vs Curacao'),
    },
  ]
}

async function fetchProviderMatches(): Promise<PolyStreamMatch[]> {
  const provider = providerName()
  const apiUrl = envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL') || defaultProviderUrl(provider)
  if (!apiUrl) return []

  const url = new URL(apiUrl)
  const queryParam = process.env.POLY_STREAM_QUERY_PARAM?.trim()
  if (queryParam && !url.searchParams.has(queryParam)) {
    url.searchParams.set(queryParam, process.env.POLY_STREAM_QUERY?.trim() || DEFAULT_QUERY)
  }
  const limitParam = process.env.POLY_STREAM_LIMIT_PARAM?.trim()
  if (limitParam && !url.searchParams.has(limitParam)) {
    url.searchParams.set(limitParam, process.env.POLY_STREAM_LIMIT?.trim() || '8')
  }

  const headers: Record<string, string> = {}
  const apiKey = envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY')
  const authHeader = process.env.POLY_STREAM_API_AUTH_HEADER?.trim()
  if (apiKey && authHeader) {
    headers[authHeader] = apiKey
  } else if (apiKey && (provider === 'api-football' || provider === 'api-sports' || provider === '')) {
    headers['x-apisports-key'] = apiKey
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`Poly Stream provider returned ${response.status}: ${safeProviderMessage(text)}`)
    const payload = JSON.parse(text)
    const providerErrors = asRecord(payload).errors
    if ((provider === 'api-football' || provider === 'api-sports' || provider === '') && providerErrors && JSON.stringify(providerErrors) !== '[]' && JSON.stringify(providerErrors) !== '{}') {
      throw new Error(`Poly Stream provider error: ${safeProviderMessage(providerErrors)}`)
    }
    return extractMatches(payload).map(normalizeMatch).filter(Boolean).slice(0, 8) as PolyStreamMatch[]
  } finally {
    clearTimeout(timeout)
  }
}

export default async function polyStreamHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const cacheMs = Number(envValue('POLY_STREAM_CACHE_MS', 'SPORTS_CACHE_MS') || DEFAULT_CACHE_MS)
  const ttl = Number.isFinite(cacheMs) && cacheMs > 0 ? cacheMs : DEFAULT_CACHE_MS
  if (cache && cache.expiresAt > Date.now()) return res.json(cache.feed)

  const configuredProvider = providerName()
  const feedConfigured = Boolean(process.env.POLY_STREAM_FEED_URL?.trim())
  const providerConfigured = Boolean(feedConfigured || envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL') || configuredProvider === 'scorebat' || configuredProvider === 'thesportsdb')
  try {
    const feedMatches = await fetchFeedMatches()
    const providerMatches = feedMatches.length ? feedMatches : await fetchProviderMatches()
    const matches = providerMatches.length ? providerMatches : fallbackMatches()
    lastProviderError = providerConfigured && !providerMatches.length ? 'Provider returned no normalized matches.' : ''
    const feed = {
      ok: true as const,
      providerConfigured,
      source: feedMatches.length ? 'feed' : providerMatches.length ? envValue('POLY_STREAM_PROVIDER', 'SPORTS_PROVIDER') || 'provider' : 'fallback',
      providerStatus: providerMatches.length ? 'connected' : providerConfigured ? 'empty' : 'not_configured',
      updatedAt: new Date().toISOString(),
      matches,
    }
    cache = { expiresAt: Date.now() + ttl, feed }
    return res.json(req.query.debug === '1' ? { ...feed, providerError: lastProviderError } : feed)
  } catch (err) {
    lastProviderError = err instanceof Error ? err.message : 'Poly Stream provider failed.'
    const feed = {
      ok: true as const,
      providerConfigured,
      source: 'fallback',
      providerStatus: providerConfigured ? 'error' : 'not_configured',
      updatedAt: new Date().toISOString(),
      matches: fallbackMatches(),
    }
    cache = { expiresAt: Date.now() + Math.min(ttl, 60_000), feed }
    return res.json(req.query.debug === '1' ? { ...feed, providerError: lastProviderError } : feed)
  }
}

import type { Request, Response } from 'express'

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

function envValue(primary: string, fallback = '') {
  return process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() || '' : '')
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function safeProviderMessage(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .slice(0, 260)
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
  return (
    asString(fixture.date)
    || asString(match.date)
    || asString(match.utcDate)
    || asString(match.event_date)
    || asString(match.strTimestamp)
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
    || 'World Cup venue'
  )
}

function fixtureUrl(match: ProviderMatch) {
  return (
    asString(match.url)
    || asString(match.link)
    || asString(match.matchviewUrl)
    || asString(match.sourceUrl)
    || asString(match.strVideo)
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
  const title = asString(match.title) || asString(match.name) || (home && away ? `${home} vs ${away}` : '')
  if (!title) return null

  const date = fixtureDate(match)
  const status = fixtureStatus(match)
  const venue = fixtureVenue(match)
  const url = fixtureUrl(match)
  const competition = asString(asRecord(match.league).name) || asString(asRecord(match.competition).name) || 'World Cup'
  const context = `${title}. ${competition}. ${status}. Check related Polymarket team, group, qualification, scorer, and outright markets before asking for paid LP alpha.`

  return {
    tag: tagFor(status, date),
    title,
    time: readableTime(date),
    venue,
    status,
    marketContext: context,
    sourceUrl: url,
    watchUrl: url,
  }
}

function fallbackMatches(): PolyStreamMatch[] {
  return [
    {
      tag: 'Today',
      title: 'Featured live match window',
      time: 'Live or next',
      venue: 'Provider schedule',
      status: 'Provider pending',
      marketContext: 'Active World Cup match, team momentum, and in-play sentiment markets.',
      sourceUrl: '',
      watchUrl: '',
    },
    {
      tag: 'Results',
      title: 'Post-match reaction watch',
      time: 'Post-match',
      venue: 'Latest completed fixture',
      status: 'Provider pending',
      marketContext: 'Group standings, qualification odds, and next-match repricing markets.',
      sourceUrl: '',
      watchUrl: '',
    },
    {
      tag: 'Fixtures',
      title: 'Upcoming star fixture watch',
      time: 'Upcoming',
      venue: 'World Cup schedule',
      status: 'Provider pending',
      marketContext: 'Outright winner, top scorer, national team, and headline-driven markets.',
      sourceUrl: '',
      watchUrl: '',
    },
  ]
}

async function fetchProviderMatches(): Promise<PolyStreamMatch[]> {
  const apiUrl = envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL')
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
  } else if (apiKey) {
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
    if (providerErrors && JSON.stringify(providerErrors) !== '[]' && JSON.stringify(providerErrors) !== '{}') {
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

  const providerConfigured = Boolean(envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL'))
  try {
    const providerMatches = await fetchProviderMatches()
    const matches = providerMatches.length ? providerMatches : fallbackMatches()
    lastProviderError = providerConfigured && !providerMatches.length ? 'Provider returned no normalized matches.' : ''
    const feed = {
      ok: true as const,
      providerConfigured,
      source: providerMatches.length ? envValue('POLY_STREAM_PROVIDER', 'SPORTS_PROVIDER') || 'provider' : 'fallback',
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

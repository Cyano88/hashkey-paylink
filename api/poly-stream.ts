import type { Request, Response } from 'express'

type ProviderMatch = Record<string, unknown>

type ScoreMatch = {
  tag: string
  title: string
  time: string
  venue: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  marketContext: string
  sourceUrl: string
  polymarketUrl?: string
}

type ScoreFeed = {
  ok: true
  providerConfigured: boolean
  source: string
  providerStatus: string
  updatedAt: string
  matches: ScoreMatch[]
}

type CacheEntry = {
  expiresAt: number
  feed: ScoreFeed
}

type FixtureMode = 'auto' | 'live' | 'next' | 'last'

const DEFAULT_CACHE_MS = 60 * 1000
const DEFAULT_SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'
const DEFAULT_API_FOOTBALL_BASE = 'https://v3.football.api-sports.io'

let cache: CacheEntry | null = null
let lastProviderError = ''

function envValue(primary: string, fallback = '') {
  return process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() || '' : '')
}

function providerName() {
  return (envValue('POLY_STREAM_PROVIDER', 'SPORTS_PROVIDER') || 'sportmonks').toLowerCase()
}

function fixtureMode(): FixtureMode {
  const mode = process.env.POLY_STREAM_FIXTURE_MODE?.trim().toLowerCase()
  return mode === 'live' || mode === 'next' || mode === 'last' ? mode : 'auto'
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asScore(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function safeProviderMessage(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 260)
}

function configuredPolymarketUrls() {
  const raw = process.env.POLYMARKET_MATCH_URLS?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch (_err) {
    return {}
  }
}

function exactPolymarketUrl(title: string, ids: string[] = []) {
  const urls = configuredPolymarketUrls()
  const keys = [title, title.toLowerCase(), ...ids.filter(Boolean)]
  for (const key of keys) {
    const direct = urls[key]
    if (typeof direct === 'string' && direct.trim()) return direct.trim()
  }
  return ''
}

function extractArray(payload: unknown): ProviderMatch[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as ProviderMatch[]
  const data = asRecord(payload)
  for (const key of ['data', 'response', 'matches', 'fixtures', 'events', 'results']) {
    const value = data[key]
    if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as ProviderMatch[]
  }
  return []
}

function readableTime(value: string) {
  if (!value) return 'Schedule pending'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ts))
}

function tagFor(status: string, date: string) {
  const text = status.toLowerCase()
  if (/(live|1h|2h|ht|et|inplay|in play|in-play|break)/.test(text)) return 'Live'
  if (/(ft|aet|pen|finished|complete|ended|after extra time)/.test(text)) return 'Result'
  if (date) {
    const ts = Date.parse(date)
    if (Number.isFinite(ts)) {
      const hours = (ts - Date.now()) / 36e5
      if (hours >= 0 && hours <= 24) return 'Today'
    }
  }
  return 'Fixture'
}

function sportmonksParticipantName(match: ProviderMatch, location: 'home' | 'away') {
  const participants = Array.isArray(match.participants) ? match.participants : []
  const found = participants.find(item => {
    const record = asRecord(item)
    const meta = asRecord(record.meta)
    return asString(meta.location).toLowerCase() === location
  })
  return asString(asRecord(found).name)
}

function sportmonksScore(match: ProviderMatch, location: 'home' | 'away') {
  const scores = Array.isArray(match.scores) ? match.scores : []
  const current = scores.find(item => {
    const record = asRecord(item)
    const participant = asString(record.score?.['participant'] as unknown).toLowerCase()
    const description = asString(record.description).toLowerCase()
    return participant === location && (!description || description.includes('current'))
  }) || scores.find(item => asString(asRecord(item).score?.['participant'] as unknown).toLowerCase() === location)
  const score = asRecord(asRecord(current).score)
  return asScore(score.goals)
}

function normalizeSportmonks(match: ProviderMatch): ScoreMatch | null {
  const home = sportmonksParticipantName(match, 'home')
  const away = sportmonksParticipantName(match, 'away')
  const title = home && away ? `${home} vs ${away}` : asString(match.name)
  if (!title) return null

  const state = asRecord(match.state)
  const status = asString(state.name) || asString(state.short_name) || 'Scheduled'
  const startingAt = asString(match.starting_at)
  const venue = asString(asRecord(match.venue).name) || 'World Cup venue'
  const leagueId = String(match.league_id ?? '')
  const fixtureId = String(match.id ?? '')
  const clock = asString(match.minute) || asString(match.periods) || ''

  return {
    tag: tagFor(status, startingAt),
    title,
    time: readableTime(startingAt),
    venue,
    status,
    homeScore: sportmonksScore(match, 'home'),
    awayScore: sportmonksScore(match, 'away'),
    clock,
    marketContext: `${title}. ${status}. Open the exact Polymarket market when mapped, or ask LP Scout to check related match, group, qualification, scorer, and outright books.`,
    sourceUrl: fixtureId ? `https://www.sportmonks.com/football/fixtures/${fixtureId}` : '',
    polymarketUrl: exactPolymarketUrl(title, [`sportmonks:${fixtureId}`, `league:${leagueId}:${home}:${away}`]),
  }
}

function apiFootballTeam(match: ProviderMatch, side: 'home' | 'away') {
  const teams = asRecord(match.teams)
  return asString(asRecord(teams[side]).name)
}

function normalizeApiFootball(match: ProviderMatch): ScoreMatch | null {
  const fixture = asRecord(match.fixture)
  const home = apiFootballTeam(match, 'home')
  const away = apiFootballTeam(match, 'away')
  const title = home && away ? `${home} vs ${away}` : asString(match.title)
  if (!title) return null

  const status = asRecord(fixture.status)
  const goals = asRecord(match.goals)
  const fixtureId = String(fixture.id ?? '')
  const league = asRecord(match.league)
  const leagueId = String(league.id ?? '')
  const date = asString(fixture.date)
  const elapsed = status.elapsed

  return {
    tag: tagFor(asString(status.short) || asString(status.long), date),
    title,
    time: readableTime(date),
    venue: asString(asRecord(fixture.venue).name) || 'World Cup venue',
    status: asString(status.long) || asString(status.short) || 'Scheduled',
    homeScore: asScore(goals.home),
    awayScore: asScore(goals.away),
    clock: typeof elapsed === 'number' ? `${elapsed}'` : '',
    marketContext: `${title}. ${asString(status.long) || 'Scheduled'}. Open the exact Polymarket market when mapped, or ask LP Scout for paid book checks.`,
    sourceUrl: '',
    polymarketUrl: exactPolymarketUrl(title, [`api-football:${fixtureId}`, `league:${leagueId}:${home}:${away}`]),
  }
}

function apiFootballUrls(mode: FixtureMode) {
  const explicit = envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL')
  if (explicit) return [explicit]
  const league = process.env.POLY_STREAM_LEAGUE_ID?.trim() || '1'
  const season = process.env.POLY_STREAM_SEASON?.trim() || '2026'
  const url = new URL(`${DEFAULT_API_FOOTBALL_BASE}/fixtures`)
  url.searchParams.set('league', league)
  url.searchParams.set('season', season)
  if (mode === 'live' || mode === 'auto') url.searchParams.set('live', 'all')
  if (mode === 'next') url.searchParams.set('next', process.env.POLY_STREAM_LIMIT?.trim() || '12')
  if (mode === 'last') url.searchParams.set('last', process.env.POLY_STREAM_LIMIT?.trim() || '12')
  return [url.toString()]
}

function isoDate(offsetDays = 0) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function sportmonksUrls(mode: FixtureMode) {
  const explicit = envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL')
  if (explicit) return [explicit]
  const league = process.env.POLY_STREAM_LEAGUE_ID?.trim() || '732'
  const base = process.env.POLY_STREAM_BASE_URL?.trim() || DEFAULT_SPORTMONKS_BASE
  const include = 'participants;state;scores;venue;league'
  const withCommonParams = (path: string) => {
    const url = new URL(`${base}${path}`)
    url.searchParams.set('include', include)
    url.searchParams.set('filters', `fixtureLeagues:${league}`)
    return url.toString()
  }
  if (mode === 'live') return [withCommonParams('/livescores/inplay')]
  if (mode === 'last') return [withCommonParams('/fixtures/latest')]
  return [
    withCommonParams('/fixtures/upcoming'),
    withCommonParams(`/fixtures/between/${isoDate(0)}/${isoDate(21)}`),
  ]
}

async function fetchProviderMode(provider: string, apiKey: string, mode: FixtureMode): Promise<ScoreMatch[]> {
  const urls = provider === 'api-football' || provider === 'api-sports' ? apiFootballUrls(mode) : sportmonksUrls(mode)
  const results: ScoreMatch[] = []
  let lastError = ''
  for (const url of urls) {
    try {
      const matches = await fetchProviderUrl(provider, apiKey, url)
      if (matches.length) results.push(...matches)
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Score provider failed.'
    }
  }
  if (!results.length && lastError) throw new Error(lastError)
  return results.slice(0, Number(process.env.POLY_STREAM_LIMIT?.trim() || 12))
}

async function fetchProviderUrl(provider: string, apiKey: string, url: string): Promise<ScoreMatch[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (provider === 'api-football' || provider === 'api-sports') headers['x-apisports-key'] = apiKey

  const requestUrl = new URL(url)
  if (provider !== 'api-football' && provider !== 'api-sports' && !requestUrl.searchParams.has('api_token')) {
    requestUrl.searchParams.set('api_token', apiKey)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(requestUrl, { headers, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`Score provider returned ${response.status}: ${safeProviderMessage(text)}`)
    const payload = JSON.parse(text)
    const providerErrors = asRecord(payload).errors
    if ((provider === 'api-football' || provider === 'api-sports') && providerErrors && JSON.stringify(providerErrors) !== '[]' && JSON.stringify(providerErrors) !== '{}') {
      throw new Error(`Score provider error: ${safeProviderMessage(providerErrors)}`)
    }
    const matches = extractArray(payload)
    const normalized = matches
      .map(match => provider === 'api-football' || provider === 'api-sports' ? normalizeApiFootball(match) : normalizeSportmonks(match))
      .filter(Boolean) as ScoreMatch[]
    return normalized
  } finally {
    clearTimeout(timeout)
  }
}

function dedupeMatches(matches: ScoreMatch[]) {
  const seen = new Set<string>()
  return matches.filter(match => {
    const key = `${match.title.toLowerCase()}|${match.time}|${match.status.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchRank(match: ScoreMatch) {
  if (match.tag === 'Live') return 0
  if (match.tag === 'Today') return 1
  if (match.tag === 'Fixture') return 2
  if (match.tag === 'Result') return 3
  return 4
}

async function fetchProviderMatches(): Promise<ScoreMatch[]> {
  const provider = providerName()
  const apiKey = envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY')
  if (!apiKey) return []

  const mode = fixtureMode()
  const modes: FixtureMode[] = mode === 'auto' ? ['live', 'next'] : [mode]
  const batches = await Promise.all(modes.map(current => fetchProviderMode(provider, apiKey, current).catch(err => {
    lastProviderError = err instanceof Error ? err.message : 'Score provider failed.'
    return [] as ScoreMatch[]
  })))
  return dedupeMatches(batches.flat())
    .sort((a, b) => matchRank(a) - matchRank(b))
    .slice(0, Number(process.env.POLY_STREAM_LIMIT?.trim() || 12))
}

export default async function polyStreamHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const cacheMs = Number(envValue('POLY_STREAM_CACHE_MS', 'SPORTS_CACHE_MS') || DEFAULT_CACHE_MS)
  const ttl = Number.isFinite(cacheMs) && cacheMs > 0 ? cacheMs : DEFAULT_CACHE_MS
  if (cache && cache.expiresAt > Date.now()) return res.json(req.query.debug === '1' ? { ...cache.feed, providerError: lastProviderError } : cache.feed)

  const provider = providerName()
  const providerConfigured = Boolean(envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY'))

  try {
    const matches = providerConfigured ? await fetchProviderMatches() : []
    lastProviderError = providerConfigured && !matches.length ? 'Provider returned no live or upcoming World Cup matches.' : ''
    const feed: ScoreFeed = {
      ok: true,
      providerConfigured,
      source: providerConfigured ? provider : 'not_configured',
      providerStatus: matches.length ? 'connected' : providerConfigured ? 'empty' : 'not_configured',
      updatedAt: new Date().toISOString(),
      matches,
    }
    cache = { expiresAt: Date.now() + ttl, feed }
    return res.json(req.query.debug === '1' ? { ...feed, providerError: lastProviderError } : feed)
  } catch (err) {
    lastProviderError = err instanceof Error ? err.message : 'Score provider failed.'
    const feed: ScoreFeed = {
      ok: true,
      providerConfigured,
      source: provider || 'provider',
      providerStatus: 'error',
      updatedAt: new Date().toISOString(),
      matches: [],
    }
    cache = { expiresAt: Date.now() + Math.min(ttl, 60_000), feed }
    return res.json(req.query.debug === '1' ? { ...feed, providerError: lastProviderError } : feed)
  }
}

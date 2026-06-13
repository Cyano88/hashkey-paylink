import type { Request, Response } from 'express'

type ProviderMatch = Record<string, unknown>

type ScoreMatch = {
  fixtureId?: string
  tag: string
  title: string
  time: string
  kickoffAt?: string
  venue: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  homeCoach?: string
  awayCoach?: string
  probability?: string
  homeMarketPrice?: string
  awayMarketPrice?: string
  drawMarketPrice?: string
  polymarketTitle?: string
  polymarketLiquidity?: string
  polymarketVolume?: string
  goalScorers?: string[]
  weather?: string
  h2h?: string
  form?: string
  events?: string[]
  stats?: string[]
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

function asText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asScore(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,%]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
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

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (_err) {
    return []
  }
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

function compactName(value: unknown) {
  const record = asRecord(value)
  const nested = asRecord(record.data)
  return asString(record.display_name)
    || asString(record.name)
    || asString(record.common_name)
    || asString(nested.display_name)
    || asString(nested.name)
    || asString(nested.common_name)
}

function sportmonksCoach(match: ProviderMatch, location: 'home' | 'away') {
  const coaches = Array.isArray(match.coaches) ? match.coaches : []
  const found = coaches.find(item => {
    const record = asRecord(item)
    const meta = asRecord(record.meta)
    return asString(meta.location).toLowerCase() === location
  })
  return compactName(found)
}

function sportmonksEvents(match: ProviderMatch) {
  const events = Array.isArray(match.events) ? match.events : []
  return events.slice(0, 6).map(item => {
    const record = asRecord(item)
    const type = asString(asRecord(record.type).name)
      || asString(asRecord(record.type).code)
      || asString(record.type_name)
      || asString(record.type)
      || asText(record.info)
      || (record.type_id !== undefined ? `Type ${asText(record.type_id)}` : 'Event')
    const period = asRecord(record.period)
    const minute = asText(record.minute) || asText(record.period_minute) || asText(period.minute) || asText(period.minutes)
    const player = compactName(record.player) || asString(record.player_name) || asString(record.related_player_name)
    const team = asString(record.participant_name) || compactName(record.participant) || sportmonksParticipantById(match, record.participant_id)
    return [minute ? `${minute}'` : '', type, player, team].filter(Boolean).join(' ')
  }).filter(Boolean)
}

function sportmonksParticipantById(match: ProviderMatch, participantId: unknown) {
  if (participantId === undefined || participantId === null) return ''
  const participants = Array.isArray(match.participants) ? match.participants : []
  const found = participants.find(item => String(asRecord(item).id ?? '') === String(participantId))
  return compactName(found)
}

function sportmonksGoalScorers(match: ProviderMatch) {
  const events = Array.isArray(match.events) ? match.events : []
  return events.map(item => {
    const record = asRecord(item)
    const type = [
      asString(asRecord(record.type).name),
      asString(asRecord(record.type).code),
      asString(record.type_name),
      asString(record.type),
      asText(record.info),
    ].join(' ').toLowerCase()
    if (!/\bgoal\b|own goal|penalty scored/.test(type)) return ''
    const period = asRecord(record.period)
    const minute = asText(record.minute) || asText(record.period_minute) || asText(period.minute) || asText(period.minutes)
    const player = compactName(record.player) || asString(record.player_name) || asString(record.related_player_name)
    const team = asString(record.participant_name) || compactName(record.participant) || sportmonksParticipantById(match, record.participant_id)
    return [minute ? `${minute}'` : '', player, team].filter(Boolean).join(' ')
  }).filter(Boolean).slice(0, 8)
}

function sportmonksStats(match: ProviderMatch) {
  const stats = Array.isArray(match.statistics) ? match.statistics : []
  return stats.slice(0, 6).map(item => {
    const record = asRecord(item)
    const type = asString(asRecord(record.type).name) || asString(record.type) || asString(record.type_name)
    const value = asText(record.value)
    const team = asString(record.participant_name) || compactName(record.participant)
    return [team, type, value].filter(Boolean).join(' ')
  }).filter(Boolean)
}

function sportmonksWeather(match: ProviderMatch) {
  const weather = asRecord(match.weatherReport ?? match.weather_report ?? match.weather)
  const description = asString(weather.description) || asString(weather.type) || asString(weather.condition)
  const temp = asText(weather.temperature ?? weather.temp)
  return [description, temp ? `${temp}` : ''].filter(Boolean).join(' ')
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
  const periods = Array.isArray(match.periods) ? match.periods.map(asRecord) : []
  const latestPeriod = periods.slice().reverse().find(record => asText(record.minutes) || asText(record.minute))
  const clockValue = asText(match.minute)
    || asText(asRecord(match.state).minutes)
    || asText(latestPeriod?.minutes)
    || asText(latestPeriod?.minute)
  const clock = clockValue ? `${clockValue}'` : ''

  return {
    fixtureId,
    tag: tagFor(status, startingAt),
    title,
    time: readableTime(startingAt),
    kickoffAt: startingAt,
    venue,
    status,
    homeScore: sportmonksScore(match, 'home'),
    awayScore: sportmonksScore(match, 'away'),
    clock,
    homeCoach: sportmonksCoach(match, 'home'),
    awayCoach: sportmonksCoach(match, 'away'),
    goalScorers: sportmonksGoalScorers(match),
    events: sportmonksEvents(match),
    stats: sportmonksStats(match),
    weather: sportmonksWeather(match),
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
    fixtureId,
    tag: tagFor(asString(status.short) || asString(status.long), date),
    title,
    time: readableTime(date),
    kickoffAt: date,
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

function sportmonksUrls(mode: FixtureMode, baseOnly = false) {
  const explicit = envValue('POLY_STREAM_API_URL', 'SPORTS_API_URL')
  if (explicit) return [explicit]
  const league = process.env.POLY_STREAM_LEAGUE_ID?.trim() || '732'
  const base = process.env.POLY_STREAM_BASE_URL?.trim() || DEFAULT_SPORTMONKS_BASE
  const baseInclude = 'participants;state;scores;venue;league'
  const liveInclude = process.env.POLY_STREAM_LIVE_INCLUDE?.trim() || 'participants;scores;periods;events;league.country;round'
  const include = baseOnly
    ? baseInclude
    : mode === 'live'
      ? liveInclude
      : process.env.POLY_STREAM_INCLUDE?.trim() || baseInclude
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

function sportmonksFixtureDetailUrl(fixtureId: string) {
  const base = process.env.POLY_STREAM_BASE_URL?.trim() || DEFAULT_SPORTMONKS_BASE
  const include = process.env.POLY_STREAM_DETAIL_INCLUDE?.trim()
    || 'participants;league;venue;state;scores;events.type;events.period;events.player;statistics.type;sidelined.sideline.player;sidelined.sideline.type;weatherReport'
  const url = new URL(`${base}/fixtures/${fixtureId}`)
  url.searchParams.set('include', include)
  return url.toString()
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitFixtureTitle(title: string) {
  if (!title.includes(' vs ')) return [title.trim(), ''] as const
  const [home, away] = title.split(' vs ', 2)
  return [home.trim(), away.trim()] as const
}

function candidateText(candidate: ProviderMatch) {
  const market = asRecord(candidate)
  const markets = parseJsonArray(market.markets)
  const nestedMarket = asRecord(markets[0])
  return [
    asString(market.title),
    asString(market.question),
    asString(market.slug),
    asString(market.ticker),
    asString(nestedMarket.question),
    asString(nestedMarket.title),
    asString(nestedMarket.slug),
  ].filter(Boolean).join(' ')
}

const TEAM_ALIASES: Record<string, string[]> = {
  'united states': ['usa', 'usmnt', 'u s a', 'united states'],
  usa: ['united states', 'usmnt', 'u s a', 'usa'],
  switzerland: ['switzerland', 'swiss', 'che'],
  qatar: ['qatar', 'qat'],
  turkey: ['turkey', 'turkiye', 'türkiye'],
  turkiye: ['turkey', 'turkiye', 'türkiye'],
  'cote divoire': ['cote divoire', 'cote d ivoire', 'ivory coast'],
  'ivory coast': ['cote divoire', 'cote d ivoire', 'ivory coast'],
  'cape verde': ['cape verde', 'cape verde islands'],
  germany: ['germany', 'deutschland'],
  netherlands: ['netherlands', 'holland'],
  south korea: ['south korea', 'korea republic', 'republic of korea'],
}

function teamSearchTerms(name: string) {
  const normalized = normalizeSearchText(name)
  const aliases = TEAM_ALIASES[normalized] || []
  return Array.from(new Set([normalized, ...aliases.map(normalizeSearchText)])).filter(Boolean)
}

function isClosedMarket(candidate: ProviderMatch) {
  const record = asRecord(candidate)
  if (record.closed === true || record.archived === true) return true
  if (record.active === false) return true
  return false
}

function scorePolymarketCandidate(candidate: ProviderMatch, home: string, away: string) {
  const text = normalizeSearchText(candidateText(candidate))
  const homeTerms = teamSearchTerms(home)
  const awayTerms = teamSearchTerms(away)
  if (!homeTerms.length || !awayTerms.length) return 0
  const hasHome = homeTerms.some(term => text.includes(term))
  const hasAway = awayTerms.some(term => text.includes(term))
  if (!hasHome || !hasAway) return 0
  let score = 50
  if (/\bworld cup\b|\bfifa\b|\b2026\b/.test(text)) score += 18
  if (/\bvs\b|\bv\b|\bversus\b|\bbeat\b|\bwin\b/.test(text)) score += 8
  if (/winner|match|game|group|advance|qualif|score/.test(text)) score += 6
  if (isClosedMarket(candidate)) score -= 40
  return score
}

function hasWorldCupSeries(candidate: ProviderMatch) {
  const record = asRecord(candidate)
  const direct = asString(record.seriesSlug) || asString(record.series_slug)
  if (direct === 'soccer-fifwc') return true
  const series = Array.isArray(record.series) ? record.series : []
  return series.some(item => {
    const seriesRecord = asRecord(item)
    return asString(seriesRecord.slug) === 'soccer-fifwc' || asString(seriesRecord.ticker) === 'soccer-fifwc'
  })
}

function readMarketSlug(candidate: ProviderMatch) {
  const record = asRecord(candidate)
  const markets = parseJsonArray(record.markets)
  const nested = asRecord(markets[0])
  return asString(record.slug) || asString(nested.slug)
}

function readPolymarketUrl(candidate: ProviderMatch, kind: 'event' | 'market') {
  const record = asRecord(candidate)
  const directUrl = asString(record.marketUrl) || asString(record.url)
  if (directUrl.startsWith('https://polymarket.com/')) return directUrl
  const slug = readMarketSlug(candidate)
  if (slug && kind === 'event' && hasWorldCupSeries(candidate)) return `https://polymarket.com/sports/world-cup/${slug}`
  return slug ? `https://polymarket.com/${kind}/${slug}` : ''
}

function formatUsd(value: unknown) {
  const num = asNumber(value)
  if (num === undefined) return ''
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}k`
  return `$${num.toFixed(0)}`
}

function marketArray(candidate: ProviderMatch) {
  const record = asRecord(candidate)
  const markets = parseJsonArray(record.markets)
  if (markets.length) return markets.map(asRecord)
  return [record]
}

function readMarketOutcomePrice(market: ProviderMatch) {
  const outcomes = parseJsonArray(market.outcomes).map(value => String(value))
  const prices = parseJsonArray(market.outcomePrices).map(asNumber)
  if (outcomes.length && prices.length) {
    const pairs = outcomes
      .map((outcome, index) => ({ outcome, price: prices[index] }))
      .filter(item => item.price !== undefined)
    const yesPrice = pairs.find(item => /^yes$/i.test(item.outcome))?.price
    if (yesPrice !== undefined) return yesPrice
    return pairs[0]?.price
  }
  const lastTrade = asNumber(market.lastTradePrice ?? market.last_trade_price)
  if (lastTrade !== undefined) return lastTrade
  return undefined
}

function polymarketPriceSummary(candidate: ProviderMatch, home: string, away: string) {
  const markets = marketArray(candidate)
  const homeTerms = teamSearchTerms(home)
  const awayTerms = teamSearchTerms(away)
  const priceFor = (terms: string[]) => {
    const market = markets.find(item => {
      const text = normalizeSearchText([
        asString(item.groupItemTitle),
        asString(item.group_item_title),
        asString(item.question),
        asString(item.title),
        asString(item.slug),
      ].filter(Boolean).join(' '))
      return terms.some(term => text.includes(term))
    })
    const price = market ? readMarketOutcomePrice(market) : undefined
    return price !== undefined ? `${(price * 100).toFixed(0)}%` : ''
  }
  const homePrice = priceFor(homeTerms)
  const awayPrice = priceFor(awayTerms)
  const drawMarket = markets.find(item => /\bdraw\b|\btie\b/.test(normalizeSearchText([
    asString(item.groupItemTitle),
    asString(item.group_item_title),
    asString(item.question),
    asString(item.title),
  ].filter(Boolean).join(' '))))
  const drawPrice = drawMarket ? readMarketOutcomePrice(drawMarket) : undefined
  const drawLabel = drawPrice !== undefined ? `${(drawPrice * 100).toFixed(0)}%` : ''
  const parts = [
    homePrice ? `${home} ${homePrice}` : '',
    drawLabel ? `Draw ${drawLabel}` : '',
    awayPrice ? `${away} ${awayPrice}` : '',
  ].filter(Boolean)
  if (parts.length) {
    return {
      summary: parts.join(' / '),
      home: homePrice,
      away: awayPrice,
      draw: drawLabel,
    }
  }

  const firstPrice = readMarketOutcomePrice(markets[0] || {})
  if (firstPrice !== undefined) {
    const yes = `${(firstPrice * 100).toFixed(0)}%`
    return { summary: `YES ${yes}`, home: '', away: '', draw: '' }
  }
  return { summary: '', home: '', away: '', draw: '' }
}

async function fetchPolymarketJson(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) return []
    const payload = await response.json()
    return extractArray(payload)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPolymarketWorldCupEvents() {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: process.env.POLYMARKET_WORLD_CUP_LIMIT?.trim() || '100',
    series_slug: 'soccer-fifwc',
  })
  return fetchPolymarketJson(`https://gamma-api.polymarket.com/events?${params.toString()}`).catch(() => [])
}

function polymarketMatchFromCandidates(match: ScoreMatch, candidates: Array<{ kind: 'event' | 'market'; item: ProviderMatch }>) {
  const [home, away] = splitFixtureTitle(match.title)
  if (!home || !away) return null
  const ranked = candidates
    .map(candidate => ({ ...candidate, score: scorePolymarketCandidate(candidate.item, home, away) }))
    .filter(candidate => candidate.score >= 50)
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best) return null
  const record = asRecord(best.item)
  const marketsForValues = marketArray(best.item)
  const firstMarket = marketsForValues[0] || {}
  const prices = polymarketPriceSummary(best.item, home, away)
  return {
    title: asString(record.title) || asString(record.question) || asString(firstMarket.question) || asString(firstMarket.title),
    url: readPolymarketUrl(best.item, best.kind),
    probability: prices.summary,
    homeMarketPrice: prices.home,
    awayMarketPrice: prices.away,
    drawMarketPrice: prices.draw,
    liquidity: formatUsd(record.liquidity ?? record.liquidityNum ?? firstMarket.liquidity ?? firstMarket.liquidityNum),
    volume: formatUsd(record.volume ?? record.volumeNum ?? record.volume24hr ?? firstMarket.volume ?? firstMarket.volumeNum),
  }
}

async function findPolymarketMatch(match: ScoreMatch) {
  const [home, away] = splitFixtureTitle(match.title)
  if (!home || !away) return null
  const query = `${home} ${away} World Cup`
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: process.env.POLYMARKET_LOOKUP_LIMIT?.trim() || '20',
    search: query,
  })
  const [events, markets] = await Promise.all([
    fetchPolymarketJson(`https://gamma-api.polymarket.com/events?${params.toString()}`).catch(() => []),
    fetchPolymarketJson(`https://gamma-api.polymarket.com/markets?${params.toString()}`).catch(() => []),
  ])
  return polymarketMatchFromCandidates(match, [
    ...events.map(item => ({ kind: 'event' as const, item })),
    ...markets.map(item => ({ kind: 'market' as const, item })),
  ])
}

async function enrichMatchesWithPolymarket(matches: ScoreMatch[]) {
  if (process.env.POLYMARKET_MARKET_LOOKUP?.trim() === '0') return matches
  const worldCupEvents = await fetchPolymarketWorldCupEvents()
  const worldCupCandidates = worldCupEvents.map(item => ({ kind: 'event' as const, item }))
  const enriched = await Promise.all(matches.map(async match => {
    if (match.polymarketUrl) return match
    const found = polymarketMatchFromCandidates(match, worldCupCandidates) || await findPolymarketMatch(match).catch(() => null)
    if (!found?.url) return match
    return {
      ...match,
      polymarketUrl: found.url,
      polymarketTitle: found.title,
      probability: found.probability,
      homeMarketPrice: found.homeMarketPrice,
      awayMarketPrice: found.awayMarketPrice,
      drawMarketPrice: found.drawMarketPrice,
      polymarketLiquidity: found.liquidity,
      polymarketVolume: found.volume,
    }
  }))
  return enriched
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
  if (!results.length && lastError && provider !== 'api-football' && provider !== 'api-sports') {
    for (const url of sportmonksUrls(mode, true)) {
      try {
        const matches = await fetchProviderUrl(provider, apiKey, url)
        if (matches.length) results.push(...matches)
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Score provider failed.'
      }
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

async function fetchSportmonksFixtureDetail(apiKey: string, fixtureId: string) {
  const requestUrl = new URL(sportmonksFixtureDetailUrl(fixtureId))
  if (!requestUrl.searchParams.has('api_token')) requestUrl.searchParams.set('api_token', apiKey)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(requestUrl, { headers: { Accept: 'application/json' }, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`Score provider returned ${response.status}: ${safeProviderMessage(text)}`)
    const payload = JSON.parse(text)
    const data = asRecord(payload).data
    const detail = Array.isArray(data) ? data[0] : data
    return normalizeSportmonks(asRecord(detail))
  } finally {
    clearTimeout(timeout)
  }
}

function shouldFetchSportmonksDetail(match: ScoreMatch) {
  const status = match.status.toLowerCase()
  if (!match.fixtureId) return false
  if (status.includes('full') || status.includes('after') || status.includes('live') || status.includes('half') || status.includes('progress')) return true
  if ((match.events?.length || 0) > 0 || (match.stats?.length || 0) > 0) return false
  return match.tag === 'Today'
}

async function enrichSportmonksDetails(matches: ScoreMatch[], apiKey: string) {
  const limit = Number(process.env.POLY_STREAM_DETAIL_LIMIT?.trim() || 6)
  if (!Number.isFinite(limit) || limit <= 0) return matches

  const ids = matches
    .filter(shouldFetchSportmonksDetail)
    .map(match => match.fixtureId)
    .filter(Boolean)
    .slice(0, limit) as string[]
  if (!ids.length) return matches

  const detailPairs = await Promise.all(ids.map(async id => {
    const detail = await fetchSportmonksFixtureDetail(apiKey, id).catch(() => null)
    return [id, detail] as const
  }))
  const details = new Map(detailPairs.filter(([, detail]) => detail).map(([id, detail]) => [id, detail as ScoreMatch]))
  return matches.map(match => {
    const detail = match.fixtureId ? details.get(match.fixtureId) : null
    if (!detail) return match
    return {
      ...match,
      ...detail,
      polymarketUrl: match.polymarketUrl || detail.polymarketUrl,
      polymarketTitle: match.polymarketTitle || detail.polymarketTitle,
      polymarketLiquidity: match.polymarketLiquidity || detail.polymarketLiquidity,
      polymarketVolume: match.polymarketVolume || detail.polymarketVolume,
      probability: match.probability || detail.probability,
    }
  })
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
  const modes: FixtureMode[] = mode === 'auto' ? ['live', 'next', 'last'] : [mode]
  const batches = await Promise.all(modes.map(current => fetchProviderMode(provider, apiKey, current).catch(err => {
    lastProviderError = err instanceof Error ? err.message : 'Score provider failed.'
    return [] as ScoreMatch[]
  })))
  const matches = dedupeMatches(batches.flat())
    .sort((a, b) => matchRank(a) - matchRank(b))
    .slice(0, Number(process.env.POLY_STREAM_LIMIT?.trim() || 12))
  const detailedMatches = provider === 'api-football' || provider === 'api-sports'
    ? matches
    : await enrichSportmonksDetails(matches, apiKey)
  return enrichMatchesWithPolymarket(detailedMatches)
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

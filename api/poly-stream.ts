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
  polymarketTradeOptions?: PolymarketTradeOption[]
  goalScorers?: string[]
  weather?: string
  h2h?: string
  form?: string
  events?: string[]
  stats?: string[]
  marketStatus?: 'matched' | 'pending'
  marketContext: string
  sourceUrl: string
  polymarketUrl?: string
}

type PolymarketTradeOption = {
  label: string
  outcome: 'home' | 'draw' | 'away'
  tokenId: string
  price?: string
  conditionId?: string
  tickSize?: number
  minSize?: number
  negRisk?: boolean
}

type ScoreFeed = {
  ok: true
  providerConfigured: boolean
  source: string
  providerStatus: string
  selectedDate: string
  displayDate: string
  updatedAt: string
  matches: ScoreMatch[]
}

type CacheEntry = {
  expiresAt: number
  feed: ScoreFeed
}

type FixtureMode = 'auto' | 'live' | 'next' | 'last'

const DEFAULT_FIXTURE_LIMIT = 64
const DEFAULT_SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'
const DEFAULT_API_FOOTBALL_BASE = 'https://v3.football.api-sports.io'
const DEFAULT_WORLD_CUP_START_DATE = '2026-06-11'
const DEFAULT_FANVIBE_WORLD_CUP_FEED_URL = 'https://xcup-fanvibe-production.up.railway.app/worldcup/feed'

let cache: CacheEntry | null = null
let lastProviderError = ''
let lastProviderSource = ''

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

function fixtureLimit() {
  const configured = Number(process.env.POLY_STREAM_LIMIT?.trim())
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_FIXTURE_LIMIT
  return Math.max(DEFAULT_FIXTURE_LIMIT, Math.floor(configured))
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDateKey(value: unknown) {
  const text = asString(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

function requestDate(req: Request) {
  const value = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date
  return normalizeDateKey(value) || todayKey()
}

function matchDateKey(match: ScoreMatch) {
  const timestamp = Date.parse(match.kickoffAt || match.time)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ''
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
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (text && text.toLowerCase() !== 'undefined' && text.toLowerCase() !== 'null') return text
  }
  return undefined
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

function isExactScoreMarketText(value: string) {
  const text = normalizeSearchText(value)
  return /\bexact score\b|\bcorrect score\b|\bexact-score\b|\bcorrect-score\b|\bfirst team to score\b|\bfirst to score\b|\bteam to score first\b|\bgoalscorer\b|\bfirst goalscorer\b|\btotal goals\b|\bboth teams to score\b|\bhandicap\b|\bcorner\b|\bcard market\b/.test(text)
}

function isAllowedPolymarketMatchUrl(value: string) {
  const url = value.trim()
  if (!url.startsWith('https://polymarket.com/')) return false
  if (isExactScoreMarketText(url)) return false
  if (process.env.POLYMARKET_ALLOW_GENERIC_URLS?.trim() === '1') return true
  return /^https:\/\/polymarket\.com\/sports\/world-cup\/[a-z0-9-]+\/?$/i.test(url)
}

function exactPolymarketUrl(title: string, ids: string[] = []) {
  const urls = configuredPolymarketUrls()
  const keys = [title, title.toLowerCase(), ...ids.filter(Boolean)]
  for (const key of keys) {
    const direct = urls[key]
    if (typeof direct === 'string' && isAllowedPolymarketMatchUrl(direct)) return direct.trim()
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

function utcDateString(value: unknown) {
  const text = asString(value)
  if (!text) return ''
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return `${text.replace(' ', 'T')}Z`
  return text
}

function tagFor(status: string, date: string) {
  const text = status.toLowerCase()
  if (/(live|1h|2h|1st|2nd|first half|second half|half|ht|et|inplay|in play|in-play|break)/.test(text)) return 'Live'
  if (/(ft|full time|full-time|aet|pen|finished|complete|ended|after extra time)/.test(text)) return 'Result'
  if (date) {
    const ts = Date.parse(date)
    if (Number.isFinite(ts)) {
      const hours = (ts - Date.now()) / 36e5
      if (hours >= 0 && hours <= 24) return 'Today'
    }
  }
  return 'Fixture'
}

function shouldExposeScore(status: string) {
  return /(live|1h|2h|1st|2nd|first half|second half|half|ht|et|inplay|in play|in-play|break|ft|full time|full-time|aet|pen|finished|complete|ended|after extra time)/i.test(status)
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
    const score = asRecord(record.score)
    const participant = asString(score.participant).toLowerCase()
    const description = asString(record.description).toLowerCase()
    return participant === location && description === 'current'
  }) || scores.find(item => {
    const record = asRecord(item)
    const score = asRecord(record.score)
    return asString(score.participant).toLowerCase() === location
  })
  const score = asRecord(asRecord(current).score)
  return asScore(score.goals)
}

function sportmonksEventScore(match: ProviderMatch) {
  const events = Array.isArray(match.events) ? match.events.map(asRecord) : []
  const home = sportmonksParticipantName(match, 'home').toLowerCase()
  const away = sportmonksParticipantName(match, 'away').toLowerCase()
  const scoredEvents = events
    .map((record, index) => {
      const result = asText(record.result)
      const matchResult = result.match(/^(\d+)\s*-\s*(\d+)$/)
      if (!matchResult) return null
      const minute = asNumber(record.minute) ?? asNumber(record.sort_order) ?? index
      return {
        home: Number(matchResult[1]),
        away: Number(matchResult[2]),
        minute,
        index,
      }
    })
    .filter((value): value is { home: number; away: number; minute: number; index: number } => Boolean(value))
    .sort((a, b) => a.minute - b.minute || a.index - b.index)
  const latest = scoredEvents.at(-1)
  if (latest) return { home: latest.home, away: latest.away }

  const totals = { home: 0, away: 0 }
  for (const event of events) {
    const type = sportmonksEventType(event).toLowerCase()
    if (!/\b14\b|\b15\b|\b16\b|\bgoal\b|own goal|penalty scored/.test(type)) continue
    const eventTeam = (asString(event.participant_name) || compactName(event.participant) || sportmonksParticipantById(match, event.participant_id)).toLowerCase()
    const location = sportmonksParticipantLocation(match, event.participant_id)
      || (eventTeam && eventTeam === home ? 'home' : '')
      || (eventTeam && eventTeam === away ? 'away' : '')
    if (location === 'home' || location === 'away') totals[location] += 1
  }
  return totals.home || totals.away ? totals : null
}

function sportmonksEventType(record: ProviderMatch) {
  const typeId = Number(record.type_id)
  if (typeId === 14) return 'Goal'
  if (typeId === 15) return 'Own Goal'
  if (typeId === 16) return 'Penalty'
  if (typeId === 18) return 'Substitution'
  if (typeId === 19) return 'Yellow Card'
  if (typeId === 20) return 'Red Card'
  if (typeId === 21) return 'Yellow Red Card'
  return asString(asRecord(record.type).name)
    || asString(asRecord(record.type).code)
    || asString(record.type_name)
    || asString(record.type)
    || asText(record.addition)
    || asText(record.info)
    || (record.type_id !== undefined ? `Type ${asText(record.type_id)}` : 'Event')
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
  return events.map(item => {
    const record = asRecord(item)
    const type = sportmonksEventType(record)
    if (!/(substitution|yellow|red|card)/i.test(type)) return ''
    const period = asRecord(record.period)
    const minute = asText(record.minute) || asText(record.period_minute) || asText(period.minute) || asText(period.minutes)
    const player = compactName(record.player) || asString(record.player_name) || asString(record.related_player_name)
    const team = asString(record.participant_name) || compactName(record.participant) || sportmonksParticipantById(match, record.participant_id)
    return [minute ? `${minute}'` : '', type, player, team].filter(Boolean).join(' ')
  }).filter(Boolean).slice(0, 16)
}

function sportmonksParticipantById(match: ProviderMatch, participantId: unknown) {
  if (participantId === undefined || participantId === null) return ''
  const participants = Array.isArray(match.participants) ? match.participants : []
  const found = participants.find(item => String(asRecord(item).id ?? '') === String(participantId))
  return compactName(found)
}

function sportmonksParticipantLocation(match: ProviderMatch, participantId: unknown) {
  if (participantId === undefined || participantId === null) return ''
  const participants = Array.isArray(match.participants) ? match.participants : []
  const found = participants.find(item => String(asRecord(item).id ?? '') === String(participantId))
  return asString(asRecord(asRecord(found).meta).location).toLowerCase()
}

function sportmonksGoalScorers(match: ProviderMatch) {
  const events = Array.isArray(match.events) ? match.events : []
  return events.map(item => {
    const record = asRecord(item)
    const type = [
      asText(record.type_id),
      asString(asRecord(record.type).name),
      asString(asRecord(record.type).code),
      asString(record.type_name),
      asString(record.type),
      asText(record.info),
      asText(record.addition),
    ].join(' ').toLowerCase()
    if (!/\b14\b|\b15\b|\bgoal\b|own goal|penalty scored/.test(type)) return ''
    const period = asRecord(record.period)
    const minute = asText(record.minute) || asText(record.period_minute) || asText(period.minute) || asText(period.minutes)
    const player = compactName(record.player) || asString(record.player_name) || asString(record.related_player_name)
    const team = asString(record.participant_name) || compactName(record.participant) || sportmonksParticipantById(match, record.participant_id)
    return [minute ? `${minute}'` : '', player, team].filter(Boolean).join(' ')
  }).filter(Boolean).slice(0, 8)
}

function sportmonksStats(match: ProviderMatch) {
  const stats = Array.isArray(match.statistics) ? match.statistics : []
  return stats.map(item => {
    const record = asRecord(item)
    const type = asString(asRecord(record.type).name) || asString(record.type) || asString(record.type_name)
    const value = asText(record.value)
      || asText(record.data)
      || asText(asRecord(record.data).value)
      || asText(asRecord(record.statistic).value)
      || asText(record.total)
      || asText(record.amount)
    const team = asString(record.participant_name) || compactName(record.participant)
    if (!type || !value) return ''
    return [team, type, value].filter(Boolean).join(' ')
  }).filter(Boolean).slice(0, 6)
}

function publicMarketContext(title: string, status: string) {
  return `${title}. ${status}. Live World Cup board with Polymarket prices when the main match market is confidently matched.`
}

function withMarketStatus(match: ScoreMatch): ScoreMatch {
  return {
    ...match,
    marketStatus: match.polymarketUrl ? 'matched' : 'pending',
  }
}

function sportmonksWeather(match: ProviderMatch) {
  const weather = asRecord(match.weatherReport ?? match.weather_report ?? match.weather)
  const description = asString(weather.description) || asString(weather.type) || asString(weather.condition)
  const temp = asText(weather.temperature ?? weather.temp)
  return [description, temp ? `${temp}` : ''].filter(Boolean).join(' ')
}

function sportmonksClock(match: ProviderMatch) {
  const status = [asString(asRecord(match.state).name), asString(asRecord(match.state).short_name)].join(' ').toLowerCase()
  const isHalfTime = /\b(ht|half time|half-time|break)\b/.test(status)
  const isRegulationState = /(live|inplay|in play|in-play|1h|2h|1st|2nd|first half|second half)/.test(status)
  const isExtraTime = !isRegulationState && (/\b(extra|aet|penalties|penalty shootout|after extra time)\b/.test(status) || /\b(et|aet)\b/.test(status))
  const isLiveRegulation = isRegulationState && !isExtraTime
  if (isHalfTime) return ''
  const normalizeMinute = (value: string | number) => {
    const minute = asNumber(value)
    if (minute === undefined) return ''
    if (minute > 140) return ''
    if (minute > 90 && !isExtraTime) return `90+${Math.min(minute - 90, 15)}'`
    return `${Math.max(0, minute)}'`
  }
  const periods = Array.isArray(match.periods) ? match.periods.map(asRecord) : []
  const tickingPeriod = periods
    .slice()
    .reverse()
    .find(record => record.ticking === true || asString(record.ticking).toLowerCase() === 'true')
  const latestPeriod = tickingPeriod || periods
    .slice()
    .reverse()
    .find(record => asText(record.minutes) || asText(record.minute) || asText(record.started))
  const started = asNumber(latestPeriod?.started)
  const countsFrom = asNumber(latestPeriod?.counts_from) ?? 0
  const ticking = latestPeriod?.ticking === true || asString(latestPeriod?.ticking).toLowerCase() === 'true'
  if (ticking && started) {
    const elapsed = Math.floor((Date.now() / 1000 - started) / 60) + countsFrom
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 140) return normalizeMinute(elapsed)
  }
  const direct = asText(match.minute) || asText(asRecord(match.state).minutes) || asText(asRecord(match.state).minute)
  if (direct) return normalizeMinute(direct)
  const explicit = asText(latestPeriod?.minutes) || asText(latestPeriod?.minute)
  if (explicit) return normalizeMinute(explicit)
  const kickoff = asNumber(match.starting_at_timestamp) || (Date.parse(utcDateString(match.starting_at)) / 1000)
  if (isLiveRegulation && Number.isFinite(kickoff)) {
    const rawElapsed = Math.floor((Date.now() / 1000 - kickoff) / 60)
    const elapsed = rawElapsed > 60 ? rawElapsed - 15 : rawElapsed
    if (elapsed >= 0 && elapsed <= 140) return normalizeMinute(Math.max(1, elapsed))
  }
  return ''
}

function normalizeSportmonks(match: ProviderMatch): ScoreMatch | null {
  const home = sportmonksParticipantName(match, 'home')
  const away = sportmonksParticipantName(match, 'away')
  const title = home && away ? `${home} vs ${away}` : asString(match.name)
  if (!title) return null

  const state = asRecord(match.state)
  const status = asString(state.name) || asString(state.short_name) || 'Scheduled'
  const timestamp = Number(match.starting_at_timestamp)
  const startingAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : utcDateString(match.starting_at)
  const venue = asString(asRecord(match.venue).name) || 'World Cup venue'
  const leagueId = String(match.league_id ?? '')
  const fixtureId = String(match.id ?? '')
  const clock = sportmonksClock(match)
  const eventScore = sportmonksEventScore(match)
  const homeScore = sportmonksScore(match, 'home') ?? eventScore?.home
  const awayScore = sportmonksScore(match, 'away') ?? eventScore?.away
  const exposeScore = shouldExposeScore(status)

  return {
    fixtureId,
    tag: tagFor(status, startingAt),
    title,
    time: readableTime(startingAt),
    kickoffAt: startingAt,
    venue,
    status,
    homeScore: exposeScore ? homeScore : undefined,
    awayScore: exposeScore ? awayScore : undefined,
    clock,
    homeCoach: sportmonksCoach(match, 'home'),
    awayCoach: sportmonksCoach(match, 'away'),
    goalScorers: sportmonksGoalScorers(match),
    events: sportmonksEvents(match),
    stats: sportmonksStats(match),
    weather: sportmonksWeather(match),
    marketContext: publicMarketContext(title, status),
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
  const statusText = asString(status.long) || asString(status.short) || 'Scheduled'
  const exposeScore = shouldExposeScore(statusText)

  return {
    fixtureId,
    tag: tagFor(asString(status.short) || asString(status.long), date),
    title,
    time: readableTime(date),
    kickoffAt: date,
    venue: asString(asRecord(fixture.venue).name) || 'World Cup venue',
    status: statusText,
    homeScore: exposeScore ? asScore(goals.home) : undefined,
    awayScore: exposeScore ? asScore(goals.away) : undefined,
    clock: typeof elapsed === 'number' ? `${elapsed}'` : '',
    marketContext: publicMarketContext(title, asString(status.long) || 'Scheduled'),
    sourceUrl: '',
    polymarketUrl: exactPolymarketUrl(title, [`api-football:${fixtureId}`, `league:${leagueId}:${home}:${away}`]),
  }
}

function fanVibeFeedUrl() {
  return envValue('FANVIBE_WORLD_CUP_FEED_URL') || DEFAULT_FANVIBE_WORLD_CUP_FEED_URL
}

function fanVibeStatusText(fixtureStatus: string, stateStatus: string) {
  const status = (stateStatus || fixtureStatus || 'scheduled').toLowerCase()
  if (/(live|in[- ]?play|1h|2h|first half|second half)/.test(status)) return 'Live'
  if (/(half|halftime|half time|ht)/.test(status)) return 'Half time'
  if (/(finished|settled|result|complete|ended|full time|full-time|ft)/.test(status)) return 'Finished'
  if (/(open|scheduled|fixture|not started|not-started|pending|upcoming)/.test(status)) return 'Scheduled'
  return fixtureStatus || 'Scheduled'
}

function fanVibeTag(status: string, kickoffAt: string) {
  const text = status.toLowerCase()
  if (/(live|half time)/.test(text)) return 'Live'
  if (/(finished|settled|result|complete|ended|full time|full-time|ft)/.test(text)) return 'Result'
  const ts = Date.parse(kickoffAt)
  if (Number.isFinite(ts)) {
    const hours = (ts - Date.now()) / 36e5
    if (hours >= 0 && hours <= 24) return 'Today'
  }
  return 'Fixture'
}

function fanVibeClock(state: ProviderMatch, status: string) {
  if (!/(live|half time)/i.test(status)) return ''
  const minute = asNumber(state.minute)
  if (minute === undefined) return ''
  if (minute > 90) return `90+${Math.min(minute - 90, 15)}'`
  return `${Math.max(0, minute)}'`
}

function fanVibeEventLabel(event: ProviderMatch) {
  const minute = asNumber(event.minute)
  const minuteText = minute === undefined ? '' : minute > 90 ? `90+${Math.min(minute - 90, 15)}'` : `${minute}'`
  const type = asString(event.type)
  const player = asString(event.player)
  const player2 = asString(event.player2)
  const commentary = asString(event.commentary)
  const cleanCommentary = commentary.replace(/^event-\d+\s+/i, '').trim()
  return [minuteText, player || cleanCommentary, player2 ? `(${player2})` : '', type && !/^event-\d+$/i.test(type) ? type : ''].filter(Boolean).join(' ')
}

function fanVibeGoalScorers(events: unknown[]) {
  return events
    .map(asRecord)
    .filter(event => /event-14|goal/i.test(asString(event.type) || asString(event.commentary)))
    .map(fanVibeEventLabel)
    .filter(Boolean)
    .slice(0, 8)
}

function fanVibeEvents(events: unknown[]) {
  return events
    .map(asRecord)
    .map(fanVibeEventLabel)
    .filter(Boolean)
    .slice(0, 16)
}

function normalizeFanVibeFixture(fixture: ProviderMatch, matchStates: Record<string, unknown>): ScoreMatch | null {
  const fixtureId = asString(fixture.id) || asString(fixture.providerId)
  const fixtureProviderId = asString(fixture.providerId)
  const state = asRecord(matchStates[fixtureId] || matchStates[fixtureProviderId])
  const home = asRecord(fixture.home)
  const away = asRecord(fixture.away)
  const homeName = asString(home.name) || asString(home.code)
  const awayName = asString(away.name) || asString(away.code)
  const title = homeName && awayName ? `${homeName} vs ${awayName}` : asString(fixture.title)
  if (!title) return null

  const kickoffAt = utcDateString(fixture.kickoff)
  const status = fanVibeStatusText(asString(fixture.status), asString(state.status))
  const tag = fanVibeTag(status, kickoffAt)
  const events = Array.isArray(state.events) ? state.events : []
  const baseOdds = asRecord(fixture.baseOdds)
  const homeProbability = asNumber(baseOdds.home)
  const drawProbability = asNumber(baseOdds.draw)
  const awayProbability = asNumber(baseOdds.away)
  const homeScore = asScore(state.homeScore)
  const awayScore = asScore(state.awayScore)
  const hasScore = homeScore !== undefined && awayScore !== undefined
  const exposeScore = hasScore && (tag === 'Live' || tag === 'Result' || shouldExposeScore(status))

  return {
    fixtureId,
    tag,
    title,
    time: readableTime(kickoffAt),
    kickoffAt,
    venue: asString(fixture.venue) || 'World Cup venue',
    status,
    homeScore: exposeScore ? homeScore : undefined,
    awayScore: exposeScore ? awayScore : undefined,
    clock: fanVibeClock(state, status),
    probability: [homeProbability !== undefined ? `${homeName} ${Math.round(homeProbability)}%` : '', drawProbability !== undefined ? `Draw ${Math.round(drawProbability)}%` : '', awayProbability !== undefined ? `${awayName} ${Math.round(awayProbability)}%` : ''].filter(Boolean).join(' / '),
    homeMarketPrice: homeProbability !== undefined ? `${Math.round(homeProbability)}%` : '',
    drawMarketPrice: drawProbability !== undefined ? `${Math.round(drawProbability)}%` : '',
    awayMarketPrice: awayProbability !== undefined ? `${Math.round(awayProbability)}%` : '',
    goalScorers: fanVibeGoalScorers(events),
    events: fanVibeEvents(events),
    stats: asNumber(state.possession) !== undefined ? [`Possession ${Math.round(asNumber(state.possession) || 0)}%`] : [],
    marketContext: publicMarketContext(title, status),
    sourceUrl: '',
    polymarketUrl: exactPolymarketUrl(title, [`fanvibe:${fixtureId}`, `sportmonks:${fixtureProviderId}`, `${homeName}:${awayName}`]),
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
  if (mode === 'next') url.searchParams.set('next', String(fixtureLimit()))
  if (mode === 'last') url.searchParams.set('last', String(fixtureLimit()))
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
  const baseInclude = 'participants;state;scores;venue;periods;events;league'
  const liveInclude = process.env.POLY_STREAM_LIVE_INCLUDE?.trim() || baseInclude
  const include = baseOnly
    ? baseInclude
    : mode === 'live'
      ? liveInclude
      : process.env.POLY_STREAM_INCLUDE?.trim() || baseInclude
  const withCommonParams = (path: string) => {
    const url = new URL(`${base}${path}`)
    url.searchParams.set('include', include)
    url.searchParams.set('includes', include)
    url.searchParams.set('filters', `fixtureLeagues:${league}`)
    return url.toString()
  }
  if (mode === 'live') return [withCommonParams('/livescores')]
  if (mode === 'last') return [withCommonParams('/fixtures/latest')]
  const startDate = process.env.POLY_STREAM_START_DATE?.trim() || DEFAULT_WORLD_CUP_START_DATE
  return [
    withCommonParams(`/fixtures/between/${startDate}/${isoDate(21)}`),
    withCommonParams('/fixtures/upcoming'),
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
  'cape verde': ['cape verde', 'cape verde islands', 'cabo verde', 'cvi'],
  'cape verde islands': ['cape verde', 'cape verde islands', 'cabo verde', 'cvi'],
  'cabo verde': ['cape verde', 'cape verde islands', 'cabo verde', 'cvi'],
  curacao: ['curacao', 'curaçao'],
  'czech republic': ['czech republic', 'czechia'],
  czechia: ['czech republic', 'czechia'],
  iran: ['iran', 'ir iran', 'islamic republic of iran'],
  'ir iran': ['iran', 'ir iran', 'islamic republic of iran'],
  germany: ['germany', 'deutschland'],
  netherlands: ['netherlands', 'holland'],
  'south korea': ['south korea', 'korea republic', 'republic of korea'],
  'korea republic': ['south korea', 'korea republic', 'republic of korea'],
  'bosnia and herzegovina': ['bosnia and herzegovina', 'bosnia herzegovina', 'bosnia'],
  'bosnia herzegovina': ['bosnia and herzegovina', 'bosnia herzegovina', 'bosnia'],
  'congo dr': ['congo dr', 'dr congo', 'democratic republic of congo'],
  'dr congo': ['congo dr', 'dr congo', 'democratic republic of congo'],
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

function scorePolymarketCandidate(candidate: ProviderMatch, home: string, away: string, allowClosed = false) {
  const text = normalizeSearchText(candidateText(candidate))
  if (isExactScoreMarketText(text)) return 0
  const record = asRecord(candidate)
  const eventTitle = normalizeSearchText(asString(record.title) || asString(record.question))
  const homeTerms = teamSearchTerms(home)
  const awayTerms = teamSearchTerms(away)
  if (!homeTerms.length || !awayTerms.length) return 0
  const hasHome = homeTerms.some(term => text.includes(term))
  const hasAway = awayTerms.some(term => text.includes(term))
  if (!hasHome || !hasAway) return 0
  let score = 50
  if (eventTitle && homeTerms.some(term => eventTitle.startsWith(term)) && awayTerms.some(term => eventTitle.endsWith(term))) score += 20
  if (/\bworld cup\b|\bfifa\b|\b2026\b/.test(text)) score += 18
  if (/\bvs\b|\bv\b|\bversus\b|\bbeat\b|\bwin\b/.test(text)) score += 8
  if (/winner|match|game|group|advance|qualif|score/.test(text)) score += 6
  if (!allowClosed && isClosedMarket(candidate)) score -= 40
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
  if (isAllowedPolymarketMatchUrl(directUrl)) return directUrl
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

function readMarketOutcomePriceForTerms(market: ProviderMatch, terms: string[]) {
  const outcomes = parseJsonArray(market.outcomes).map(value => String(value))
  const prices = parseJsonArray(market.outcomePrices).map(asNumber)
  if (!outcomes.length || !prices.length) return undefined
  for (let index = 0; index < outcomes.length; index += 1) {
    const label = normalizeSearchText(outcomes[index])
    if (!label) continue
    if (terms.some(term => label === term)) return prices[index]
  }
  return undefined
}

function readStringArray(value: unknown) {
  return parseJsonArray(value).map(item => String(item).trim()).filter(Boolean)
}

function yesOutcomeIndex(market: ProviderMatch) {
  const outcomes = readStringArray(market.outcomes)
  const index = outcomes.findIndex(outcome => /^yes$/i.test(outcome))
  return index >= 0 ? index : 0
}

function classifyMoneylineMarket(market: ProviderMatch, home: string, away: string): PolymarketTradeOption['outcome'] | '' {
  const label = normalizeSearchText([
    asString(market.groupItemTitle),
    asString(market.group_item_title),
    asString(market.question),
    asString(market.title),
  ].filter(Boolean).join(' '))
  if (!label) return ''
  if (/\bdraw\b|\btie\b/.test(label)) return 'draw'
  const homeTerms = teamSearchTerms(home)
  const awayTerms = teamSearchTerms(away)
  if (homeTerms.some(term => label === term || label.includes(`will ${term} win`) || label.includes(`${term} win`))) return 'home'
  if (awayTerms.some(term => label === term || label.includes(`will ${term} win`) || label.includes(`${term} win`))) return 'away'
  return ''
}

function moneylineTradeOptions(candidate: ProviderMatch, home: string, away: string): PolymarketTradeOption[] {
  const eventNegRisk = asRecord(candidate).negRisk === true || asString(asRecord(candidate).negRisk).toLowerCase() === 'true'
  const options = marketArray(candidate)
    .filter(market => asString(market.sportsMarketType) === 'moneyline')
    .filter(market => market.acceptingOrders === true || asString(market.acceptingOrders).toLowerCase() === 'true')
    .filter(market => market.enableOrderBook === true || asString(market.enableOrderBook).toLowerCase() === 'true')
    .map(market => {
      const outcome = classifyMoneylineMarket(market, home, away)
      if (!outcome) return null
      const tokenIds = readStringArray(market.clobTokenIds)
      const index = yesOutcomeIndex(market)
      const tokenId = tokenIds[index]
      if (!/^\d+$/.test(tokenId || '')) return null
      const price = readMarketOutcomePrice(market)
      return {
        label: outcome === 'home' ? home : outcome === 'away' ? away : 'Draw',
        outcome,
        tokenId,
        price: price !== undefined ? formatProbability(price) : undefined,
        conditionId: asString(market.conditionId),
        tickSize: asNumber(market.orderPriceMinTickSize),
        minSize: asNumber(market.orderMinSize),
        negRisk: market.negRisk === true || asString(market.negRisk).toLowerCase() === 'true' || eventNegRisk,
      } satisfies PolymarketTradeOption
    })
    .filter((option): option is PolymarketTradeOption => Boolean(option))

  const order: PolymarketTradeOption['outcome'][] = ['home', 'draw', 'away']
  return options.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome))
}

function formatProbability(price: number) {
  const percent = price * 100
  if (percent > 0 && percent < 1) return '<1%'
  if (percent > 99 && percent < 100) return '>99%'
  return `${Math.round(percent)}%`
}

function polymarketPriceSummary(candidate: ProviderMatch, home: string, away: string) {
  const markets = marketArray(candidate)
  const homeTerms = teamSearchTerms(home)
  const awayTerms = teamSearchTerms(away)
  const priceFor = (terms: string[]) => {
    const outcomePrice = markets
      .map(item => readMarketOutcomePriceForTerms(item, terms))
      .find(price => price !== undefined)
    if (outcomePrice !== undefined) return formatProbability(outcomePrice)
    const market = markets.find(item => {
      const label = normalizeSearchText(asString(item.groupItemTitle) || asString(item.group_item_title))
      if (!label || /\bdraw\b|\btie\b/.test(label)) return false
      return terms.some(term => label === term)
    })
    const price = market ? readMarketOutcomePrice(market) : undefined
    return price !== undefined ? formatProbability(price) : ''
  }
  const homePrice = priceFor(homeTerms)
  const awayPrice = priceFor(awayTerms)
  const directDrawPrice = markets
    .map(item => readMarketOutcomePriceForTerms(item, ['draw', 'tie']))
    .find(price => price !== undefined)
  const drawMarket = markets.find(item => /\bdraw\b|\btie\b/.test(normalizeSearchText([
    asString(item.groupItemTitle),
    asString(item.group_item_title),
    asString(item.question),
    asString(item.title),
  ].filter(Boolean).join(' '))))
  const drawPrice = directDrawPrice !== undefined ? directDrawPrice : drawMarket ? readMarketOutcomePrice(drawMarket) : undefined
  const drawLabel = drawPrice !== undefined ? formatProbability(drawPrice) : ''
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
  return fetchPolymarketWorldCupEventsByClosed(false)
}

async function fetchPolymarketWorldCupEventsByClosed(closed: boolean) {
  const params = new URLSearchParams({
    active: 'true',
    closed: closed ? 'true' : 'false',
    limit: process.env.POLYMARKET_WORLD_CUP_LIMIT?.trim() || '100',
    series_slug: 'soccer-fifwc',
  })
  return fetchPolymarketJson(`https://gamma-api.polymarket.com/events?${params.toString()}`).catch(() => [])
}

function polymarketMatchFromCandidates(match: ScoreMatch, candidates: Array<{ kind: 'event' | 'market'; item: ProviderMatch }>) {
  const [home, away] = splitFixtureTitle(match.title)
  if (!home || !away) return null
  const allowClosed = isResultMatch(match)
  const ranked = candidates
    .filter(candidate => candidate.kind === 'event' && hasWorldCupSeries(candidate.item))
    .map(candidate => ({ ...candidate, score: scorePolymarketCandidate(candidate.item, home, away, allowClosed) }))
    .filter(candidate => candidate.score >= 50)
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best) return null
  const record = asRecord(best.item)
  const marketsForValues = marketArray(best.item)
  const firstMarket = marketsForValues[0] || {}
  const prices = polymarketPriceSummary(best.item, home, away)
  const tradeOptions = moneylineTradeOptions(best.item, home, away)
  const url = readPolymarketUrl(best.item, best.kind)
  if (!isAllowedPolymarketMatchUrl(url)) return null
  return {
    title: asString(record.title) || asString(record.question) || asString(firstMarket.question) || asString(firstMarket.title),
    url,
    probability: prices.summary,
    homeMarketPrice: prices.home,
    awayMarketPrice: prices.away,
    drawMarketPrice: prices.draw,
    liquidity: formatUsd(record.liquidity ?? record.liquidityNum ?? firstMarket.liquidity ?? firstMarket.liquidityNum),
    volume: formatUsd(record.volume ?? record.volumeNum ?? record.volume24hr ?? firstMarket.volume ?? firstMarket.volumeNum),
    tradeOptions,
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
  const events = await fetchPolymarketJson(`https://gamma-api.polymarket.com/events?${params.toString()}`).catch(() => [])
  return polymarketMatchFromCandidates(match, [
    ...events.map(item => ({ kind: 'event' as const, item })),
  ])
}

function isResultMatch(match: ScoreMatch) {
  return match.tag === 'Result' || /(ft|full time|full-time|finished|complete|ended|after extra time|pen)/i.test(match.status)
}

async function enrichMatchesWithPolymarket(matches: ScoreMatch[]) {
  if (process.env.POLYMARKET_MARKET_LOOKUP?.trim() === '0') return matches
  const worldCupEvents = await fetchPolymarketWorldCupEvents()
  const closedWorldCupEvents = matches.some(isResultMatch)
    ? await fetchPolymarketWorldCupEventsByClosed(true)
    : []
  const worldCupCandidates = worldCupEvents.map(item => ({ kind: 'event' as const, item }))
  const closedWorldCupCandidates = closedWorldCupEvents.map(item => ({ kind: 'event' as const, item }))
  const enriched = await Promise.all(matches.map(async match => {
    const configuredUrl = match.polymarketUrl && isAllowedPolymarketMatchUrl(match.polymarketUrl) ? match.polymarketUrl : ''
    const searchableMatch = { ...match, polymarketUrl: '' }
    const candidatePool = isResultMatch(match)
      ? [...worldCupCandidates, ...closedWorldCupCandidates]
      : worldCupCandidates
    const found = polymarketMatchFromCandidates(match, candidatePool) || await findPolymarketMatch(match).catch(() => null)
    if (!found?.url) {
      return withMarketStatus(configuredUrl
        ? { ...searchableMatch, polymarketUrl: configuredUrl }
        : searchableMatch)
    }
    return withMarketStatus({
      ...searchableMatch,
      polymarketUrl: found.url,
      polymarketTitle: found.title,
      probability: found.probability,
      homeMarketPrice: found.homeMarketPrice,
      awayMarketPrice: found.awayMarketPrice,
      drawMarketPrice: found.drawMarketPrice,
      polymarketLiquidity: found.liquidity,
      polymarketVolume: found.volume,
      polymarketTradeOptions: found.tradeOptions,
    })
  }))
  return enriched.map(withMarketStatus)
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
  return results.slice(0, fixtureLimit())
}

async function fetchProviderUrl(provider: string, apiKey: string, url: string): Promise<ScoreMatch[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (provider === 'api-football' || provider === 'api-sports') headers['x-apisports-key'] = apiKey

  const requestUrl = new URL(url)
  if (provider !== 'api-football' && provider !== 'api-sports' && !requestUrl.searchParams.has('api_token')) {
    requestUrl.searchParams.set('api_token', apiKey)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
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
  const timeout = setTimeout(() => controller.abort(), 20_000)
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

function matchTimeValue(match: ScoreMatch) {
  const timestamp = Date.parse(match.kickoffAt || match.time)
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER
}

function selectMatchday(matches: ScoreMatch[], selectedDate: string) {
  const dated = matches.filter(match => matchDateKey(match))
  const exact = dated.filter(match => matchDateKey(match) === selectedDate)
  if (exact.length) {
    const selectedTs = Date.parse(`${selectedDate}T00:00:00Z`)
    const previousResults = dated
      .filter(match => match.tag === 'Result' && matchDateKey(match) < selectedDate)
      .sort((a, b) => matchTimeValue(b) - matchTimeValue(a))
      .slice(0, 3)
    const nextFixtures = dated
      .filter(match => match.tag !== 'Result' && matchDateKey(match) > selectedDate)
      .sort((a, b) => matchTimeValue(a) - matchTimeValue(b))
      .slice(0, 5)
    const nearSelected = Number.isFinite(selectedTs)
      ? dated.filter(match => {
          const ts = matchTimeValue(match)
          return ts >= selectedTs - 6 * 60 * 60 * 1000 && ts < selectedTs
        }).slice(0, 2)
      : []
    return dedupeMatches([...exact, ...nearSelected, ...previousResults, ...nextFixtures])
  }

  const live = dated.filter(match => match.tag === 'Live')
  if (live.length) return live

  const nextDate = dated
    .map(matchDateKey)
    .filter(date => date >= selectedDate)
    .sort()[0]
  if (nextDate) return dated.filter(match => matchDateKey(match) === nextDate)

  const today = todayKey()
  const upcomingDate = dated
    .filter(match => match.tag === 'Today' || match.tag === 'Fixture')
    .map(matchDateKey)
    .filter(date => date >= today)
    .sort()[0]
  if (upcomingDate) return dated.filter(match => matchDateKey(match) === upcomingDate)

  const latestResultDate = dated
    .map(matchDateKey)
    .sort()
    .at(-1)
  return latestResultDate ? dated.filter(match => matchDateKey(match) === latestResultDate) : []
}

async function fetchFanVibeMatches(selectedDate: string): Promise<ScoreMatch[]> {
  const url = fanVibeFeedUrl()
  if (!url) return []

  const requestUrl = new URL(url)
  requestUrl.searchParams.set('force', '1')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(requestUrl, { headers: { Accept: 'application/json' }, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`FanVibe feed returned ${response.status}: ${safeProviderMessage(text)}`)
    const payload = JSON.parse(text)
    const record = asRecord(payload)
    const fixtures = Array.isArray(record.fixtures) ? record.fixtures.map(asRecord) : []
    const matchStates = asRecord(record.matchStates)
    const normalized = fixtures
      .map(fixture => normalizeFanVibeFixture(fixture, matchStates))
      .filter(Boolean) as ScoreMatch[]
    const selected = selectMatchday(dedupeMatches(normalized), selectedDate)
      .sort((a, b) => matchRank(a) - matchRank(b) || matchTimeValue(a) - matchTimeValue(b))
      .slice(0, fixtureLimit())
    return enrichMatchesWithPolymarket(selected)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchProviderMatches(selectedDate: string): Promise<ScoreMatch[]> {
  const fanVibeUrl = fanVibeFeedUrl()
  if (fanVibeUrl) {
    try {
      const matches = await fetchFanVibeMatches(selectedDate)
      if (matches.length) {
        lastProviderSource = 'fanvibe-worldcup'
        return matches
      }
      lastProviderError = 'FanVibe feed returned no World Cup fixtures.'
    } catch (err) {
      lastProviderError = err instanceof Error ? err.message : 'FanVibe feed failed.'
    }
  }

  const provider = providerName()
  const apiKey = envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY')
  if (!apiKey) return []

  const mode = fixtureMode()
  const modes: FixtureMode[] = mode === 'auto' ? ['live', 'next'] : mode === 'last' ? ['next'] : [mode]
  const batches = await Promise.all(modes.map(current => fetchProviderMode(provider, apiKey, current).catch(err => {
    lastProviderError = err instanceof Error ? err.message : 'Score provider failed.'
    return [] as ScoreMatch[]
  })))
  const matches = selectMatchday(dedupeMatches(batches.flat()), selectedDate)
    .sort((a, b) => matchRank(a) - matchRank(b) || matchTimeValue(a) - matchTimeValue(b))
    .slice(0, fixtureLimit())
  const detailedMatches = provider === 'api-football' || provider === 'api-sports'
    ? matches
    : await enrichSportmonksDetails(matches, apiKey)
  if (detailedMatches.length) lastProviderSource = provider
  return enrichMatchesWithPolymarket(detailedMatches)
}

export async function getPolyStreamFeed(selectedDate: string): Promise<ScoreFeed & { providerError?: string }> {
  const ttl = 0
  if (ttl > 0 && cache && cache.expiresAt > Date.now()) return { ...cache.feed, providerError: lastProviderError }

  const provider = providerName()
  const fanVibeConfigured = Boolean(fanVibeFeedUrl())
  const providerConfigured = fanVibeConfigured || Boolean(envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY'))

  try {
    lastProviderSource = ''
    const matches = providerConfigured ? await fetchProviderMatches(selectedDate) : []
    if (matches.length) lastProviderError = ''
    else if (providerConfigured && !lastProviderError) lastProviderError = 'Provider returned no live or upcoming World Cup matches.'
    const feed: ScoreFeed = {
      ok: true,
      providerConfigured,
      source: providerConfigured ? lastProviderSource || provider : 'not_configured',
      providerStatus: matches.length ? 'connected' : providerConfigured ? 'empty' : 'not_configured',
      selectedDate,
      displayDate: matches[0] ? matchDateKey(matches[0]) || selectedDate : selectedDate,
      updatedAt: new Date().toISOString(),
      matches,
    }
    cache = ttl > 0 ? { expiresAt: Date.now() + ttl, feed } : null
    return { ...feed, providerError: lastProviderError }
  } catch (err) {
    lastProviderError = err instanceof Error ? err.message : 'Score provider failed.'
    const feed: ScoreFeed = {
      ok: true,
      providerConfigured,
      source: provider || 'provider',
      providerStatus: 'error',
      selectedDate,
      displayDate: selectedDate,
      updatedAt: new Date().toISOString(),
      matches: [],
    }
    cache = ttl > 0 ? { expiresAt: Date.now() + Math.min(ttl, 15_000), feed } : null
    return { ...feed, providerError: lastProviderError }
  }
}

export default async function polyStreamHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const feed = await getPolyStreamFeed(requestDate(req))
  return res.json(req.query.debug === '1' ? feed : { ...feed, providerError: undefined })
}

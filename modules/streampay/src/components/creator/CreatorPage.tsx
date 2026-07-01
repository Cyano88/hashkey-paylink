import { useCallback, useEffect, useState } from 'react'
import { Loader2, LockKeyhole, Mail, Plus, TrendingUp, X as XIcon } from 'lucide-react'
import { LinkFactory }            from './LinkFactory'
import { readGhostVault }         from '../../hooks/usePoAStream'
import type { GhostVaultEntry }   from '../../hooks/usePoAStream'

type ViewerRow = { viewer: string; amountRaw: string; ts: number }
type CreatorTab = 'discover' | 'create' | 'earnings'
type CreatorCategory = 'worldcup-news' | 'live-scores' | 'crypto' | 'ebooks'
type PublishedContent = {
  id: string
  contentId?: string
  creator?: string
  title: string
  description: string
  category: CreatorCategory
  price: string
  tag: string
  source: string
  image: string
  author?: string
  xHandle?: string
  gateLink?: string
  startsAt?: string | number
  action?: 'create' | 'gate'
  cta?: string
  editable?: boolean
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  draft?: CreatorDraft
  match?: PolyStreamMatch
}
type CreatorDraft = {
  title: string
  description: string
  authorName: string
  xHandle: string
  coverImage: string
  contentBody: string
  privateUrl: string
  category: CreatorCategory
  rateStr: string
  capStr: string
  mode: 'unlock' | 'stream'
  contentType: 'text' | 'url'
}
type GateCreatedMeta = {
  creator: string
  title: string
  description: string
  authorName: string
  xHandle: string
  coverImage: string
  contentBody: string
  privateUrl: string
  category: CreatorCategory
  rateStr: string
  capStr: string
  mode: 'unlock' | 'stream'
  contentType: 'text' | 'url'
  capRaw: number
}
type ServerCreatorPost = {
  id?: string
  contentId: string
  creator: string
  title: string
  description: string
  authorName: string
  xHandle: string
  coverImage: string
  category: CreatorCategory
  type: 'text' | 'url'
  mode: 'unlock' | 'stream'
  capRaw: number
  rateRaw: number
  gateLink: string
  startsAt?: string | number
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
}
type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
}
type PolyWorldCupFeed = {
  ok?: boolean
  providerConfigured?: boolean
  source?: string
  updatedAt?: string
  articles?: PolyWorldCupArticle[]
}
type PolyStreamMatch = {
  fixtureId?: string
  tag?: string
  title: string
  time: string
  kickoffAt?: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  homeMarketPrice?: string
  awayMarketPrice?: string
  drawMarketPrice?: string
  marketStatus?: 'matched' | 'pending'
  polymarketUrl?: string
}
type PolyStreamFeed = {
  ok?: boolean
  providerConfigured?: boolean
  providerStatus?: string
  selectedDate?: string
  displayDate?: string
  updatedAt?: string
  providerError?: string
  matches?: PolyStreamMatch[]
}

const FALLBACK_CREATOR_COVERS = [
  '/brand/africa-business-bg.jpeg',
  '/brand/abuja-business-bg.jpeg',
  '/brand/world-globe.png',
]
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'
const WORLD_GLOBE_IMAGE = '/brand/world-globe.png'

const CREATOR_CATEGORIES: Array<{ id: CreatorCategory; label: string; disabled?: boolean }> = [
  { id: 'worldcup-news', label: 'World Cup News' },
  { id: 'live-scores', label: 'Live Scores' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'ebooks', label: 'Ebooks', disabled: true },
]

function normalizeCreatorCategory(value: unknown): CreatorCategory {
  const category = String(value ?? '').trim().toLowerCase()
  if (category === 'news') return 'worldcup-news'
  if (category === 'sports') return 'live-scores'
  if (category === 'general') return 'crypto'
  return CREATOR_CATEGORIES.some(item => item.id === category) ? category as CreatorCategory : 'crypto'
}

const OFFICIAL_CREATOR_ADDRESS = (
  import.meta.env.VITE_CREATOR_OFFICIAL_WALLET
  || import.meta.env.VITE_DEFAULT_AGENT_WALLET_ADDRESS
  || '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'
)
const OFFICIAL_WORLD_CUP_SCORES_GATE = `/gate?app=streampay&id=worldcup-scores&cr=${OFFICIAL_CREATOR_ADDRESS}&r=1000&cap=100000&mode=unlock&pay=x402&t=Live%20Scores%20Pulse`

const OFFICIAL_DISCOVER_CONTENT: PublishedContent[] = [
  {
    id: 'hashpaylink-creator-primer',
    title: 'How paid creator links settle on Arc',
    description: 'A short Hash PayLink note on content gates, Circle USDC, and why creators can charge per article or private drop.',
    category: 'crypto',
    price: '0.10',
    tag: 'Hash PayLink',
    source: 'Hash PayLink desk',
    image: WORLD_GLOBE_IMAGE,
    action: 'create',
    cta: 'Create',
  },
]

function worldCupArticleId(article: Pick<PolyWorldCupArticle, 'title' | 'url'>, index = 0) {
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

function worldCupNewsCard(article: PolyWorldCupArticle, index: number): PublishedContent {
  const contentId = worldCupArticleId(article, index)
  const params = new URLSearchParams({
    app: 'streampay',
    id: contentId,
    cr: OFFICIAL_CREATOR_ADDRESS,
    r: '1000',
    cap: '100000',
    mode: 'unlock',
    pay: 'x402',
    t: article.title,
  })
  return {
    id: contentId,
    contentId,
    creator: OFFICIAL_CREATOR_ADDRESS,
    title: article.title,
    description: article.description || 'World Cup update for paid readers.',
    category: 'worldcup-news',
    price: '0.10',
    tag: article.tag || 'World Cup',
    source: article.source || 'Hash PayLink Pulse',
    image: article.image || WORLD_GLOBE_IMAGE,
    gateLink: `/gate?${params.toString()}`,
    action: 'gate',
    cta: 'Unlock',
  }
}

function worldCupScoreCard(match: PolyStreamMatch, index: number): PublishedContent {
  const fixtureId = match.fixtureId || `${match.title}-${match.kickoffAt || match.time}-${index}`
  const contentId = `worldcup-score-${String(fixtureId).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 64)}`
  const [home, away] = splitFixtureTitle(match.title)
  const state = matchDisplayState(match)
  const params = new URLSearchParams({
    app: 'streampay',
    id: contentId,
    cr: OFFICIAL_CREATOR_ADDRESS,
    r: '1000',
    cap: '100000',
    mode: 'unlock',
    pay: 'x402',
    t: `${home}${away ? ` vs ${away}` : ''} route`,
  })
  return {
    id: contentId,
    contentId,
    creator: OFFICIAL_CREATOR_ADDRESS,
    title: match.title,
    description: match.marketStatus === 'matched'
      ? 'Live score context is visible. Unlock the direct Polymarket route for this fixture.'
      : 'Live score context is visible. Market routing appears when a fixture is matched.',
    category: 'live-scores',
    price: '0.10',
    tag: state.tag === 'LIVE' ? 'Live' : state.tag === 'FT' ? 'Result' : 'Fixture',
    source: 'Live Scores Pulse',
    image: flagUrlForTeam(home) || flagUrlForTeam(away) || WORLD_GLOBE_IMAGE,
    gateLink: `/gate?${params.toString()}`,
    startsAt: match.kickoffAt || match.time,
    action: 'gate',
    cta: match.marketStatus === 'matched' ? 'Unlock route' : 'View',
    match,
  }
}

function parseContentId(input: string): string {
  try {
    const url = new URL(input.includes('://') ? input : `https://x.com${input}`)
    return url.searchParams.get('id') ?? input.trim()
  } catch { return input.trim() }
}

function articleTimeValue(article: PolyWorldCupArticle) {
  const timestamp = Date.parse(article.publishedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function relativeNewsTime(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'recently'
  const diffMs = Date.now() - timestamp
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Scan localStorage for any ghost vaults matching this contentId.
// Local fallback for unsigned/offline recovery before the server registry sees the latest vault.
function getLocalVaults(contentId: string): ViewerRow[] {
  const prefix = `sp_poa_${contentId}_`
  const rows: ViewerRow[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(prefix)) continue
      const entry = JSON.parse(localStorage.getItem(k) ?? '{}') as {
        viewer?: string; amountRaw?: string; ts?: number
      }
      if (entry.viewer && entry.amountRaw) {
        rows.push({ viewer: entry.viewer, amountRaw: entry.amountRaw, ts: entry.ts ?? 0 })
      }
    }
  } catch { /* localStorage unavailable */ }
  return rows
}

function formatPrice(raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return '0.10'
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function getSportsCountdown(card: PublishedContent, now: number) {
  if (card.category !== 'live-scores') return null
  if (!card.startsAt) return null
  const startsAt = typeof card.startsAt === 'number' ? card.startsAt : new Date(card.startsAt).getTime()
  if (!Number.isFinite(startsAt)) return null
  const ms = startsAt - now
  if (ms <= 0) return { label: 'Live now', isLive: true }
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return {
    label: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
    isLive: false,
  }
}

function compactMatchTitle(title: string) {
  return title.replace(/\s+/g, ' ').replace(/\bFIFA\b/gi, '').trim()
}

function hasMatchScore(match: PolyStreamMatch) {
  const home = String(match.homeScore ?? '').trim().toLowerCase()
  const away = String(match.awayScore ?? '').trim().toLowerCase()
  return Boolean(home && away && home !== 'undefined' && away !== 'undefined' && home !== 'null' && away !== 'null')
}

function splitFixtureTitle(title: string) {
  if (!title.includes(' vs ')) return [compactMatchTitle(title), ''] as const
  const [home, away] = title.split(' vs ', 2)
  return [home.trim(), away.trim()] as const
}

const WORLD_CUP_TEAM_ISO: Record<string, string> = {
  algeria: 'dz',
  argentina: 'ar',
  australia: 'au',
  austria: 'at',
  belgium: 'be',
  bosnia: 'ba',
  'bosnia & herz': 'ba',
  'bosnia and herzegovina': 'ba',
  brazil: 'br',
  canada: 'ca',
  'cape verde': 'cv',
  'cape verde islands': 'cv',
  'cabo verde': 'cv',
  colombia: 'co',
  'congo dr': 'cd',
  'dr congo': 'cd',
  croatia: 'hr',
  curacao: 'cw',
  'cote divoire': 'ci',
  ecuador: 'ec',
  egypt: 'eg',
  england: 'gb-eng',
  france: 'fr',
  germany: 'de',
  ghana: 'gh',
  haiti: 'ht',
  iran: 'ir',
  'ir iran': 'ir',
  iraq: 'iq',
  'ivory coast': 'ci',
  japan: 'jp',
  jordan: 'jo',
  mexico: 'mx',
  morocco: 'ma',
  netherlands: 'nl',
  'new zealand': 'nz',
  norway: 'no',
  panama: 'pa',
  paraguay: 'py',
  portugal: 'pt',
  qatar: 'qa',
  'saudi arabia': 'sa',
  scotland: 'gb-sct',
  senegal: 'sn',
  'south africa': 'za',
  'south korea': 'kr',
  spain: 'es',
  sweden: 'se',
  switzerland: 'ch',
  tunisia: 'tn',
  turkey: 'tr',
  turkiye: 'tr',
  'united states': 'us',
  usa: 'us',
  uruguay: 'uy',
  uzbekistan: 'uz',
}

function teamIso(name: string) {
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[']/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return WORLD_CUP_TEAM_ISO[clean] || ''
}

function flagUrlForTeam(name: string, size = 640) {
  const iso = teamIso(name)
  return iso ? `https://flagcdn.com/w${size}/${iso}.png` : ''
}

function flagEmojiForTeam(name: string) {
  const iso = teamIso(name)
  if (!iso || iso.includes('-')) return 'WC'
  return iso
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

function TeamFlagMark({ name }: { name: string }) {
  const flag = flagUrlForTeam(name, 160)
  return flag ? (
    <img src={flag} alt="" className="h-8 w-12 rounded object-cover shadow-xl ring-1 ring-white/20" loading="lazy" />
  ) : (
    <span className="text-xs font-black text-white">{flagEmojiForTeam(name)}</span>
  )
}

function readableMatchClock(value?: string) {
  const text = (value || '').trim()
  const stoppage = text.match(/^90\+(\d+)'$/)
  if (stoppage) return `90+${stoppage[1]} mins`
  const minute = text.match(/^(\d+)'$/)
  if (minute) {
    const count = Number(minute[1])
    if (Number.isFinite(count)) {
      if (count > 90) return `90+${Math.min(count - 90, 15)} mins`
      return `${count} ${count === 1 ? 'min' : 'mins'}`
    }
  }
  return text
}

function matchCountdown(match: PolyStreamMatch) {
  const source = match.kickoffAt || match.time
  const ts = Date.parse(source)
  if (!Number.isFinite(ts)) return 'Countdown'
  const diffMs = ts - Date.now()
  if (diffMs <= 0) return 'Starting'
  const totalSeconds = Math.ceil(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  if (hours > 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  return `${seconds} ${seconds === 1 ? 'sec' : 'secs'}`
}

function matchDisplayState(match: PolyStreamMatch) {
  const status = `${match.status} ${match.tag || ''}`.toLowerCase()
  const scored = hasMatchScore(match)
  const matchTime = Date.parse(match.kickoffAt || match.time)
  const isPast = Number.isFinite(matchTime) && matchTime < Date.now() - 90 * 60 * 1000
  const clock = readableMatchClock(match.clock)
  if (/(live|inplay|in play|1h|2h|1st|2nd|first half|second half|et)/.test(status)) {
    return {
      tag: 'LIVE',
      phase: match.status && !/^live$/i.test(match.status) ? match.status : '',
      center: scored ? `${match.homeScore}-${match.awayScore}` : 'Live',
      sub: clock || 'Live',
    }
  }
  if (/(half|ht)/.test(status)) {
    return { tag: 'HT', phase: 'Half time', center: scored ? `${match.homeScore}-${match.awayScore}` : 'HT', sub: clock || 'Half time' }
  }
  if ((scored && /(ft|full time|full-time|finished|result|complete|ended|after extra time|pen)/.test(status)) || (scored && isPast)) {
    return { tag: 'FT', phase: 'Full time', center: `${match.homeScore}-${match.awayScore}`, sub: clock || 'Full time' }
  }
  return { tag: 'NS', phase: '', center: 'vs', sub: matchCountdown(match) }
}

function isLiveMatch(match: PolyStreamMatch) {
  return matchDisplayState(match).tag === 'LIVE'
}

function contentFromGate(link: string, meta: GateCreatedMeta, index: number): PublishedContent {
  const title = meta.title.trim() || (meta.contentType === 'url' ? 'Private creator drop' : 'Creator article')
  const author = meta.authorName.trim() || 'Creator Studio'
  const xHandle = meta.xHandle.trim()
  const category = normalizeCreatorCategory(meta.category)
  return {
    id: `published-${Date.now()}-${index}`,
    contentId: parseContentId(link),
    creator: meta.creator,
    title,
    description: meta.description.trim() || (meta.mode === 'stream'
      ? 'Nano-streaming access is ready. Viewers pay while reading or watching.'
      : 'Fixed-price creator content is ready for paid unlock.'),
    category,
    price: formatPrice(String(meta.capRaw / 1_000_000)),
    tag: CREATOR_CATEGORIES.find(item => item.id === category)?.label || 'Crypto',
    source: xHandle ? `@${xHandle.replace(/^@/, '')}` : author,
    image: meta.coverImage || FALLBACK_CREATOR_COVERS[index % FALLBACK_CREATOR_COVERS.length],
    author,
    xHandle,
    gateLink: link,
    editable: true,
    reviewStatus: 'pending',
    draft: {
      title: meta.title,
      description: meta.description,
      authorName: meta.authorName,
      xHandle: meta.xHandle,
      coverImage: meta.coverImage,
      contentBody: meta.contentBody,
      privateUrl: meta.privateUrl,
      category,
      rateStr: meta.rateStr,
      capStr: meta.capStr,
      mode: meta.mode,
      contentType: meta.contentType,
    },
  }
}

function contentFromServerPost(post: ServerCreatorPost, index: number): PublishedContent {
  const category = normalizeCreatorCategory(post.category)
  const author = post.authorName.trim() || 'Creator Studio'
  const xHandle = post.xHandle.trim()
  return {
    id: post.contentId || post.id || `server-${index}`,
    contentId: post.contentId,
    creator: post.creator,
    title: post.title?.trim() || (post.type === 'url' ? 'Private creator drop' : 'Creator article'),
    description: post.description?.trim() || (post.mode === 'stream'
      ? 'Nano-streaming access is ready. Viewers pay while reading or watching.'
      : 'Fixed-price creator content is ready for paid unlock.'),
    category,
    price: formatPrice(String((Number(post.capRaw) || 0) / 1_000_000)),
    tag: CREATOR_CATEGORIES.find(item => item.id === category)?.label || 'Crypto',
    source: xHandle ? `@${xHandle.replace(/^@/, '')}` : author,
    image: post.coverImage || FALLBACK_CREATOR_COVERS[index % FALLBACK_CREATOR_COVERS.length],
    author,
    xHandle,
    gateLink: post.gateLink,
    startsAt: post.startsAt,
    editable: false,
    reviewStatus: post.reviewStatus || 'pending',
    reviewNote: post.reviewNote || '',
  }
}

function DiscoverContent({
  published,
  onCreate,
  onEdit,
}: {
  published: PublishedContent[]
  onCreate: () => void
  onEdit: (content: PublishedContent) => void
}) {
  const [approvedPosts, setApprovedPosts] = useState<PublishedContent[]>([])
  const [worldCupNewsCards, setWorldCupNewsCards] = useState<PublishedContent[]>([])
  const [scoreFeed, setScoreFeed] = useState<PolyStreamFeed | null>(null)
  const [scoreLoading, setScoreLoading] = useState(true)
  const [scoreError, setScoreError] = useState('')
  const [scoreIndex, setScoreIndex] = useState(0)
  const [brokenImages, setBrokenImages] = useState<Record<string, true>>({})
  const [categoryFilter, setCategoryFilter] = useState<CreatorCategory | 'all'>('all')
  const [heroIndex, setHeroIndex] = useState(0)
  const [now, setNow] = useState(Date.now())

  const loadScores = useCallback(async (silent = false) => {
    if (!silent) {
      setScoreLoading(true)
      setScoreError('')
    }
    try {
      const matchday = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/poly-stream?date=${matchday}&debug=1`)
      const data = await res.json() as PolyStreamFeed
      if (!res.ok || !data.ok) throw new Error('Live scores are not available.')
      setScoreFeed(data)
    } catch (err) {
      if (!silent) setScoreError(err instanceof Error ? err.message : 'Live scores are not available.')
    } finally {
      setScoreLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/creator-discover-content')
      .then(res => res.json())
      .then((data: { ok?: boolean; posts?: ServerCreatorPost[] }) => {
        if (cancelled || !data.ok || !Array.isArray(data.posts)) return
        setApprovedPosts(data.posts.map(contentFromServerPost))
      })
      .catch(() => {
        if (!cancelled) setApprovedPosts([])
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadScores()
    const timer = window.setInterval(() => {
      if (!cancelled) void loadScores(true)
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [loadScores])

  useEffect(() => {
    let cancelled = false
    async function loadWorldCupNews() {
      try {
        const res = await fetch('/api/poly-worldcup-news')
        const data = await res.json() as PolyWorldCupFeed
        if (cancelled || !res.ok || !data.ok || !Array.isArray(data.articles)) return
        setWorldCupNewsCards(data.articles
          .filter(article => article.url)
          .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
          .slice(0, 8)
          .map(worldCupNewsCard))
      } catch {
        if (!cancelled) setWorldCupNewsCards([])
      }
    }
    void loadWorldCupNews()
    const timer = window.setInterval(() => {
      void loadWorldCupNews()
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const approvedSessionPosts = published.filter(card => card.reviewStatus === 'approved')
  const scoreMatches = [...(scoreFeed?.matches ?? [])].sort((a, b) => Number(isLiveMatch(b)) - Number(isLiveMatch(a)))
  const scoreCards = scoreMatches.slice(0, 16).map(worldCupScoreCard)
  const officialCards = [
    OFFICIAL_DISCOVER_CONTENT[0],
    ...worldCupNewsCards,
    ...scoreCards,
  ].filter(Boolean) as PublishedContent[]
  const heroCards = [
    OFFICIAL_DISCOVER_CONTENT[0],
    ...worldCupNewsCards,
    ...scoreCards,
    ...approvedSessionPosts,
    ...approvedPosts,
  ].filter(card => categoryFilter === 'all' || card.category === categoryFilter)
  const allCards = [...officialCards, ...approvedSessionPosts, ...approvedPosts]
  const cards = allCards
    .filter(card => categoryFilter === 'all' || card.category === categoryFilter)
    .slice(0, 8)
  const hero = heroCards[heroIndex % Math.max(heroCards.length, 1)] || published[0] || OFFICIAL_DISCOVER_CONTENT[0]
  const heroIsScores = Boolean(hero.match)

  useEffect(() => {
    setHeroIndex(0)
  }, [categoryFilter, heroCards.length])

  useEffect(() => {
    if (heroCards.length < 2) return undefined
    const timer = window.setInterval(() => {
      setHeroIndex(index => (index + 1) % heroCards.length)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [heroCards.length])

  function openContent(card: PublishedContent) {
    if (card.category === 'live-scores' && !scoreMatches.length) {
      void loadScores()
      return
    }
    if (card.action === 'gate' && card.gateLink) {
      window.location.href = card.gateLink
      return
    }
    onCreate()
  }

  const heroCta = hero.cta || (hero.action === 'gate' ? 'Unlock' : 'Create')
  const featuredScore = hero.match || scoreMatches[scoreIndex % Math.max(scoreMatches.length, 1)]
  const scoresReady = Boolean(scoreFeed?.providerConfigured && scoreFeed.providerStatus === 'connected' && scoreMatches.length)
  const [scoreHome, scoreAway] = featuredScore ? splitFixtureTitle(featuredScore.title) : ['World Cup', 'Scores']
  const scoreState = featuredScore ? matchDisplayState(featuredScore) : null
  const homeFlag = featuredScore ? flagUrlForTeam(scoreHome) : ''
  const awayFlag = featuredScore ? flagUrlForTeam(scoreAway) : ''
  const scoreMarketMatched = Boolean(featuredScore?.marketStatus === 'matched' && featuredScore.polymarketUrl)
  const scoresEmpty = !scoreLoading && !scoreMatches.length
  const scoresEmptyTitle = !scoreFeed?.providerConfigured
    ? 'Score provider not connected'
    : scoreError
      ? 'Scores temporarily unavailable'
      : 'No matchday data yet'
  const scoresEmptyDetail = scoreError
    || scoreFeed?.providerError
    || (scoreFeed?.providerConfigured
      ? 'No live or upcoming World Cup fixtures are available for this matchday.'
      : 'Connect a live score provider to show World Cup fixtures.')

  useEffect(() => {
    setScoreIndex(0)
  }, [scoreMatches.length])

  useEffect(() => {
    if (scoreMatches.length < 2) return undefined
    const timer = window.setInterval(() => {
      setScoreIndex(index => (index + 1) % scoreMatches.length)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [scoreMatches.length])

  return (
    <div className="w-full space-y-4">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <button
          type="button"
          onClick={() => openContent(hero)}
          className="group relative block h-[320px] w-full overflow-hidden text-left"
        >
          {heroIsScores ? (
            <>
              {homeFlag && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-100 blur-[1px] transition-opacity duration-1000 [animation:hpFlagSwapA_10s_ease-in-out_infinite]"
                  style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.52), rgba(0,0,0,.82)), url(${homeFlag})` }}
                />
              )}
              {awayFlag && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-0 blur-[1px] transition-opacity duration-1000 [animation:hpFlagSwapB_10s_ease-in-out_infinite]"
                  style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.52), rgba(0,0,0,.82)), url(${awayFlag})` }}
                />
              )}
              {!featuredScore && (
                <img
                  src={WORLD_GLOBE_IMAGE}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
              )}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,.18),transparent_36%),linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.64))]" />
              <div className="relative z-10 flex h-[320px] flex-col justify-between p-4 sm:p-6">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className="truncate text-[10px] font-semibold text-white/68">
                    {scoreLoading ? 'Syncing live board' : featuredScore?.time || scoreFeed?.displayDate || 'World Cup matchday board'}
                  </span>
                  {scoreMarketMatched ? (
                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-black leading-none text-white shadow-sm backdrop-blur-sm">
                      <img src={POLYMARKET_LOGO} alt="" className="h-3.5 w-3.5" />
                      Trade
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-black leading-none text-white/75 shadow-sm backdrop-blur-sm">
                      <img src={POLYMARKET_LOGO} alt="" className="h-3.5 w-3.5 opacity-80" />
                      Route
                    </span>
                  )}
                  <span className={[
                    'justify-self-end rounded-full px-2.5 py-1 text-[10px] font-bold uppercase leading-none ring-1',
                    scoreState?.tag === 'LIVE'
                      ? 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/30'
                      : 'bg-white/12 text-white/85 ring-white/15',
                  ].join(' ')}>
                    {scoreLoading ? 'SYNC' : scoreState?.tag || (scoresReady ? 'LIVE' : 'EMPTY')}
                  </span>
                </div>

                {scoresEmpty ? (
                  <div className="flex min-h-[160px] items-center justify-center text-center">
                    <div className="mx-auto max-w-[300px] rounded-2xl border border-white/12 bg-black/35 px-4 py-4 shadow-2xl backdrop-blur-sm">
                      <p className="text-[18px] font-black tracking-tight text-white">{scoresEmptyTitle}</p>
                      <p className="mt-2 text-[11px] font-semibold leading-5 text-white/62">{scoresEmptyDetail}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        {scoreFeed?.updatedAt ? `Updated ${relativeNewsTime(scoreFeed.updatedAt)}` : 'Waiting for provider'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-[160px] grid-cols-[minmax(0,1fr)_78px_minmax(0,1fr)] items-center gap-2">
                    <div className="min-w-0 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/30 shadow-xl ring-1 ring-white/15 backdrop-blur-sm">
                        <TeamFlagMark name={scoreHome} />
                      </div>
                      <p className="mx-auto mt-2 max-w-[8rem] truncate text-[12px] font-black tracking-wide text-white">{scoreHome}</p>
                      {featuredScore?.homeMarketPrice && (
                        <p className="mt-1 text-[9px] font-black uppercase tabular-nums text-white/55">{featuredScore.homeMarketPrice}</p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-black/35 px-2 py-3 text-center shadow-2xl backdrop-blur-sm">
                      {scoreLoading ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/80" />
                      ) : (
                        <p className="text-[22px] font-black tabular-nums text-white">{scoreState?.center || 'vs'}</p>
                      )}
                      <p className="mt-1 truncate text-[9px] font-bold uppercase text-white/55">
                        {scoreError ? 'Retry shortly' : scoreState?.sub || scoreFeed?.displayDate || 'Matchday'}
                      </p>
                      {featuredScore?.drawMarketPrice && (
                        <p className="mt-1.5 text-[9px] font-black uppercase tabular-nums text-white/55">Draw {featuredScore.drawMarketPrice}</p>
                      )}
                    </div>
                    <div className="min-w-0 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/30 shadow-xl ring-1 ring-white/15 backdrop-blur-sm">
                        <TeamFlagMark name={scoreAway || 'Scores'} />
                      </div>
                      <p className="mx-auto mt-2 max-w-[8rem] truncate text-[12px] font-black tracking-wide text-white">{scoreAway || 'Opponent'}</p>
                      {featuredScore?.awayMarketPrice && (
                        <p className="mt-1 text-[9px] font-black uppercase tabular-nums text-white/55">{featuredScore.awayMarketPrice}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-sm">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Live Scores Pulse</p>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-white/82">
                      {scoreError
                        ? 'Scores temporarily unavailable'
                        : featuredScore
                          ? 'Unlock direct Polymarket trading routes'
                          : 'Refresh when the matchday feed updates'}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12px] font-black text-gray-950 shadow-sm">
                    {featuredScore ? <LockKeyhole className="h-4 w-4" /> : <Loader2 className={['h-4 w-4', scoreLoading ? 'animate-spin' : ''].join(' ')} />}
                    {featuredScore ? 'Unlock' : 'Refresh'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <img
                src={brokenImages[hero.id] ? WORLD_GLOBE_IMAGE : hero.image || WORLD_GLOBE_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                onError={() => setBrokenImages(current => ({ ...current, [hero.id]: true }))}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/65 to-gray-950/15" />
              <div className="relative flex h-[320px] flex-col justify-end p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Trending
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-950">
                    {hero.price} USDC
                  </span>
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">{hero.source}</p>
                <h2 className="mt-2 text-[25px] font-black leading-[1.02] tracking-tight text-white sm:text-[30px]">
                  {hero.title}
                </h2>
                <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-white/72">
                  {hero.description}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[12px] font-black text-gray-950 shadow-sm">
                    <LockKeyhole className="h-4 w-4" />
                    {heroCta}
                  </span>
                  <span className="rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
                    {hero.tag}
                  </span>
                </div>
              </div>
            </>
          )}
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.06]"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-500">Create</p>
            <p className="mt-1 text-[14px] font-black tracking-tight text-gray-950 dark:text-white">Monetize with USDC</p>
            <p className="mt-1 text-[12px] leading-5 text-gray-400 dark:text-gray-500">Articles, private links, sports notes, and streaming gates.</p>
          </div>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Creator library</p>
            <p className="mt-0.5 text-[12px] text-gray-400 dark:text-gray-500">Approved creator posts and official drops.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {cards.length}
          </span>
        </div>

        <div className="overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          <div className="flex w-max gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            {([{ id: 'all', label: 'All' }, ...CREATOR_CATEGORIES] as Array<{ id: CreatorCategory | 'all'; label: string; disabled?: boolean }>).map(category => {
              const selected = categoryFilter === category.id
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    if (category.disabled) return
                    setCategoryFilter(category.id)
                  }}
                  disabled={category.disabled}
                  className={[
                    'rounded-lg px-3 py-2 text-[11px] font-bold transition-colors',
                    category.disabled
                      ? 'cursor-not-allowed text-gray-300 dark:text-gray-700'
                      : selected
                        ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                        : 'text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100',
                  ].join(' ')}
                >
                  {category.label}
                  {category.disabled && <span className="ml-1 text-[9px] font-black uppercase">Soon</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="max-h-[430px] space-y-2 overflow-y-auto px-4 pb-4 pt-2 [scrollbar-width:none]">
          {cards.length === 0 && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-sm font-black text-gray-950 dark:text-white">
                {categoryFilter === 'live-scores' ? 'Live scores are syncing' : 'No published posts yet'}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[12px] leading-5 text-gray-400 dark:text-gray-500">
                {categoryFilter === 'live-scores'
                  ? 'Refresh shortly. Hash PayLink only shows current matchday data from the live feed.'
                  : 'Approved creator posts will appear here.'}
              </p>
            </div>
          )}
          {cards.map((card, index) => {
            const countdown = getSportsCountdown(card, now)
            const match = card.match
            if (match) {
              const [home, away] = splitFixtureTitle(match.title)
              const state = matchDisplayState(match)
              const homeFlag = flagUrlForTeam(home, 80)
              const awayFlag = flagUrlForTeam(away, 80)
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => openContent(card)}
                  className="group grid h-[132px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={[
                        'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]',
                        state.tag === 'LIVE'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : state.tag === 'FT'
                            ? 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
                      ].join(' ')}>
                        {state.tag}
                      </span>
                      <span className="truncate text-[10px] font-semibold text-gray-400 dark:text-gray-500">{match.time || scoreFeed?.displayDate}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-center gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {homeFlag ? <img src={homeFlag} alt="" className="h-3.5 w-5 rounded-[3px] object-cover ring-1 ring-gray-200 dark:ring-white/10" /> : <span className="text-[10px] font-black text-gray-500 dark:text-gray-400">{flagEmojiForTeam(home)}</span>}
                          <p className="truncate text-[12px] font-black text-gray-950 dark:text-gray-100">{home}</p>
                        </div>
                        {match.homeMarketPrice && <p className="mt-1 truncate text-[9px] font-black uppercase text-gray-400 dark:text-gray-500">{match.homeMarketPrice}</p>}
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2 py-2 text-center dark:bg-[#111216]">
                        <p className="text-[15px] font-black tabular-nums text-gray-950 dark:text-white">{state.center}</p>
                        <p className="mt-0.5 truncate text-[8px] font-black uppercase text-gray-400 dark:text-gray-500">{state.sub}</p>
                      </div>
                      <div className="min-w-0 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <p className="truncate text-[12px] font-black text-gray-950 dark:text-gray-100">{away || 'Opponent'}</p>
                          {awayFlag ? <img src={awayFlag} alt="" className="h-3.5 w-5 rounded-[3px] object-cover ring-1 ring-gray-200 dark:ring-white/10" /> : <span className="text-[10px] font-black text-gray-500 dark:text-gray-400">{flagEmojiForTeam(away)}</span>}
                        </div>
                        {match.awayMarketPrice && <p className="mt-1 truncate text-[9px] font-black uppercase text-gray-400 dark:text-gray-500">{match.awayMarketPrice}</p>}
                      </div>
                    </div>
                    <p className="mt-3 truncate text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                      {match.marketStatus === 'matched' ? 'Polymarket route available' : 'Trading route pending'}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-gray-950 px-3 py-2 text-white">
                    <LockKeyhole className="h-4 w-4" />
                    <span className="text-[10px] font-black">{card.cta || 'Unlock'}</span>
                  </span>
                </button>
              )
            }
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => openContent(card)}
                className="group flex h-[132px] w-full gap-3 rounded-2xl border border-gray-100 bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
              >
                <div className="relative h-full w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-white/[0.06]">
                  <img
                    src={brokenImages[card.id] ? WORLD_GLOBE_IMAGE : card.image || WORLD_GLOBE_IMAGE}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    onError={() => setBrokenImages(current => ({ ...current, [card.id]: true }))}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 to-transparent" />
                  {countdown && (
                    <div className="absolute inset-x-1.5 top-1.5 rounded-full bg-white/90 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[0.12em] text-gray-950 backdrop-blur">
                      {countdown.isLive ? 'Pay to view live' : `Starts in ${countdown.label}`}
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-full bg-white/90 px-2 py-1 text-center text-[8px] font-bold uppercase tracking-[0.12em] text-gray-950">
                    {card.tag}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-1">
                  <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                      {card.author || card.source}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[13px] font-black leading-[1.2] text-gray-950 dark:text-gray-100">
                      {card.title}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-950 px-2 py-1 text-[9px] font-bold text-white">
                    {card.price}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
                  {card.description}
                </p>
                  </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                    {card.xHandle ? `@${card.xHandle.replace(/^@/, '')}` : card.source}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {card.editable && card.draft && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.stopPropagation()
                          onEdit(card)
                        }}
                        onKeyDown={event => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          onEdit(card)
                        }}
                        className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                      >
                        Edit
                      </span>
                    )}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-950 dark:text-gray-100">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      {card.cta || (card.action === 'gate' ? 'Unlock' : 'Create')}
                    </span>
                  </span>
                </div>
                {index === 0 && approvedSessionPosts.length > 0 && (
                  <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase text-emerald-600">
                    Approved from your session
                  </span>
                )}
              </div>
            </button>
            )
          })}
        </div>

      </section>

      <div className="border-t border-gray-100 pt-4 pb-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 dark:border-white/10">
        <a
          href="mailto:support@hashpaylink.com"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors dark:text-gray-500 dark:hover:text-gray-200"
        >
          <Mail className="h-3.5 w-3.5" />
          support@hashpaylink.com
        </a>
        <a
          href="https://x.com/Streampay_"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors dark:text-gray-500 dark:hover:text-gray-200"
        >
          <XIcon className="h-3.5 w-3.5" />
          @Streampay_
        </a>
      </div>
    </div>
  )
}

// Creator earnings panel.

function SettlementDashboard({
  initialGateLink,
  published,
}: {
  initialGateLink?: string
  published: PublishedContent[]
}) {
  const [gateInput,   setGateInput]   = useState('')
  const [contentId,   setContentId]   = useState('')
  const [viewers,     setViewers]     = useState<ViewerRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [settlingFor, setSettlingFor] = useState<string | null>(null)
  const [settledTxs,  setSettledTxs]  = useState<Record<string, string>>({})
  const [errors,      setErrors]      = useState<Record<string, string>>({})

  useEffect(() => {
    if (!initialGateLink || gateInput) return
    handleGateInput(initialGateLink)
  }, [initialGateLink, gateInput])

  // Parse gate link or raw contentId as the user types
  function handleGateInput(val: string) {
    setGateInput(val)
    const id = parseContentId(val)
    if (id !== contentId) {
      setContentId(id)
      setViewers([])
      setSettledTxs({})
      setErrors({})
    }
  }

  function selectPublishedGate(content: PublishedContent) {
    if (!content.gateLink) return
    handleGateInput(content.gateLink)
  }

  // Fetch all viewers who have signed for this contentId
  const fetchViewers = useCallback(async (id: string) => {
    if (!id.trim()) { setViewers([]); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/list-viewers?id=${encodeURIComponent(id.trim())}`)
      const data = await res.json() as { ok: boolean; viewers?: ViewerRow[] }

      const serverRows: ViewerRow[] = (data.ok && data.viewers) ? data.viewers : []
      const localRows  = getLocalVaults(id.trim())

      // Merge: prefer server entry if both exist for same viewer (server may be fresher)
      const merged = new Map<string, ViewerRow>()
      localRows.forEach(r  => merged.set(r.viewer.toLowerCase(),  r))
      serverRows.forEach(r => merged.set(r.viewer.toLowerCase(), r))  // server overwrites local

      setViewers(Array.from(merged.values()).sort((a, b) => b.ts - a.ts))
    } catch {
      // Network error: fall back to localStorage only.
      setViewers(getLocalVaults(id.trim()))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchViewers(contentId), 500)
    return () => clearTimeout(t)
  }, [contentId, fetchViewers])

  async function handleSettle(viewerAddr: string) {
    setSettlingFor(viewerAddr)
    setErrors(e => ({ ...e, [viewerAddr]: '' }))
    try {
      // Fetch vault from server first, fall back to localStorage
      let vault: GhostVaultEntry | null = null
      const res  = await fetch(`/api/get-vault?id=${encodeURIComponent(contentId)}&viewer=${viewerAddr}`)
      const data = await res.json() as { ok: boolean; vault?: GhostVaultEntry }
      vault = data.ok && data.vault ? data.vault as GhostVaultEntry : readGhostVault(contentId, viewerAddr)

      if (!vault) throw new Error('Vault not found - viewer may need to re-sign')

      const settle = await fetch('/api/settle-poa', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(vault),
      })
      const result = await settle.json() as { ok: boolean; txHash?: string; error?: string }
      if (!result.ok) throw new Error(result.error ?? 'Settlement failed')
      setSettledTxs(t => ({ ...t, [viewerAddr]: result.txHash ?? '' }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrors(err => ({ ...err, [viewerAddr]: msg.slice(0, 140) }))
    } finally {
      setSettlingFor(null)
    }
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[#111216]">
        <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Creator earnings
            </span>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 dark:border-blue-400/20 dark:bg-blue-500/10">
            <p className="text-[13px] font-bold text-gray-900 dark:text-blue-100">My posts and earnings</p>
            <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-blue-200/70">
              Select a post to review viewers and claim to the creator wallet on Arc.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">My posts</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{published.length} published</span>
            </div>
            {published.length > 0 ? (
              <div className="max-h-[250px] space-y-2 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50/70 p-2 [scrollbar-width:none] dark:border-white/10 dark:bg-white/[0.04]">
                {published.map(post => {
                  const selected = !!post.gateLink && parseContentId(post.gateLink) === contentId
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => selectPublishedGate(post)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-all',
                        selected
                          ? 'border-gray-950 bg-white shadow-sm dark:border-white/40 dark:bg-white/[0.08]'
                          : 'border-transparent bg-white/70 hover:border-gray-200 dark:bg-[#111216] dark:hover:border-white/20',
                      ].join(' ')}
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-white/[0.06]">
                        <img src={post.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
                            {post.tag}
                          </span>
                          <span className={[
                            'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]',
                            post.reviewStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : post.reviewStatus === 'rejected'
                                ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
                          ].join(' ')}>
                            {post.reviewStatus || 'pending'}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">{post.price} USDC</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-black text-gray-950 dark:text-gray-100">{post.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">{post.source}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-300">No published posts in this session yet.</p>
                <p className="mt-1 text-[11px] leading-5 text-gray-400 dark:text-gray-500">
                  Publish a post first, or paste a gate link below.
                </p>
              </div>
            )}
          </div>

          {/* Gate link input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Published gate</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Auto-detects ID</span>
            </div>
            <input
              type="text"
              placeholder="Paste gate link or content ID"
              value={gateInput}
              onChange={e => handleGateInput(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors min-h-[48px] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
            />
            {contentId && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Tracking: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{contentId}</span>
                {' '}
                <button
                  onClick={() => fetchViewers(contentId)}
                  className="text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Refresh
                </button>
              </p>
            )}
          </div>

          {/* Viewers list */}
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-[12px] text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
              <VaultSpinner />Looking up payments...
            </div>
          )}

          {!loading && contentId && viewers.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-center text-[12px] text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
              No payments yet. Share your gated link and check back here.
            </div>
          )}

          {!loading && viewers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {viewers.length} payment{viewers.length > 1 ? 's' : ''} ready
              </p>
              {viewers.map(v => {
                const amt    = (Number(v.amountRaw) / 1_000_000).toFixed(6)
                const txHash = settledTxs[v.viewer]
                const err    = errors[v.viewer]
                const busy   = settlingFor === v.viewer

                return (
                  <div key={v.viewer} className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="font-mono text-[12px] text-gray-700 dark:text-gray-200">
                          {v.viewer.slice(0, 8)}...{v.viewer.slice(-6)}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {new Date(v.ts).toLocaleString()}
                        </p>
                      </div>
                      <p className="font-mono text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                        ${amt} <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">USDC</span>
                      </p>
                    </div>

                    {txHash ? (
                      <button
                        type="button"
                        onClick={() => window.open(`https://testnet.arcscan.app/tx/${txHash}`, '_blank', 'noopener,noreferrer')}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckIcon />Settled - View on Arcscan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSettle(v.viewer)}
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-all active:scale-[0.98]"
                        style={!busy
                          ? { background: '#111827', color: '#ffffff' }
                          : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
                      >
                        {busy ? <><Spinner />Settling...</> : 'Claim earnings'}
                      </button>
                    )}

                    {err && (
                      <p className="text-[11px] text-red-500 text-center">{err}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>

      {/* ── Footer links ── */}
      <div className="border-t border-gray-100 pt-4 pb-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 dark:border-white/10">
        <a
          href="mailto:support@hashpaylink.com"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors dark:text-gray-500 dark:hover:text-gray-200"
        >
          <Mail className="h-3.5 w-3.5" />
          support@hashpaylink.com
        </a>
        <a
          href="https://x.com/Streampay_"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors dark:text-gray-500 dark:hover:text-gray-200"
        >
          <XIcon className="h-3.5 w-3.5" />
          @Streampay_
        </a>
      </div>
    </div>
  )
}

export function CreatorAdminPage() {
  const [adminKey, setAdminKey] = useState(() => {
    try {
      window.localStorage.removeItem('streampay_creator_admin_key')
      return window.sessionStorage.getItem('streampay_creator_admin_key') ?? ''
    } catch { return '' }
  })
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [posts, setPosts] = useState<PublishedContent[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const loadPosts = useCallback(async () => {
    if (!adminKey.trim()) {
      setPosts([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/creator-content?status=${encodeURIComponent(status)}`, {
        headers: { 'x-creator-admin-key': adminKey.trim() },
      })
      const data = await res.json() as { ok?: boolean; posts?: ServerCreatorPost[]; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load creator approvals.')
      setPosts((data.posts || []).map(contentFromServerPost))
      try { window.sessionStorage.setItem('streampay_creator_admin_key', adminKey.trim()) } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load creator approvals.')
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [adminKey, status])

  async function reviewPost(post: PublishedContent, action: 'approve' | 'reject') {
    if (!post.contentId) return
    setBusyId(post.contentId)
    setError('')
    try {
      const res = await fetch('/api/admin/creator-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-creator-admin-key': adminKey.trim(),
        },
        body: JSON.stringify({ contentId: post.contentId, action }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Review failed.')
      setPosts(current => current.filter(item => item.contentId !== post.contentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto mb-12 mt-12 w-full max-w-[760px] px-4">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-500">Hidden admin</p>
          <h1 className="mt-1 text-[24px] font-black tracking-tight text-gray-950">Creator approvals</h1>
          <p className="mt-1 text-[13px] leading-5 text-gray-400">
            Review paid posts before they appear in public Discover.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-7">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="password"
              value={adminKey}
              onChange={event => setAdminKey(event.target.value)}
              placeholder="Creator admin key"
              className="min-h-[48px] rounded-xl border-2 border-gray-200 px-4 text-[13px] font-semibold text-gray-800 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-400"
            />
            <button
              type="button"
              onClick={() => loadPosts()}
              disabled={loading || !adminKey.trim()}
              className="min-h-[48px] rounded-xl bg-gray-950 px-5 text-[12px] font-black text-white disabled:bg-gray-100 disabled:text-gray-400"
            >
              {loading ? 'Loading...' : 'Load reviews'}
            </button>
          </div>

          <div className="flex gap-1 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-1">
            {(['pending', 'approved', 'rejected'] as const).map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={[
                  'min-h-10 flex-1 rounded-lg px-3 text-[11px] font-black capitalize transition-colors',
                  status === item ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-white hover:text-gray-900',
                ].join(' ')}
              >
                {item}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="max-h-[680px] space-y-3 overflow-y-auto [scrollbar-width:none]">
            {posts.map(post => (
              <div key={post.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                <div className="flex gap-3">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    <img src={post.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">
                        {post.tag}
                      </span>
                      <span className="rounded-full bg-gray-950 px-2 py-1 text-[9px] font-bold text-white">
                        {post.price} USDC
                      </span>
                    </div>
                    <h2 className="mt-2 text-[15px] font-black leading-tight text-gray-950">{post.title}</h2>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-gray-500">{post.description}</p>
                    <p className="mt-2 truncate text-[11px] font-semibold text-gray-400">
                      {post.author || post.source} · {post.creator ? `${post.creator.slice(0, 8)}...${post.creator.slice(-6)}` : 'Creator'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => post.gateLink && window.open(post.gateLink, '_blank', 'noopener,noreferrer')}
                    className="min-h-10 rounded-xl border border-gray-200 bg-white text-[12px] font-black text-gray-700"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewPost(post, 'reject')}
                    disabled={busyId === post.contentId}
                    className="min-h-10 rounded-xl border border-red-100 bg-red-50 text-[12px] font-black text-red-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewPost(post, 'approve')}
                    disabled={busyId === post.contentId}
                    className="min-h-10 rounded-xl bg-gray-950 text-[12px] font-black text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
            {!loading && adminKey.trim() && posts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                <p className="text-[13px] font-bold text-gray-700">No {status} posts.</p>
                <p className="mt-1 text-[12px] text-gray-400">New creator submissions will appear here after publishing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Creator page.
export function CreatorPage() {
  const [activeTab, setActiveTab] = useState<CreatorTab>('discover')
  const [latestGateLink, setLatestGateLink] = useState('')
  const [publishedContent, setPublishedContent] = useState<PublishedContent[]>([])
  const [latestCreator, setLatestCreator] = useState(() => {
    try { return window.localStorage.getItem('streampay_creator_latest_wallet') ?? '' } catch { return '' }
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<CreatorDraft | null>(null)

  useEffect(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(latestCreator)) return
    let cancelled = false
    fetch(`/api/list-creator-content?creator=${encodeURIComponent(latestCreator)}`)
      .then(res => res.json())
      .then((data: { ok?: boolean; posts?: ServerCreatorPost[] }) => {
        if (cancelled || !data.ok || !Array.isArray(data.posts)) return
        const serverPosts = data.posts.map(contentFromServerPost)
        setPublishedContent(current => {
          const merged = new Map<string, PublishedContent>()
          serverPosts.forEach(item => merged.set(item.contentId || item.id, item))
          current.forEach(item => merged.set(item.contentId || item.id, item))
          return Array.from(merged.values()).slice(0, 12)
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [latestCreator])

  return (
    <div className="w-full max-w-[480px] mx-auto mt-12 mb-12">
      <div className="mb-3 px-1">
        <h1 className="text-[22px] font-black tracking-tight text-gray-950 dark:text-white">Creator Hub</h1>
        <p className="mt-1 text-[13px] leading-5 text-gray-500 dark:text-gray-400">Discover, publish, and earn with USDC.</p>
      </div>
      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <div className="grid grid-cols-3">
          {([
            { id: 'discover', label: 'Discover', helper: 'Paid posts' },
            { id: 'create', label: 'Publish', helper: 'Content' },
            { id: 'earnings', label: 'Earnings', helper: 'Track and claim' },
          ] as const).map(tab => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'min-h-[58px] px-3 py-3 text-left transition-colors',
                  selected
                    ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                    : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-[#111216] dark:text-gray-400 dark:hover:bg-white/[0.06]',
                ].join(' ')}
              >
                <span className="block text-[13px] font-bold">{tab.label}</span>
                <span className={['block text-[10px]', selected ? 'text-white/65 dark:text-gray-950/55' : 'text-gray-400 dark:text-gray-500'].join(' ')}>
                  {tab.helper}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'discover' ? (
        <DiscoverContent
          published={publishedContent}
          onCreate={() => {
            setEditingId(null)
            setEditingDraft(null)
            setActiveTab('create')
          }}
          onEdit={content => {
            if (!content.draft) return
            setEditingId(content.id)
            setEditingDraft(content.draft)
            setActiveTab('create')
          }}
        />
      ) : activeTab === 'create' ? (
        <LinkFactory
          onGateCreated={(link, meta) => {
            setLatestGateLink(link)
            setLatestCreator(meta.creator)
            try { window.localStorage.setItem('streampay_creator_latest_wallet', meta.creator) } catch {}
            setPublishedContent(current => {
              const next = contentFromGate(link, meta, current.length)
              if (!editingId) return [next, ...current].slice(0, 6)
              return current.map(item => item.id === editingId ? { ...next, id: editingId } : item)
            })
            setEditingId(null)
            setEditingDraft(null)
            setActiveTab('discover')
          }}
          onTrackEarnings={() => setActiveTab('earnings')}
          initialDraft={editingDraft}
          draftKey={editingId || 'new'}
        />
      ) : (
        <SettlementDashboard initialGateLink={latestGateLink} published={publishedContent} />
      )}
    </div>
  )
}

// Icons.

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function VaultSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

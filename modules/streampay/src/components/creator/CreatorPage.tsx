import { useCallback, useEffect, useState } from 'react'
import { LockKeyhole, Mail, Plus, TrendingUp, X as XIcon } from 'lucide-react'
import { LinkFactory }            from './LinkFactory'
import { readGhostVault }         from '../../hooks/usePoAStream'
import type { GhostVaultEntry }   from '../../hooks/usePoAStream'

type ViewerRow = { viewer: string; amountRaw: string; ts: number }
type CreatorTab = 'discover' | 'create' | 'earnings'
type CreatorCategory = 'general' | 'sports' | 'ebooks' | 'news' | 'crypto'
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
  editable?: boolean
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  draft?: CreatorDraft
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
type WorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
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
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
}

const FALLBACK_CREATOR_COVERS = [
  '/brand/africa-business-bg.jpeg',
  '/brand/abuja-business-bg.jpeg',
  '/brand/world-globe.png',
]

const CREATOR_CATEGORIES: Array<{ id: CreatorCategory; label: string; disabled?: boolean }> = [
  { id: 'general', label: 'General' },
  { id: 'sports', label: 'Sports' },
  { id: 'ebooks', label: 'Ebooks', disabled: true },
  { id: 'news', label: 'News', disabled: true },
  { id: 'crypto', label: 'Crypto' },
]

const OFFICIAL_DISCOVER_CONTENT: PublishedContent[] = [
  {
    id: 'hashpaylink-creator-primer',
    title: 'How paid creator links settle on Arc',
    description: 'A short Hash PayLink note on content gates, Circle USDC, and why creators can charge per article or private drop.',
    category: 'crypto',
    price: '0.10',
    tag: 'Hash PayLink',
    source: 'Hash PayLink desk',
    image: '/brand/world-globe.png',
  },
  {
    id: 'world-cup-pulse',
    title: 'World Cup market pulse for paid readers',
    description: 'Sports headlines, fixture context, and market-moving notes packaged as unlockable creator analysis.',
    category: 'sports',
    price: '0.10',
    tag: 'World Cup',
    source: 'Hash PayLink Pulse',
    image: '/brand/polymarket-logo.png',
  },
]

function parseContentId(input: string): string {
  try {
    const url = new URL(input.includes('://') ? input : `https://x.com${input}`)
    return url.searchParams.get('id') ?? input.trim()
  } catch { return input.trim() }
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

function contentFromGate(link: string, meta: GateCreatedMeta, index: number): PublishedContent {
  const title = meta.title.trim() || (meta.contentType === 'url' ? 'Private creator drop' : 'Creator article')
  const author = meta.authorName.trim() || 'Creator Studio'
  const xHandle = meta.xHandle.trim()
  return {
    id: `published-${Date.now()}-${index}`,
    contentId: parseContentId(link),
    creator: meta.creator,
    title,
    description: meta.description.trim() || (meta.mode === 'stream'
      ? 'Nano-streaming access is ready. Viewers pay while reading or watching.'
      : 'Fixed-price creator content is ready for paid unlock.'),
    category: meta.category,
    price: formatPrice(String(meta.capRaw / 1_000_000)),
    tag: CREATOR_CATEGORIES.find(category => category.id === meta.category)?.label || 'General',
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
      category: meta.category,
      rateStr: meta.rateStr,
      capStr: meta.capStr,
      mode: meta.mode,
      contentType: meta.contentType,
    },
  }
}

function contentFromServerPost(post: ServerCreatorPost, index: number): PublishedContent {
  const category = CREATOR_CATEGORIES.some(item => item.id === post.category) ? post.category : 'general'
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
    tag: CREATOR_CATEGORIES.find(item => item.id === category)?.label || 'General',
    source: xHandle ? `@${xHandle.replace(/^@/, '')}` : author,
    image: post.coverImage || FALLBACK_CREATOR_COVERS[index % FALLBACK_CREATOR_COVERS.length],
    author,
    xHandle,
    gateLink: post.gateLink,
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
  const [articles, setArticles] = useState<WorldCupArticle[]>([])
  const [approvedPosts, setApprovedPosts] = useState<PublishedContent[]>([])
  const [loading, setLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CreatorCategory | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/poly-worldcup-news')
      .then(res => res.json())
      .then((data: { ok?: boolean; articles?: WorldCupArticle[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.articles)) {
          setArticles(data.articles.slice(0, 4))
        }
      })
      .catch(() => {
        if (!cancelled) setArticles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
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

  const newsCards: PublishedContent[] = articles.map((article, index) => ({
    id: `worldcup-${index}-${article.title}`,
    title: article.title,
    description: article.description,
    category: 'sports',
    price: '0.10',
    tag: article.tag || 'World Cup',
    source: article.source || 'World Cup feed',
    image: article.image || '/brand/polymarket-logo.png',
  }))
  const approvedSessionPosts = published.filter(card => card.reviewStatus === 'approved')
  const allCards = [...approvedSessionPosts, ...approvedPosts, ...OFFICIAL_DISCOVER_CONTENT, ...newsCards]
  const cards = allCards
    .filter(card => categoryFilter === 'all' || card.category === categoryFilter)
    .slice(0, 8)
  const hero = cards[0] || published[0] || newsCards[0] || OFFICIAL_DISCOVER_CONTENT[0]

  function openContent(card: PublishedContent) {
    if (card.gateLink) {
      window.open(card.gateLink, '_blank', 'noopener,noreferrer')
      return
    }
    onCreate()
  }

  return (
    <div className="w-full space-y-4">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => openContent(hero)}
          className="group relative block min-h-[320px] w-full overflow-hidden text-left"
        >
          <img
            src={hero.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/65 to-gray-950/15" />
          <div className="relative flex min-h-[320px] flex-col justify-end p-5 sm:p-6">
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
                {hero.gateLink ? 'Unlock' : 'Create'}
              </span>
              <span className="rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
                {hero.tag}
              </span>
            </div>
          </div>
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 text-left transition-colors hover:bg-gray-50"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-500">Create</p>
            <p className="mt-1 text-[14px] font-black tracking-tight text-gray-950">Monetize with USDC</p>
            <p className="mt-1 text-[12px] leading-5 text-gray-400">Articles, private links, sports notes, and streaming gates.</p>
          </div>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Creator library</p>
            <p className="mt-0.5 text-[12px] text-gray-400">Approved creator posts and official drops.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500">
            {cards.length}
          </span>
        </div>

        <div className="overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          <div className="flex w-max gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
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
                      ? 'cursor-not-allowed text-gray-300'
                      : selected
                        ? 'bg-gray-950 text-white'
                        : 'text-gray-500 hover:bg-white hover:text-gray-900',
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
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => openContent(card)}
              className="group flex w-full gap-3 rounded-2xl border border-gray-100 bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                <img
                  src={card.image}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 to-transparent" />
                <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-full bg-white/90 px-2 py-1 text-center text-[8px] font-bold uppercase tracking-[0.12em] text-gray-950">
                  {card.tag}
                </span>
              </div>
              <div className="min-w-0 flex-1 py-1 pr-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {card.author || card.source}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[13px] font-black leading-[1.2] text-gray-950">
                      {card.title}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-950 px-2 py-1 text-[9px] font-bold text-white">
                    {card.price}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-gray-400">
                  {card.description}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] font-semibold text-gray-400">
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
                        className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-50"
                      >
                        Edit
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-950">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      {card.gateLink ? 'Unlock' : 'Monetize'}
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
          ))}
        </div>

        {loading && (
          <div className="border-t border-gray-100 px-5 py-3 text-center text-[11px] text-gray-400">
            Loading World Cup pulse...
          </div>
        )}
      </section>

      <div className="border-t border-gray-100 pt-4 pb-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <a
          href="mailto:support@hashpaylink.com"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
        >
          <Mail className="h-3.5 w-3.5" />
          support@hashpaylink.com
        </a>
        <a
          href="https://x.com/Streampay_"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Creator earnings
            </span>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            <p className="text-[13px] font-bold text-gray-900">My posts and earnings</p>
            <p className="mt-1 text-[12px] leading-5 text-gray-500">
              Select a post to review viewers and claim to the creator wallet on Arc.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700">My posts</span>
              <span className="text-[11px] text-gray-400">{published.length} published</span>
            </div>
            {published.length > 0 ? (
              <div className="max-h-[250px] space-y-2 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50/70 p-2 [scrollbar-width:none]">
                {published.map(post => {
                  const selected = !!post.gateLink && parseContentId(post.gateLink) === contentId
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => selectPublishedGate(post)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-all',
                        selected ? 'border-gray-950 bg-white shadow-sm' : 'border-transparent bg-white/70 hover:border-gray-200',
                      ].join(' ')}
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        <img src={post.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">
                            {post.tag}
                          </span>
                          <span className={[
                            'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]',
                            post.reviewStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-600'
                              : post.reviewStatus === 'rejected'
                                ? 'bg-red-50 text-red-500'
                                : 'bg-amber-50 text-amber-600',
                          ].join(' ')}>
                            {post.reviewStatus || 'pending'}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400">{post.price} USDC</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-black text-gray-950">{post.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">{post.source}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center">
                <p className="text-[12px] font-semibold text-gray-600">No published posts in this session yet.</p>
                <p className="mt-1 text-[11px] leading-5 text-gray-400">
                  Publish a post first, or paste a gate link below.
                </p>
              </div>
            )}
          </div>

          {/* Gate link input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700">Published gate</span>
              <span className="text-[11px] text-gray-400">Auto-detects ID</span>
            </div>
            <input
              type="text"
              placeholder="Paste gate link or content ID"
              value={gateInput}
              onChange={e => handleGateInput(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors min-h-[48px]"
            />
            {contentId && (
              <p className="text-[11px] text-gray-400">
                Tracking: <span className="font-mono font-semibold text-gray-600">{contentId}</span>
                {' '}
                <button
                  onClick={() => fetchViewers(contentId)}
                  className="text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors"
                >
                  Refresh
                </button>
              </p>
            )}
          </div>

          {/* Viewers list */}
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-[12px] text-gray-400">
              <VaultSpinner />Looking up payments...
            </div>
          )}

          {!loading && contentId && viewers.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-center text-[12px] text-gray-400">
              No payments yet. Share your gated link and check back here.
            </div>
          )}

          {!loading && viewers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500">
                {viewers.length} payment{viewers.length > 1 ? 's' : ''} ready
              </p>
              {viewers.map(v => {
                const amt    = (Number(v.amountRaw) / 1_000_000).toFixed(6)
                const txHash = settledTxs[v.viewer]
                const err    = errors[v.viewer]
                const busy   = settlingFor === v.viewer

                return (
                  <div key={v.viewer} className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="font-mono text-[12px] text-gray-700">
                          {v.viewer.slice(0, 8)}...{v.viewer.slice(-6)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(v.ts).toLocaleString()}
                        </p>
                      </div>
                      <p className="font-mono text-[13px] font-semibold text-gray-800">
                        ${amt} <span className="text-[10px] font-normal text-gray-400">USDC</span>
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
      <div className="border-t border-gray-100 pt-4 pb-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <a
          href="mailto:support@hashpaylink.com"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
        >
          <Mail className="h-3.5 w-3.5" />
          support@hashpaylink.com
        </a>
        <a
          href="https://x.com/Streampay_"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
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
    try { return window.localStorage.getItem('streampay_creator_admin_key') ?? '' } catch { return '' }
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
      try { window.localStorage.setItem('streampay_creator_admin_key', adminKey.trim()) } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load creator approvals.')
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [adminKey, status])

  useEffect(() => {
    void loadPosts()
  }, [loadPosts])

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
      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
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
                  selected ? 'bg-gray-950 text-white' : 'bg-white text-gray-500 hover:bg-gray-50',
                ].join(' ')}
              >
                <span className="block text-[13px] font-bold">{tab.label}</span>
                <span className={['block text-[10px]', selected ? 'text-white/65' : 'text-gray-400'].join(' ')}>
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

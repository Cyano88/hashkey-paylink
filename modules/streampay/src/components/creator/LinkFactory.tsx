import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, useWalletClient } from 'wagmi'
import { keccak256, toBytes, type Address } from 'viem'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  deployCircleEvmEmailWallet,
  signCircleEvmEmailTypedData,
  type CircleEvmEmailSession,
} from '../../../../../src/lib/circleEvmEmailWallet'
import { PRIVY_AUTH_ENABLED } from '../../../../../src/lib/authMode'

const ARC_CHAIN_ID = 5042002
type CreatorCategory = 'worldcup-news' | 'live-scores' | 'ebooks' | 'crypto'

const CREATOR_CATEGORIES: Array<{ id: CreatorCategory; label: string; disabled?: boolean }> = [
  { id: 'worldcup-news', label: 'World Cup News' },
  { id: 'live-scores', label: 'Live Scores' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'ebooks', label: 'Ebooks', disabled: true },
]

const COVER_MAX_DATA_URL_BYTES = 28_000
const COVER_TARGET_WIDTH = 360
const COVER_TARGET_HEIGHT = 203

function normalizeCreatorCategory(value: unknown): CreatorCategory {
  const category = String(value ?? '').trim().toLowerCase()
  if (category === 'news') return 'worldcup-news'
  if (category === 'sports') return 'live-scores'
  if (category === 'general') return 'crypto'
  return CREATOR_CATEGORIES.some(item => item.id === category) ? category as CreatorCategory : 'crypto'
}

const CREATOR_PROOF_TYPES = {
  CreatorContent: [
    { name: 'contentId', type: 'string' },
    { name: 'creator', type: 'address' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'capRaw', type: 'uint256' },
    { name: 'issuedAt', type: 'uint256' },
  ],
}

function makeContentId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function creatorProofMessage(params: {
  contentId: string
  creator: string
  contentHash: string
  capRaw: number
  issuedAt: number
}) {
  return [
    'Publish Hash PayLink Creator Studio content',
    '',
    `Content ID: ${shortId(params.contentId)}`,
    `Creator wallet: ${params.creator}`,
    `Price: ${(params.capRaw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} USDC`,
    'Network: Arc Testnet',
    '',
    'This signature proves you control the creator wallet.',
    'It does not move funds or approve spending.',
    '',
    `Content hash: ${params.contentHash}`,
    `Issued at: ${params.issuedAt}`,
  ].join('\n')
}

function buildGateLink(params: {
  contentId: string
  creator:   string
  rateRaw:   number
  capRaw:    number
  title:     string
  mode:      'unlock' | 'stream'
}): string {
  const { origin, hostname } = window.location
  const p = new URLSearchParams()
  if (!hostname.includes('streampay')) p.set('app', 'streampay')
  p.set('id',  params.contentId)
  p.set('cr',  params.creator)
  p.set('r',   params.rateRaw.toString())
  p.set('cap', params.capRaw.toString())
  p.set('mode', params.mode)
  if (params.title.trim()) p.set('t', params.title.trim())
  return `${origin}/gate?${p.toString()}`
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const record = user as Record<string, unknown>
  const directEmail = record.email
  if (directEmail && typeof directEmail === 'object') {
    const address = (directEmail as Record<string, unknown>).address
    if (typeof address === 'string') return address
  }
  for (const key of ['google', 'apple']) {
    const provider = record[key]
    if (provider && typeof provider === 'object') {
      const email = (provider as Record<string, unknown>).email
      if (typeof email === 'string') return email
    }
  }
  return ''
}

const ALLOWED_ARTICLE_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A'])

function sanitizeArticleHtml(input: string) {
  if (typeof window === 'undefined') return input
  const doc = new DOMParser().parseFromString(`<div>${input || ''}</div>`, 'text/html')
  const root = doc.body.firstElementChild || doc.createElement('div')

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return null

    const element = node as HTMLElement
    if (!ALLOWED_ARTICLE_TAGS.has(element.tagName)) {
      const fragment = doc.createDocumentFragment()
      Array.from(element.childNodes).forEach(child => {
        const cleaned = clean(child)
        if (cleaned) fragment.appendChild(cleaned)
      })
      return fragment
    }

    const tagName =
      element.tagName === 'B' ? 'strong' :
      element.tagName === 'I' ? 'em' :
      element.tagName.toLowerCase()
    const next = doc.createElement(tagName)
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || ''
      try {
        const url = new URL(href, window.location.origin)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          next.setAttribute('href', url.href)
          next.setAttribute('target', '_blank')
          next.setAttribute('rel', 'noopener noreferrer')
        }
      } catch {
        // Drop invalid hrefs but keep readable link text.
      }
    }
    Array.from(element.childNodes).forEach(child => {
      const cleaned = clean(child)
      if (cleaned) next.appendChild(cleaned)
    })
    return next
  }

  const output = doc.createElement('div')
  Array.from(root.childNodes).forEach(child => {
    const cleaned = clean(child)
    if (cleaned) output.appendChild(cleaned)
  })
  return output.innerHTML
}

function articleTextLength(html: string) {
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, '').trim().length
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return (doc.body.textContent || '').trim().length
}

function articleStarterHtml() {
  return ''
}

function dataUrlSize(value: string) {
  return new Blob([value]).size
}

async function compressCoverImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read that image.'))
      img.src = objectUrl
    })

    const ratio = image.width / image.height
    if (ratio < 1.68 || ratio > 1.9) {
      throw new Error('Use a 16:9 cover image, for example 1280 x 720.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = COVER_TARGET_WIDTH
    canvas.height = COVER_TARGET_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare that cover image.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, COVER_TARGET_WIDTH, COVER_TARGET_HEIGHT)

    const mimeTypes = ['image/webp', 'image/jpeg']
    for (const mimeType of mimeTypes) {
      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const dataUrl = canvas.toDataURL(mimeType, quality)
        if (dataUrlSize(dataUrl) <= COVER_MAX_DATA_URL_BYTES) return dataUrl
      }
    }

    throw new Error('Use a less detailed cover image so it can be saved with the post.')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function LinkFactory({
  onGateCreated,
  onTrackEarnings,
  initialDraft,
  draftKey,
}: {
  onGateCreated?: (link: string, meta: {
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
  }) => void
  onTrackEarnings?: () => void
  initialDraft?: {
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
  } | null
  draftKey?: string
}) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    login: loginPrivy,
  } = usePrivy()
  const { wallets: privyWallets } = useWallets()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))
  const connectedPrivyWallet = PRIVY_AUTH_ENABLED && address
    ? privyWallets.find(wallet => wallet.address?.toLowerCase() === address.toLowerCase())
    : undefined
  const hasExternalPrivyEvmWallet = PRIVY_AUTH_ENABLED
    ? !!connectedPrivyWallet && connectedPrivyWallet.walletClientType !== 'privy'
    : !!address

  const [mode,        setMode]        = useState<'unlock' | 'stream'>('unlock')
  const [contentType, setContentType] = useState<'text' | 'url'>('text')
  const [contentBody, setContentBody] = useState(articleStarterHtml())
  const [privateUrl,  setPrivateUrl]  = useState('')
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [authorName,  setAuthorName]  = useState('')
  const [xHandle,     setXHandle]     = useState('')
  const [coverImage,  setCoverImage]  = useState('')
  const [category,    setCategory]    = useState<CreatorCategory>('crypto')
  const [coverError,  setCoverError]  = useState('')
  const [rateStr,     setRateStr]     = useState('0.001')
  const [capStr,      setCapStr]      = useState('0.10')
  const [gateLink,    setGateLink]    = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [storing,     setStoring]     = useState(false)
  const [storeError,  setStoreError]  = useState<string | null>(null)
  const [circleSession, setCircleSession] = useState<CircleEvmEmailSession | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [pendingCircleOpen, setPendingCircleOpen] = useState(false)
  const [showLinkComposer, setShowLinkComposer] = useState(false)
  const [articleLinkUrl, setArticleLinkUrl] = useState('')
  const [articleLinkError, setArticleLinkError] = useState('')
  const articleRef = useRef<HTMLDivElement | null>(null)
  const pendingLinkRange = useRef<Range | null>(null)

  useEffect(() => {
    if (!initialDraft) return
    setMode(initialDraft.mode)
    setContentType(initialDraft.contentType)
    setContentBody(initialDraft.contentBody || articleStarterHtml())
    setPrivateUrl(initialDraft.privateUrl)
    setTitle(initialDraft.title)
    setDescription(initialDraft.description)
    setAuthorName(initialDraft.authorName)
    setXHandle(initialDraft.xHandle)
    setCoverImage(initialDraft.coverImage)
    setCategory(normalizeCreatorCategory(initialDraft.category))
    setRateStr(initialDraft.rateStr)
    setCapStr(initialDraft.capStr)
    setGateLink(null)
    setStoreError(null)
  }, [draftKey, initialDraft])

  const rateNum = parseFloat(rateStr) || 0
  const capNum  = parseFloat(capStr)  || 0

  const privateUrlValid = (() => {
    try { new URL(privateUrl); return true } catch { return false }
  })()

  const hasContent = contentType === 'text'
    ? articleTextLength(contentBody) > 10
    : privateUrlValid
  const hasListingDetails = title.trim().length >= 3 && description.trim().length >= 10 && authorName.trim().length >= 2

  const streamReady = rateNum > 0 && capNum > rateNum
  const creatorAddress = circleSession?.wallet.address || (hasExternalPrivyEvmWallet ? address : '') || ''
  const hasCreatorAddress = /^0x[a-fA-F0-9]{40}$/.test(creatorAddress)
  const canBuild = hasCreatorAddress && capNum > 0 && hasContent && hasListingDetails && (mode === 'unlock' || streamReady)
  const creatorAuthLabel = !privyAuthenticated && PRIVY_AUTH_ENABLED
    ? 'Sign in to publish'
    : hasExternalPrivyEvmWallet
      ? 'Wallet connected'
      : circleSession
        ? 'Circle wallet ready'
        : 'Open Circle wallet'
  const creatorAuthHint = !privyAuthenticated && PRIVY_AUTH_ENABLED
    ? 'Sign in with email to open your creator wallet.'
    : hasExternalPrivyEvmWallet
      ? 'External wallet connected for creator proof'
      : 'Open your Circle Arc wallet to publish.'

  const streamDurationSec = streamReady ? Math.round(capNum / rateNum) : 0
  const streamDurationLabel = streamDurationSec >= 3600
    ? `${(streamDurationSec / 3600).toFixed(1)} hr max`
    : streamDurationSec >= 60
    ? `${Math.round(streamDurationSec / 60)} min max`
    : `${streamDurationSec} sec max`

  async function handleBuild() {
    if (!canBuild || !creatorAddress) return
    setStoreError(null)
    setStoring(true)

    const contentId = makeContentId()
    const content   = contentType === 'text' ? sanitizeArticleHtml(contentBody).trim() : privateUrl.trim()
    const capRaw = Math.round(capNum * 1_000_000)
    const issuedAt = Date.now()
    const contentHash = keccak256(toBytes(content))
    const proofData = {
      domain: {
        name: 'Hash PayLink Creator Studio',
        version: '1',
        chainId: ARC_CHAIN_ID,
        verifyingContract: creatorAddress as Address,
      },
      types: CREATOR_PROOF_TYPES,
      primaryType: 'CreatorContent',
      message: {
        contentId,
        creator: creatorAddress as Address,
        contentHash,
        capRaw: capRaw.toString(),
        issuedAt: issuedAt.toString(),
      },
    } as const

    try {
      const proofType = circleSession ? 'typedData' : 'message'
      const signature = circleSession
        ? await signCircleEvmEmailTypedData({
            session: circleSession,
            data: proofData,
            memo: 'Publish Hash PayLink Creator Studio content',
          })
        : walletClient && address
        ? await walletClient.signMessage({
            account: address,
            message: creatorProofMessage({
              contentId,
              creator: creatorAddress,
              contentHash,
              capRaw,
              issuedAt,
            }),
          })
        : null
      if (!signature) throw new Error('Connect a creator wallet before publishing.')

      const res  = await fetch('/api/store-content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contentId,
          creator: creatorAddress,
          type:    contentType,
          content,
          capRaw,
          rateRaw: Math.round(rateNum * 1_000_000),
          mode,
          title,
          description,
          authorName,
          xHandle,
          coverImage,
          category,
          issuedAt,
          signature,
          proofType,
        }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Failed to store content')

      const nextGateLink = buildGateLink({
        contentId,
        creator: creatorAddress,
        rateRaw: Math.round(rateNum * 1_000_000),
        capRaw:  Math.round(capNum  * 1_000_000),
        title,
        mode,
      })
      setGateLink(nextGateLink)
      onGateCreated?.(nextGateLink, {
        creator: creatorAddress,
        title,
        description,
        authorName,
        xHandle,
        coverImage,
        contentBody,
        privateUrl,
        category,
        rateStr,
        capStr,
        mode,
        contentType,
        capRaw,
      })
      setCopied(false)
    } catch (e: unknown) {
      setStoreError(e instanceof Error ? e.message : 'Server error - try again')
    } finally {
      setStoring(false)
    }
  }

  function handleCopy() {
    if (!gateLink) return
    navigator.clipboard.writeText(gateLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 3_000)
  }

  async function handleCoverUpload(file?: File) {
    setCoverError('')
    setCoverImage('')
    setGateLink(null)
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setCoverError('Use a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setCoverError('Use an image under 1.5 MB.')
      return
    }
    try {
      const compressed = await compressCoverImage(file)
      setCoverImage(compressed)
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Could not save that image.')
    }
  }

  function syncArticleContent() {
    const el = articleRef.current
    if (!el) return
    const next = sanitizeArticleHtml(el.innerHTML)
    setContentBody(next)
    setGateLink(null)
  }

  function focusArticle() {
    articleRef.current?.focus()
  }

  function execArticle(command: string, value?: string) {
    focusArticle()
    document.execCommand(command, false, value)
    syncArticleContent()
  }

  function openArticleLinkComposer() {
    setStoreError(null)
    setArticleLinkError('')
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    pendingLinkRange.current = range && articleRef.current?.contains(range.commonAncestorContainer)
      ? range.cloneRange()
      : null
    setShowLinkComposer(true)
  }

  function submitArticleLink() {
    setArticleLinkError('')
    const href = articleLinkUrl.trim()
    if (!href) {
      setArticleLinkError('Paste a link first.')
      return
    }
    try {
      const url = new URL(href, window.location.origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported protocol')
      focusArticle()
      const selection = window.getSelection()
      if (selection && pendingLinkRange.current) {
        selection.removeAllRanges()
        selection.addRange(pendingLinkRange.current)
      }
      const selectedText = selection?.toString().trim() || ''
      if (selectedText) {
        document.execCommand('createLink', false, url.href)
      } else {
        const label = url.hostname.replace(/^www\./, '') || url.href
        document.execCommand('insertHTML', false, `<a href="${url.href}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      }
      setArticleLinkUrl('')
      setShowLinkComposer(false)
      pendingLinkRange.current = null
      syncArticleContent()
    } catch {
      setArticleLinkError('Use a valid http or https link.')
    }
  }

  function applyArticleFormat(kind: 'bold' | 'italic' | 'underline' | 'heading' | 'quote' | 'list' | 'link') {
    if (kind === 'bold') return execArticle('bold')
    if (kind === 'italic') return execArticle('italic')
    if (kind === 'underline') return execArticle('underline')
    if (kind === 'heading') return execArticle('formatBlock', 'h2')
    if (kind === 'quote') return execArticle('formatBlock', 'blockquote')
    if (kind === 'list') return execArticle('insertUnorderedList')
    return openArticleLinkComposer()
  }

  function handleArticlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    const safe = html ? sanitizeArticleHtml(html) : text.replace(/[<>&]/g, char => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
    }[char] || char)).replace(/\n/g, '<br>')
    document.execCommand('insertHTML', false, safe)
    syncArticleContent()
  }

  function handleArticleInput() {
    syncArticleContent()
  }

  useEffect(() => {
    if (!articleRef.current || contentType !== 'text') return
    const current = sanitizeArticleHtml(articleRef.current.innerHTML)
    const next = sanitizeArticleHtml(contentBody || articleStarterHtml())
    if (current !== next) articleRef.current.innerHTML = next
  }, [contentBody, contentType])

  function clearArticle() {
    setContentBody(articleStarterHtml())
    setGateLink(null)
    requestAnimationFrame(() => {
      if (articleRef.current) articleRef.current.innerHTML = articleStarterHtml()
      focusArticle()
    })
  }

  async function openCreatorCircleWallet(email: string) {
    if (!canUseCircleEvmEmailWallet('arc')) {
      setStoreError('Arc Circle wallet access is not configured.')
      return
    }
    setAuthBusy(true)
    try {
      const session = await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      await deployCircleEvmEmailWallet({ session })
    } catch (err) {
      setStoreError(err instanceof Error ? err.message.slice(0, 160) : 'Circle wallet did not open.')
    } finally {
      setAuthBusy(false)
      setPendingCircleOpen(false)
    }
  }

  useEffect(() => {
    if (!pendingCircleOpen || !PRIVY_AUTH_ENABLED || !privyAuthenticated || !privyEmail || circleSession || hasExternalPrivyEvmWallet || authBusy) return
    void openCreatorCircleWallet(privyEmail)
  }, [pendingCircleOpen, privyAuthenticated, privyEmail, circleSession, hasExternalPrivyEvmWallet, authBusy])

  async function handleConnectCreatorWallet() {
    setStoreError(null)
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      try {
        setPendingCircleOpen(true)
        await loginPrivy()
      } catch (err) {
        setPendingCircleOpen(false)
        setStoreError(err instanceof Error ? err.message.slice(0, 160) : 'Could not open secure sign-in. Refresh and try again if it keeps loading.')
      }
      return
    }
    if (hasExternalPrivyEvmWallet) return
    if (PRIVY_AUTH_ENABLED && !privyEmail) {
      setStoreError('Sign in with email or connect a wallet to publish.')
      return
    }
    if (PRIVY_AUTH_ENABLED) {
      await openCreatorCircleWallet(privyEmail)
    }
  }

  return (
    <div className="w-full">
      <div className="space-y-6">

        {/* Factory card */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Publish content</span>
            </div>

            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
              {([
                { id: 'unlock', label: 'Unlock', desc: 'Fixed price' },
                { id: 'stream', label: 'Stream', desc: 'Pay while viewing' },
              ] as const).map(option => {
                const selected = mode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setMode(option.id); setGateLink(null) }}
                    className="rounded-lg px-3 py-2.5 text-left transition-all"
                    style={selected
                      ? { background: '#111827', color: '#ffffff' }
                      : { background: 'transparent', color: '#6b7280' }}
                  >
                    <span className="block text-[12px] font-bold">{option.label}</span>
                    <span className={['block text-[10px]', selected ? 'text-white/65' : 'text-gray-400'].join(' ')}>
                      {option.desc}
                    </span>
                  </button>
                )
              })}
            </div>

              <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                  <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">Marketplace card</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Shown in Discover before payment.</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:bg-white/[0.08] dark:text-gray-500">
                  16:9 cover
                </span>
              </div>

              <label className="group relative mx-auto block aspect-video w-full max-w-[240px] cursor-pointer overflow-hidden rounded-xl border border-dashed border-gray-200 bg-white transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20">
                {coverImage ? (
                  <img src={coverImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">Upload cover</span>
                    <span className="mt-1 text-[9px] text-gray-400 dark:text-gray-500">16:9 JPG, PNG, or WebP</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={event => handleCoverUpload(event.target.files?.[0])}
                />
              </label>
              {coverImage && (
                <p className="text-center text-[10px] font-semibold text-emerald-600">
                  Cover saved with this post
                </p>
              )}
              {coverError && <p className="text-[11px] text-red-400">{coverError}</p>}

              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Category</span>
                <div className="flex overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 [scrollbar-width:none] dark:border-white/10 dark:bg-[#111216]">
                  <div className="flex min-w-max gap-1">
                    {CREATOR_CATEGORIES.map(option => {
                      const selected = category === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            if (option.disabled) return
                            setCategory(option.id)
                            setGateLink(null)
                          }}
                          disabled={option.disabled}
                          className={[
                            'rounded-lg px-3 py-2 text-[11px] font-bold transition-colors',
                            option.disabled
                              ? 'cursor-not-allowed bg-gray-50 text-gray-300 dark:bg-white/[0.03] dark:text-gray-600'
                              : selected
                                ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100',
                          ].join(' ')}
                        >
                          {option.label}
                          {option.disabled && <span className="ml-1 text-[9px] font-black uppercase">Soon</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Author</span>
                  <input
                    type="text"
                    placeholder="e.g., A. Wills"
                    value={authorName}
                    onChange={e => { setAuthorName(e.target.value); setGateLink(null) }}
                    maxLength={48}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] text-gray-800 placeholder:text-gray-300 transition-colors min-h-[48px] focus:outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">
                    X handle <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500">optional</span>
                  </span>
                  <input
                    type="text"
                    placeholder="@Hash_PayLink"
                    value={xHandle}
                    onChange={e => { setXHandle(e.target.value.replace(/\s/g, '')); setGateLink(null) }}
                    maxLength={32}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] text-gray-800 placeholder:text-gray-300 transition-colors min-h-[48px] focus:outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Title</span>
                <input
                  type="text"
                  placeholder="e.g., World Cup betting pulse"
                  value={title}
                  onChange={e => { setTitle(e.target.value); setGateLink(null) }}
                  maxLength={80}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] text-gray-800 placeholder:text-gray-300 transition-colors min-h-[48px] focus:outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Short description</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">{description.length}/140</span>
                </div>
                <textarea
                  placeholder="A clear teaser that tells viewers what they unlock after paying."
                  value={description}
                  onChange={e => { setDescription(e.target.value); setGateLink(null) }}
                  maxLength={140}
                  rows={3}
                  className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] text-gray-800 placeholder:text-gray-300 transition-colors focus:outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
                />
              </div>
            </div>

            {/* Content type toggle */}
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Content</span>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => { setContentType('text'); setGateLink(null) }}
                  className="rounded-lg py-2.5 text-[12px] font-semibold transition-all"
                  style={contentType === 'text'
                    ? { background: '#111827', color: '#ffffff' }
                    : { background: 'transparent', color: '#6b7280' }}
                >
                  Article
                </button>
                <button
                  type="button"
                  onClick={() => { setContentType('url'); setGateLink(null) }}
                  className="rounded-lg py-2.5 text-[12px] font-semibold transition-all"
                  style={contentType === 'url'
                    ? { background: '#111827', color: '#ffffff' }
                    : { background: 'transparent', color: '#6b7280' }}
                >
                  Private Link
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {contentType === 'text'
                  ? mode === 'unlock'
                    ? 'Paste the content viewers unlock after payment.'
                    : 'Paste content viewers can read while nano-payments accrue.'
                  : mode === 'unlock'
                  ? 'Store a private URL server-side and reveal it only after payment.'
                  : 'Stream access to a private URL while the viewing session is active.'}
              </p>
            </div>

            {/* Native content */}
            {contentType === 'text' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Article Content</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">{articleTextLength(contentBody)} chars</span>
                </div>
                <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm transition-colors focus-within:border-gray-400 dark:border-white/10 dark:bg-[#111216] dark:focus-within:border-white/30">
                  <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-gray-50 px-2 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                    {([
                      ['heading', 'H'],
                      ['bold', 'B'],
                      ['italic', 'I'],
                      ['underline', 'U'],
                      ['quote', '"'],
                      ['list', 'List'],
                      ['link', 'Link'],
                    ] as const).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => applyArticleFormat(kind)}
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-black text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-[#111216] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                        title={kind}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={clearArticle}
                      className="ml-auto rounded-lg px-2 py-1 text-[10px] font-bold text-gray-400 transition-colors hover:bg-white hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                    >
                      Clear
                    </button>
                  </div>
                  {showLinkComposer && (
                    <div className="border-b border-gray-100 bg-white px-2 py-2 dark:border-white/10 dark:bg-[#111216]">
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={articleLinkUrl}
                          onChange={event => {
                            setArticleLinkUrl(event.target.value)
                            setArticleLinkError('')
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              submitArticleLink()
                            }
                            if (event.key === 'Escape') {
                              setShowLinkComposer(false)
                              setArticleLinkUrl('')
                              setArticleLinkError('')
                              pendingLinkRange.current = null
                            }
                          }}
                          autoFocus
                          placeholder="https://example.com"
                          className="min-h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-[12px] font-medium text-gray-700 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-white/30"
                        />
                        <button
                          type="button"
                          onClick={submitArticleLink}
                          className="min-h-9 rounded-lg bg-gray-950 px-3 text-[11px] font-black text-white transition-transform active:scale-[0.98]"
                        >
                          Embed
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowLinkComposer(false)
                            setArticleLinkUrl('')
                            setArticleLinkError('')
                            pendingLinkRange.current = null
                          }}
                          className="min-h-9 rounded-lg px-2 text-[11px] font-bold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                      {articleLinkError && (
                        <p className="mt-1.5 text-[11px] text-red-400">{articleLinkError}</p>
                      )}
                    </div>
                  )}
                  <div
                    ref={articleRef}
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Write or paste the paid article here. Use the toolbar for headings, links, quotes, and emphasis."
                    onInput={handleArticleInput}
                    onPaste={handleArticlePaste}
                    className="min-h-[240px] max-h-[430px] overflow-y-auto px-4 py-4 text-[14px] leading-7 text-gray-800 outline-none empty:before:block empty:before:text-[13px] empty:before:leading-6 empty:before:text-gray-300 empty:before:content-[attr(data-placeholder)] dark:text-gray-100 empty:before:dark:text-gray-600 [&_a]:font-semibold [&_a]:text-blue-600 [&_a]:dark:text-blue-300 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_blockquote]:dark:border-white/20 [&_blockquote]:dark:text-gray-400 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[18px] [&_h2]:font-black [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_strong]:font-black"
                  />
                </div>
                {articleTextLength(contentBody) > 0 && articleTextLength(contentBody) <= 10 && (
                  <p className="text-[11px] text-red-400">Content must be at least 10 characters</p>
                )}
              </div>
            )}

            {/* Private link */}
            {contentType === 'url' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Private Link</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">stored server-side only</span>
                </div>
                <input
                  type="url"
                  placeholder="https://your-private-content.com/..."
                  value={privateUrl}
                  onChange={e => { setPrivateUrl(e.target.value); setGateLink(null) }}
                  className={[
                    'w-full rounded-xl border-2 px-4 py-3 text-[13px] text-gray-800 focus:outline-none transition-colors min-h-[48px] dark:text-gray-100',
                    'placeholder:text-gray-300 dark:placeholder:text-gray-600',
                    privateUrl && !privateUrlValid ? 'border-red-200 bg-red-50/30 dark:border-red-400/30 dark:bg-red-500/10'
                      : privateUrlValid            ? 'border-blue-200 bg-blue-50/20 dark:border-blue-400/30 dark:bg-blue-500/10'
                      :                              'border-gray-200 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:focus:border-white/30',
                  ].join(' ')}
                />
                {privateUrl && !privateUrlValid && (
                  <p className="text-[11px] text-red-400">Enter a valid URL including https://</p>
                )}
              </div>
            )}

            {mode === 'unlock' ? (
              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Access price</span>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors dark:border-white/10 dark:focus-within:border-white/30">
                  <input
                    type="number" min="0.01" step="0.01"
                    value={capStr}
                    onChange={e => { setCapStr(e.target.value); setGateLink(null) }}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold text-gray-800 focus:outline-none min-h-[48px] dark:text-gray-100"
                  />
                  <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-[10px] font-bold text-gray-400 select-none dark:text-gray-500">USDC</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Per second</span>
                  <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors dark:border-white/10 dark:focus-within:border-white/30">
                    <input
                      type="number" min="0.0001" step="0.0001"
                      value={rateStr}
                      onChange={e => { setRateStr(e.target.value); setGateLink(null) }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold text-gray-800 focus:outline-none min-h-[48px] dark:text-gray-100"
                    />
                    <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0 dark:border-white/10 dark:bg-white/[0.04]">
                      <span className="text-[10px] font-bold text-gray-400 select-none dark:text-gray-500">USDC</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Max cap</span>
                  <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors dark:border-white/10 dark:focus-within:border-white/30">
                    <input
                      type="number" min="0.01" step="0.01"
                      value={capStr}
                      onChange={e => { setCapStr(e.target.value); setGateLink(null) }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold text-gray-800 focus:outline-none min-h-[48px] dark:text-gray-100"
                    />
                    <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0 dark:border-white/10 dark:bg-white/[0.04]">
                      <span className="text-[10px] font-bold text-gray-400 select-none dark:text-gray-500">USDC</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {capNum > 0 && (
              <p className="text-[11px] text-gray-400 text-center dark:text-gray-500">
                {mode === 'unlock' ? (
                  <>
                    Viewers pay <span className="font-semibold text-gray-600 dark:text-gray-300">${capStr} USDC</span> to unlock.
                  </>
                ) : streamReady ? (
                  <>
                    Viewers stream <span className="font-semibold text-gray-600 dark:text-gray-300">${rateStr} USDC/sec</span> up to <span className="font-semibold text-gray-600 dark:text-gray-300">${capStr}</span> - {streamDurationLabel}.
                  </>
                ) : (
                  <>Max cap must be greater than the per-second price.</>
                )}
              </p>
            )}
            {!hasListingDetails && (
              <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
                Add author, title, and a short description to publish.
              </p>
            )}

            {/* CTA */}
            {!gateLink ? (
              <>
                {!hasCreatorAddress ? (
                  <button
                    type="button"
                    onClick={handleConnectCreatorWallet}
                    disabled={authBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest min-h-[52px] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: '#f3f4f6', color: '#9ca3af', cursor: authBusy ? 'not-allowed' : 'pointer' }}
                  >
                    {authBusy ? <><Spinner />Opening wallet...</> : creatorAuthLabel}
                  </button>
                ) : (
                  <button
                    onClick={handleBuild}
                    disabled={!canBuild || storing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest min-h-[52px] transition-all active:scale-[0.98]"
                    style={canBuild && !storing
                      ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                      : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
                  >
                    {storing
                      ? <><Spinner />Storing content...</>
                      : mode === 'unlock'
                      ? 'Publish'
                      : 'Publish stream'}
                  </button>
                )}
                {storeError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-500 text-center dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
                    {storeError}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 space-y-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-2.5 w-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {mode === 'unlock' ? 'Content published' : 'Stream published'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-white p-2 dark:border-white/10 dark:bg-[#111216]">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">Content</p>
                      <p className="truncate text-[12px] font-semibold text-gray-700 dark:text-gray-200">{title.trim() || (contentType === 'text' ? 'Article' : 'Private link')}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{mode === 'unlock' ? 'Price' : 'Stream'}</p>
                      <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">
                        {mode === 'unlock' ? `${capStr} USDC` : `${rateStr}/sec`}
                      </p>
                    </div>
                  </div>
                  <p className="break-all font-mono text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{gateLink}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-all min-h-[48px]"
                    style={copied
                      ? { background: '#f9fafb', color: '#374151', border: '2px solid #e5e7eb' }
                      : { background: '#111827', color: '#ffffff',  border: '2px solid #111827' }}
                  >
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  <a
                    href={gateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px] dark:text-gray-200 dark:hover:bg-white/[0.06]"
                    style={{ border: '2px solid #e5e7eb' }}
                  >
                    Test Gate
                  </a>
                </div>
                <button
                  onClick={() => { setGateLink(null); setStoreError(null) }}
                  className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-1 dark:text-gray-500 dark:hover:text-gray-200"
                >
                  Edit post
                </button>
                <button
                  type="button"
                  onClick={onTrackEarnings}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 text-[12px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                >
                  Track earnings
                </button>
              </div>
            )}

            {!hasCreatorAddress && (
              <p className="text-center text-[12px] text-gray-400 dark:text-gray-500">
                {creatorAuthHint}
              </p>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="space-y-3 pt-1">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
            Flow
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              mode === 'unlock'
                ? { n: '1', title: 'Publish', desc: 'Store article text or a private URL' }
                : { n: '1', title: 'Publish', desc: 'Set a per-second price and max cap' },
              { n: '2', title: 'Share', desc: 'Send one paid link to viewers' },
              mode === 'unlock'
                ? { n: '3', title: 'Unlock', desc: 'Arc USDC authorizes access' }
                : { n: '3', title: 'Stream', desc: 'USDC accrues while content is active' },
            ] as const).map(s => (
              <div key={s.n} className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 text-center shadow-sm space-y-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-[11px] font-semibold text-gray-500 dark:border-white/10 dark:text-gray-300">
                  {s.n}
                </span>
                <p className="text-[11px] sm:text-[12px] font-bold text-gray-800 dark:text-gray-100">{s.title}</p>
                <p className="text-[10px] sm:text-[11px] leading-snug text-gray-400 dark:text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
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


import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWalletClient } from 'wagmi'
import { keccak256, toBytes, type Address } from 'viem'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  signCircleEvmEmailTypedData,
  type CircleEvmEmailSession,
} from '../../../../../src/lib/circleEvmEmailWallet'
import { PRIVY_AUTH_ENABLED } from '../../../../../src/lib/authMode'

const ARC_CHAIN_ID = 5042002
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
    'Create a Hash PayLink Creator Studio gate',
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
  if (params.mode === 'unlock') p.set('pay', 'x402')
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

export function LinkFactory({
  onGateCreated,
  onTrackEarnings,
}: {
  onGateCreated?: (link: string) => void
  onTrackEarnings?: () => void
}) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    login: loginPrivy,
  } = usePrivy()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))

  const [mode,        setMode]        = useState<'unlock' | 'stream'>('unlock')
  const [contentType, setContentType] = useState<'text' | 'url'>('text')
  const [contentBody, setContentBody] = useState('')
  const [privateUrl,  setPrivateUrl]  = useState('')
  const [title,       setTitle]       = useState('')
  const [rateStr,     setRateStr]     = useState('0.001')
  const [capStr,      setCapStr]      = useState('0.10')
  const [gateLink,    setGateLink]    = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [storing,     setStoring]     = useState(false)
  const [storeError,  setStoreError]  = useState<string | null>(null)
  const [circleSession, setCircleSession] = useState<CircleEvmEmailSession | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const rateNum = parseFloat(rateStr) || 0
  const capNum  = parseFloat(capStr)  || 0

  const privateUrlValid = (() => {
    try { new URL(privateUrl); return true } catch { return false }
  })()

  const hasContent = contentType === 'text'
    ? contentBody.trim().length > 10
    : privateUrlValid

  const streamReady = rateNum > 0 && capNum > rateNum
  const creatorAddress = circleSession?.wallet.address || address || ''
  const hasCreatorAddress = /^0x[a-fA-F0-9]{40}$/.test(creatorAddress)
  const canBuild = hasCreatorAddress && capNum > 0 && hasContent && (mode === 'unlock' || streamReady)

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
    const content   = contentType === 'text' ? contentBody.trim() : privateUrl.trim()
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
            memo: 'Create Hash PayLink Creator Studio gate',
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
      if (!signature) throw new Error('Connect a creator wallet before creating this link.')

      const res  = await fetch('/api/store-content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contentId,
          creator: creatorAddress,
          type:    contentType,
          content,
          capRaw,
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
      onGateCreated?.(nextGateLink)
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

  async function handleConnectCreatorWallet() {
    setStoreError(null)
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      try {
        await loginPrivy()
      } catch (err) {
        setStoreError(err instanceof Error ? err.message.slice(0, 160) : 'Could not open secure sign-in.')
      }
      return
    }
    if (address) return
    if (PRIVY_AUTH_ENABLED && !privyEmail) {
      setStoreError('Sign in with email or connect a wallet to create creator links.')
      return
    }
    if (PRIVY_AUTH_ENABLED) {
      if (!canUseCircleEvmEmailWallet('arc')) {
        setStoreError('Arc Circle wallet access is not configured.')
        return
      }
      setAuthBusy(true)
      try {
        const session = await connectCircleEvmEmailWallet(privyEmail, 'arc')
        setCircleSession(session)
      } catch (err) {
        setStoreError(err instanceof Error ? err.message.slice(0, 160) : 'Circle wallet did not open.')
      } finally {
        setAuthBusy(false)
      }
    }
  }

  return (
    <div className="w-full">
      <div className="space-y-6">

        {/* Page title */}
        <div className="text-center space-y-1.5">
          <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900">
            Creator<span style={{ color: '#3b82f6' }}>Studio</span>
          </h1>
          <p className="text-[13px] text-gray-400">Create paid links or nano-streaming gates for creator content.</p>
        </div>

        {/* Factory card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

            <div className="flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Create gated content</span>
            </div>

            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1">
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

            {/* Content type toggle */}
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700">Content</span>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1">
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
              <p className="text-[11px] text-gray-400">
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
                  <span className="text-[13px] font-semibold text-gray-700">Article Content</span>
                  <span className="text-[11px] text-gray-400">{contentBody.length} chars</span>
                </div>
                <textarea
                  placeholder="Paste your article, report, essay, or any text content here..."
                  value={contentBody}
                  onChange={e => { setContentBody(e.target.value); setGateLink(null) }}
                  rows={6}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors resize-none"
                />
                {contentBody.length > 0 && contentBody.trim().length <= 10 && (
                  <p className="text-[11px] text-red-400">Content must be at least 10 characters</p>
                )}
              </div>
            )}

            {/* Private link */}
            {contentType === 'url' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-700">Private Link</span>
                  <span className="text-[11px] text-gray-400">stored server-side only</span>
                </div>
                <input
                  type="url"
                  placeholder="https://your-private-content.com/..."
                  value={privateUrl}
                  onChange={e => { setPrivateUrl(e.target.value); setGateLink(null) }}
                  className={[
                    'w-full rounded-xl border-2 px-4 py-3 text-[13px] focus:outline-none transition-colors min-h-[48px]',
                    'placeholder:text-gray-300',
                    privateUrl && !privateUrlValid ? 'border-red-200 bg-red-50/30'
                      : privateUrlValid            ? 'border-blue-200 bg-blue-50/20'
                      :                              'border-gray-200 focus:border-gray-400',
                  ].join(' ')}
                />
                {privateUrl && !privateUrlValid && (
                  <p className="text-[11px] text-red-400">Enter a valid URL including https://</p>
                )}
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700">
                Title <span className="text-[11px] font-normal text-gray-400">optional</span>
              </span>
              <input
                type="text"
                placeholder="e.g., Q2 Strategy Report"
                value={title}
                onChange={e => { setTitle(e.target.value); setGateLink(null) }}
                maxLength={80}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors min-h-[48px]"
              />
            </div>

            {mode === 'unlock' ? (
              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">Access price</span>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors">
                  <input
                    type="number" min="0.01" step="0.01"
                    value={capStr}
                    onChange={e => { setCapStr(e.target.value); setGateLink(null) }}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold focus:outline-none min-h-[48px]"
                  />
                  <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 select-none">USDC</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700">Per second</span>
                  <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors">
                    <input
                      type="number" min="0.0001" step="0.0001"
                      value={rateStr}
                      onChange={e => { setRateStr(e.target.value); setGateLink(null) }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold focus:outline-none min-h-[48px]"
                    />
                    <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                      <span className="text-[10px] font-bold text-gray-400 select-none">USDC</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[13px] font-semibold text-gray-700">Max cap</span>
                  <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors">
                    <input
                      type="number" min="0.01" step="0.01"
                      value={capStr}
                      onChange={e => { setCapStr(e.target.value); setGateLink(null) }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold focus:outline-none min-h-[48px]"
                    />
                    <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                      <span className="text-[10px] font-bold text-gray-400 select-none">USDC</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {capNum > 0 && (
              <p className="text-[11px] text-gray-400 text-center">
                {mode === 'unlock' ? (
                  <>
                    Viewers pay <span className="font-semibold text-gray-600">${capStr} USDC</span> to unlock through Circle Gateway.
                  </>
                ) : streamReady ? (
                  <>
                    Viewers stream <span className="font-semibold text-gray-600">${rateStr} USDC/sec</span> up to <span className="font-semibold text-gray-600">${capStr}</span> - {streamDurationLabel}.
                  </>
                ) : (
                  <>Max cap must be greater than the per-second price.</>
                )}
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
                    {authBusy ? <><Spinner />Opening wallet...</> : 'Connect to create link'}
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
                      ? 'Create gated link'
                      : 'Create stream link'}
                  </button>
                )}
                {storeError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-500 text-center">
                    {storeError}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-2.5 w-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {mode === 'unlock' ? 'Gated link ready' : 'Stream link ready'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-white p-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Content</p>
                      <p className="truncate text-[12px] font-semibold text-gray-700">{title.trim() || (contentType === 'text' ? 'Article' : 'Private link')}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">{mode === 'unlock' ? 'Price' : 'Stream'}</p>
                      <p className="text-[12px] font-semibold text-gray-700">
                        {mode === 'unlock' ? `${capStr} USDC` : `${rateStr}/sec`}
                      </p>
                    </div>
                  </div>
                  <p className="break-all font-mono text-[10px] leading-relaxed text-gray-500">{gateLink}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-all min-h-[48px]"
                    style={copied
                      ? { background: '#f9fafb', color: '#374151', border: '2px solid #e5e7eb' }
                      : { background: '#111827', color: '#ffffff',  border: '2px solid #111827' }}
                  >
                    {copied ? '✓ Copied' : 'Copy Link'}
                  </button>
                  <a
                    href={gateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px]"
                    style={{ border: '2px solid #e5e7eb' }}
                  >
                    Test Gate
                  </a>
                </div>
                <button
                  onClick={() => { setGateLink(null); setStoreError(null) }}
                  className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-1"
                >
                  Edit parameters
                </button>
                <button
                  type="button"
                  onClick={onTrackEarnings}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 text-[12px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Track earnings
                </button>
              </div>
            )}

            {!hasCreatorAddress && (
              <p className="text-center text-[12px] text-gray-400">
                Sign in with email or connect a wallet to create creator links
              </p>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="space-y-3 pt-1">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            How Creator Gateway Works
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              mode === 'unlock'
                ? { n: '1', title: 'Create', desc: 'Store article text or a private URL' }
                : { n: '1', title: 'Create', desc: 'Set a per-second price and max cap' },
              { n: '2', title: 'Share', desc: 'Send one paid link to viewers' },
              mode === 'unlock'
                ? { n: '3', title: 'Unlock', desc: 'Circle Gateway clears USDC on Arc' }
                : { n: '3', title: 'Stream', desc: 'USDC accrues while content is active' },
            ] as const).map(s => (
              <div key={s.n} className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 text-center shadow-sm space-y-1.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-[11px] font-semibold text-gray-500">
                  {s.n}
                </span>
                <p className="text-[11px] sm:text-[12px] font-bold text-gray-800">{s.title}</p>
                <p className="text-[10px] sm:text-[11px] leading-snug text-gray-400">{s.desc}</p>
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

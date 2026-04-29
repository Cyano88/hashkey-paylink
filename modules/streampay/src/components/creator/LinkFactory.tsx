import { useState } from 'react'
import { useAccount } from 'wagmi'

// Derives a deterministic content ID from the creator address + URL slug
function makeContentId(url: string, creator: string): string {
  try {
    const u    = new URL(url)
    const slug = u.pathname.replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase()
    return `${creator.slice(2, 8).toLowerCase()}${slug || Date.now().toString(36)}`
  } catch {
    return `${creator.slice(2, 8).toLowerCase()}${Date.now().toString(36)}`
  }
}

function buildGateLink(params: {
  contentId: string
  creator:   string
  rateRaw:   number  // USDC/sec × 1e6
  capRaw:    number  // cap USDC × 1e6
  url:       string
  title:     string
}): string {
  const { origin, hostname } = window.location
  const p = new URLSearchParams()
  if (!hostname.includes('streampay')) p.set('app', 'streampay')
  p.set('id',  params.contentId)
  p.set('cr',  params.creator)
  p.set('r',   params.rateRaw.toString())
  p.set('cap', params.capRaw.toString())
  p.set('u',   params.url)
  if (params.title.trim()) p.set('t', params.title.trim())
  return `${origin}/gate?${p.toString()}`
}

export function LinkFactory() {
  const { address, isConnected } = useAccount()

  const [contentUrl, setContentUrl] = useState('')
  const [title,      setTitle]      = useState('')
  const [rateStr,    setRateStr]    = useState('0.001')
  const [capStr,     setCapStr]     = useState('0.10')
  const [gateLink,   setGateLink]   = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  const rateNum  = parseFloat(rateStr) || 0
  const capNum   = parseFloat(capStr)  || 0
  const urlValid = (() => { try { new URL(contentUrl); return true } catch { return false } })()
  const canBuild = isConnected && !!address && urlValid && rateNum > 0 && capNum > rateNum

  const sessionDurationSec = rateNum > 0 ? Math.round(capNum / rateNum) : 0
  const sessionDurationLabel = sessionDurationSec >= 3600
    ? `${(sessionDurationSec / 3600).toFixed(1)}h`
    : sessionDurationSec >= 60
    ? `${Math.round(sessionDurationSec / 60)}m`
    : `${sessionDurationSec}s`

  function handleBuild() {
    if (!canBuild || !address) return
    const contentId = makeContentId(contentUrl, address)
    setGateLink(buildGateLink({
      contentId,
      creator: address,
      rateRaw: Math.round(rateNum * 1_000_000),
      capRaw:  Math.round(capNum  * 1_000_000),
      url:     contentUrl,
      title,
    }))
    setCopied(false)
  }

  function handleCopy() {
    if (!gateLink) return
    navigator.clipboard.writeText(gateLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 3_000)
  }

  return (
    <div className="w-full max-w-[480px] mx-auto mt-12">
      <div className="space-y-6">

        {/* Page title */}
        <div className="text-center space-y-1.5">
          <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900">
            Creator<span style={{ color: '#3b82f6' }}>Studio</span>
          </h1>
          <p className="text-[13px] text-gray-400">Gate any URL · earn USDC per second of attention</p>
        </div>

        {/* Factory card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

            <div className="flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Link Factory</span>
            </div>

            {/* Content URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-700">Content URL</span>
                <span className="text-[11px] text-gray-400">article, video, doc…</span>
              </div>
              <input
                type="url"
                placeholder="https://your-article.com/post-slug"
                value={contentUrl}
                onChange={e => { setContentUrl(e.target.value); setGateLink(null) }}
                className={[
                  'w-full rounded-xl border-2 px-4 py-3 text-[13px] focus:outline-none transition-colors min-h-[48px]',
                  'placeholder:text-gray-300',
                  contentUrl && !urlValid ? 'border-red-200 bg-red-50/30'
                    : urlValid            ? 'border-blue-200 bg-blue-50/20'
                    :                       'border-gray-200 focus:border-gray-400',
                ].join(' ')}
              />
              {contentUrl && !urlValid && (
                <p className="text-[11px] text-red-400">Enter a valid URL including https://</p>
              )}
            </div>

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

            {/* Drip Rate + Session Cap */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">Drip Rate</span>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 focus-within:border-gray-400 transition-colors">
                  <input
                    type="number" min="0.0001" step="0.0001"
                    value={rateStr}
                    onChange={e => { setRateStr(e.target.value); setGateLink(null) }}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[13px] font-semibold focus:outline-none min-h-[48px]"
                  />
                  <div className="flex items-center px-2 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 select-none">$/SEC</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">Session Cap</span>
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

            {/* Session math hint */}
            {rateNum > 0 && capNum > rateNum && (
              <p className="text-[11px] text-gray-400 text-center">
                Viewer pays up to{' '}
                <span className="font-semibold text-gray-600">${capStr} USDC</span>
                {' '}over a max session of{' '}
                <span className="font-semibold text-gray-600">{sessionDurationLabel}</span>
              </p>
            )}
            {capNum > 0 && capNum <= rateNum && (
              <p className="text-[11px] text-red-400 text-center">Cap must be greater than the per-second rate</p>
            )}

            {/* CTA */}
            {!gateLink ? (
              <button
                onClick={handleBuild}
                disabled={!canBuild}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest min-h-[52px] transition-all active:scale-[0.98]"
                style={canBuild
                  ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                  : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
              >
                {!isConnected ? 'CONNECT WALLET FIRST' : 'GENERATE STREAM LINK'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Your Gate Link</p>
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
                    Preview Gate
                  </a>
                </div>
                <button
                  onClick={() => setGateLink(null)}
                  className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-1"
                >
                  Edit parameters
                </button>
              </div>
            )}

            {!isConnected && (
              <p className="text-center text-[12px] text-gray-400">
                Connect your wallet above to generate links
              </p>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="space-y-3 pt-1">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            How Creator Streams Work
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              { n: '1', title: 'Gate content', desc: 'Wrap any URL behind a PoA paywall' },
              { n: '2', title: 'Viewer pays',  desc: 'USDC drips while they actively read' },
              { n: '3', title: 'You claim',    desc: 'Settle all viewer sigs in one tx'   },
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

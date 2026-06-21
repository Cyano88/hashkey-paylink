import { useCallback, useEffect, useState } from 'react'
import { useAccount }             from 'wagmi'
import { Mail, X as XIcon }       from 'lucide-react'
import { LinkFactory }            from './LinkFactory'
import { readGhostVault }         from '../../hooks/usePoAStream'
import type { GhostVaultEntry }   from '../../hooks/usePoAStream'

type ViewerRow = { viewer: string; amountRaw: string; ts: number }

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

// Creator earnings panel.

function SettlementDashboard({ initialGateLink }: { initialGateLink?: string }) {
  const { isConnected } = useAccount()

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
            <span className="flex gap-0.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Creator earnings
            </span>
          </div>

          {/* Gate link input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700">Gate link</span>
              <span className="text-[11px] text-gray-400">Auto-detects content</span>
            </div>
            <input
              type="text"
              placeholder="Paste a creator gate link or content ID"
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
                        <CheckIcon />Settled · View on Arcscan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSettle(v.viewer)}
                        disabled={busy || !isConnected}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-all active:scale-[0.98]"
                        style={!busy && isConnected
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

          {!isConnected && (
            <p className="text-center text-[12px] text-gray-400">
              Connect your wallet above to view and claim earnings
            </p>
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

// Creator page.
export function CreatorPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'earnings'>('create')
  const [latestGateLink, setLatestGateLink] = useState('')

  return (
    <div className="w-full max-w-[480px] mx-auto mt-12 mb-12">
      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="grid grid-cols-2">
          {([
            { id: 'create', label: 'Create', helper: 'Paid content links' },
            { id: 'earnings', label: 'Earnings', helper: 'Track and claim' },
          ] as const).map(tab => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'min-h-[58px] px-4 py-3 text-left transition-colors',
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

      {activeTab === 'create' ? (
        <LinkFactory
          onGateCreated={link => {
            setLatestGateLink(link)
          }}
          onTrackEarnings={() => setActiveTab('earnings')}
        />
      ) : (
        <SettlementDashboard initialGateLink={latestGateLink} />
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

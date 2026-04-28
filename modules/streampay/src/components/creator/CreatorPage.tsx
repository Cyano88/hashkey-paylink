import { useState }              from 'react'
import { useAccount }             from 'wagmi'
import { LinkFactory }            from './LinkFactory'
import { readGhostVault }         from '../../hooks/usePoAStream'
import type { GhostVaultEntry }   from '../../hooks/usePoAStream'

// ── Settlement Dashboard ──────────────────────────────────────────────────────
// Creators input a contentId + viewer address to look up any pending ghost-vault
// signature and settle it on-chain via the PoA relay.

function SettlementDashboard() {
  const { isConnected } = useAccount()

  const [contentId,   setContentId]   = useState('')
  const [viewer,      setViewer]      = useState('')
  const [settling,    setSettling]    = useState(false)
  const [settleTx,    setSettleTx]    = useState<string | null>(null)
  const [settleError, setSettleError] = useState<string | null>(null)

  // Read ghost vault from localStorage (same device) — in production viewers
  // would POST their signed entry to a creator-registry endpoint.
  const ghostEntry: GhostVaultEntry | null =
    contentId.trim() && viewer.trim()
      ? readGhostVault(contentId.trim(), viewer.trim())
      : null

  async function handleClaim() {
    if (!ghostEntry) return
    setSettling(true)
    setSettleError(null)
    try {
      const res  = await fetch('/api/settle-poa', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(ghostEntry),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Settlement failed')
      setSettleTx(data.txHash ?? null)
    } catch (e: unknown) {
      setSettleError(e instanceof Error ? e.message : String(e))
    } finally {
      setSettling(false)
    }
  }

  const accrued = ghostEntry ? Number(ghostEntry.amountRaw) / 1_000_000 : 0

  return (
    <div className="w-full max-w-[480px] mx-auto mt-6 mb-12">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-5">

          <div className="flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Settlement Dashboard
            </span>
          </div>

          <p className="text-[12px] text-gray-400 leading-relaxed">
            Enter a Content ID (from your generated link) and a viewer's wallet address
            to pull their latest ghost-vault signature and settle on Arc.
          </p>

          {/* Inputs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700">Content ID</span>
              <input
                type="text"
                placeholder="from your generated link"
                value={contentId}
                onChange={e => { setContentId(e.target.value); setSettleTx(null) }}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] font-mono placeholder:text-gray-300 placeholder:font-sans focus:outline-none focus:border-gray-400 transition-colors min-h-[48px]"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700">Viewer Address</span>
              <input
                type="text"
                placeholder="0x… viewer's Arc wallet"
                value={viewer}
                onChange={e => { setViewer(e.target.value); setSettleTx(null) }}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] font-mono placeholder:text-gray-300 placeholder:font-sans focus:outline-none focus:border-gray-400 transition-colors min-h-[48px]"
              />
            </div>
          </div>

          {/* Ghost vault preview */}
          {ghostEntry && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-bold text-blue-700">Ghost Vault Found</p>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-blue-600">
                  Accrued:{' '}
                  <span className="font-bold">${accrued.toFixed(6)} USDC</span>
                </p>
                <p className="text-[10px] text-blue-500">
                  {new Date(ghostEntry.ts).toLocaleString()}
                </p>
              </div>
              <p className="font-mono text-[10px] text-blue-400 break-all">
                sig: {ghostEntry.sig.slice(0, 22)}…
              </p>
            </div>
          )}

          {!ghostEntry && contentId && viewer && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center text-[12px] text-gray-400">
              No ghost vault found for this viewer + content pair
            </div>
          )}

          {/* Settle */}
          {settleTx ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3">
                <CheckIcon />
                <span className="text-[13px] font-semibold text-emerald-700">Settlement submitted</span>
              </div>
              <button
                type="button"
                onClick={() => window.open(`https://testnet.arcscan.app/tx/${settleTx}`, '_blank', 'noopener,noreferrer')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExtLinkIcon />
                View on Arcscan
              </button>
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={!ghostEntry || settling || !isConnected}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest min-h-[52px] transition-all active:scale-[0.98]"
              style={ghostEntry && !settling && isConnected
                ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
            >
              {settling ? <><Spinner />Settling…</> : 'CLAIM REVENUE'}
            </button>
          )}

          {settleError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-500 text-center">
              {settleError}
            </div>
          )}

          {!isConnected && (
            <p className="text-center text-[12px] text-gray-400">
              Connect your wallet above to settle
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Creator Page — combines Link Factory + Settlement Dashboard ────────────────
export function CreatorPage() {
  return (
    <>
      <LinkFactory />
      <SettlementDashboard />
    </>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

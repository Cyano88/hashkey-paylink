import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowUpRight, Check, Copy, Loader2, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrivyConnectButton } from '../../../../../src/lib/PrivyConnectButton'

type AgreementStatus = 'awaiting_start' | 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'

type Agreement = {
  id: string
  title?: string
  description?: string
  template?: 'fixed_unlock' | 'progressive_release' | 'milestone'
  amount?: string
  recipient?: string
  durationSeconds?: number
  cancellationWindowSeconds?: number
  checkpoints?: Array<{ label?: string; percentage: number }>
  milestones?: Array<{ label: string; percentage: number }>
  status: AgreementStatus
  chain: null | {
    escrow: string
    amountUsdcUnits: string
    releasedUsdcUnits: string
    remainingUsdcUnits: string
    nextStep: number
    releaseSteps: number
    observedBlockNumber: string
  }
  timeline: Array<{
    id: string
    event: string
    createdAt: string
    receivedAt: string
    observedBlockNumber: string
  }>
  deliveryTimeline: Array<{
    id: string
    event: string
    createdAt: string
  }>
  releaseRequest: null | {
    id: string
    step: number
    status: string
    deliveryNote: string
    evidenceReference: string
    requestedAt?: string
    reviewedAt?: string
    reviewNote?: string
    completedAt?: string
    transactionHash?: string
    updatedAt: string
  }
  updatedAt: string
}

type DashboardResponse = {
  ok: boolean
  project?: { id: string; name: string }
  summary?: { total: number; active: number; awaitingStart: number; closed: number }
  agreements?: Agreement[]
  error?: string
}

const STATUS_LABEL: Record<AgreementStatus, string> = {
  awaiting_start: 'Waiting for payer funding',
  active: 'Active',
  expired: 'Refund available',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const EVENT_LABEL: Record<string, string> = {
  'agreement.activated': 'Agreement funded',
  'agreement.step_released': 'Release confirmed',
  'agreement.expired': 'Agreement ended',
  'agreement.completed': 'Agreement completed',
  'agreement.cancelled': 'Agreement cancelled',
  'agreement.refunded': 'Remaining USDC returned',
  'delivery.submitted': 'Delivery submitted',
  'delivery.updated': 'Delivery updated',
  'delivery.issue_reported': 'Issue reported',
  'delivery.release_approved': 'Release approved',
}

const RELEASE_STATUS: Record<string, string> = {
  awaiting_review: 'Waiting for payer review',
  disputed: 'The payer reported an issue',
  queued: 'Confirming payment on Arc',
  provider_pending: 'Confirming payment on Arc',
  chain_pending: 'Confirming payment on Arc',
  completed: 'Release confirmed',
  failed: 'Release needs review',
  manual_review: 'Release needs review',
}

function formatUsdc(units?: string) {
  try {
    const value = BigInt(units || '0')
    const whole = value / 1_000_000n
    const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${decimal ? `${whole}.${decimal}` : whole} USDC`
  } catch {
    return '0 USDC'
  }
}

function formatDate(value?: string) {
  if (!value) return 'Not started'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not started'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function shortAddress(value?: string) {
  return value && value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value || 'Not available'
}

function templateLabel(value?: Agreement['template']) {
  if (value === 'progressive_release') return 'Progressive release'
  if (value === 'milestone') return 'Milestones'
  return 'One release'
}

function StatusBadge({ status }: { status: AgreementStatus }) {
  const tone = status === 'active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
    : status === 'expired'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300'
      : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300'
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}>{STATUS_LABEL[status]}</span>
}

export default function AgreementDashboard() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [projectName, setProjectName] = useState('Hash PayStream')
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rotatingLink, setRotatingLink] = useState(false)
  const [payerLink, setPayerLink] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [releaseMode, setReleaseMode] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [requestingRelease, setRequestingRelease] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!quiet) setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view agreements.')
      const response = await fetch('/api/hashpaystream/arc-agreements', {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => undefined) as DashboardResponse | undefined
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Agreements could not be loaded.')
      const next = data.agreements ?? []
      setAgreements(next)
      setProjectName(data.project?.name || 'Hash PayStream')
      setActiveId(current => current && next.some(item => item.id === current) ? current : next[0]?.id ?? '')
      setError('')
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'Agreements could not be loaded.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
    if (!authenticated) return
    const timer = window.setInterval(() => void load(true), 15_000)
    const onVisibility = () => document.visibilityState === 'visible' && void load(true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [authenticated, load, ready])

  const active = useMemo(
    () => agreements.find(item => item.id === activeId) ?? agreements[0],
    [activeId, agreements],
  )

  const activity = useMemo(() => {
    if (!active) return []
    return [
      ...active.timeline.map(event => ({ ...event, occurredAt: event.createdAt || event.receivedAt })),
      ...(active.deliveryTimeline ?? []).map(event => ({ ...event, receivedAt: '', observedBlockNumber: '', occurredAt: event.createdAt })),
    ].filter(event => event.occurredAt).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }, [active])
  const activeMilestone = active?.template === 'milestone'
    ? active.milestones?.[active.chain?.nextStep ?? 0]
    : undefined
  const activeCheckpoint = active?.template === 'progressive_release'
    ? active.checkpoints?.[active.chain?.nextStep ?? 0]
    : undefined

  useEffect(() => {
    setPayerLink('')
    setLinkCopied(false)
    setReleaseMode(false)
    setDeliveryNote('')
    setEvidenceReference('')
  }, [active?.id])

  async function rotatePayerLink() {
    if (!active || active.status !== 'awaiting_start') return
    setRotatingLink(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to generate a payer link.')
      const response = await fetch('/api/hashpaystream/arc-agreements', {
        method: 'POST',
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_payer_link', agreementId: active.id }),
      })
      const data = await response.json().catch(() => undefined) as { ok?: boolean; payerReviewPath?: string; error?: string } | undefined
      if (!response.ok || !data?.ok || !data.payerReviewPath) {
        throw new Error(data?.error || 'A new payer link could not be generated.')
      }
      setPayerLink(`https://app.hashpaylink.com${data.payerReviewPath}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A new payer link could not be generated.')
    } finally {
      setRotatingLink(false)
    }
  }

  async function copyPayerLink() {
    if (!payerLink) return
    await navigator.clipboard.writeText(payerLink)
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 1800)
  }

  async function requestRelease() {
    if (!active || active.status !== 'active' || !['fixed_unlock', 'milestone'].includes(active.template ?? '')) return
    setRequestingRelease(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to request this release.')
      const response = await fetch('/api/hashpaystream/arc-agreements', {
        method: 'POST',
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request_release', agreementId: active.id, deliveryNote, evidenceReference }),
      })
      const data = await response.json().catch(() => undefined) as { ok?: boolean; releaseRequest?: Agreement['releaseRequest']; error?: string } | undefined
      if (!response.ok || !data?.ok || !data.releaseRequest) {
        throw new Error(data?.error || 'The release request could not be saved.')
      }
      setAgreements(current => current.map(item => item.id === active.id
        ? { ...item, releaseRequest: data.releaseRequest ?? null }
        : item))
      setReleaseMode(false)
      setDeliveryNote('')
      setEvidenceReference('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The release request could not be saved.')
    } finally {
      setRequestingRelease(false)
    }
  }

  const totals = useMemo(() => agreements.reduce((result, agreement) => {
    const chain = agreement.chain
    if (!chain) return result
    if (agreement.status === 'active') result.activeProtected += BigInt(chain.remainingUsdcUnits || '0')
    if (agreement.status === 'expired') result.refundAvailable += BigInt(chain.remainingUsdcUnits || '0')
    result.released += BigInt(chain.releasedUsdcUnits || '0')
    return result
  }, { activeProtected: 0n, released: 0n, refundAvailable: 0n }), [agreements])

  if (!ready || loading) {
    return (
      <section className="flex min-h-[58vh] w-full max-w-5xl items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300 dark:text-gray-600" />
      </section>
    )
  }

  if (!authenticated) {
    return (
      <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Arc Agreements</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Your protected payments.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
          Sign in with the developer identity that owns this Hash PayStream project.
        </p>
        <PrivyConnectButton
          debugLabel="hashpaystream-agreements"
          className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.99] dark:bg-white dark:text-gray-950"
        >
          Continue with email
        </PrivyConnectButton>
      </section>
    )
  }

  return (
    <section className="w-full max-w-5xl py-8 sm:py-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Arc Testnet</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Agreements</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{projectName} · confirmed from signed lifecycle events</p>
        </div>
        <div className="flex items-center gap-3">
          {agreements.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Updates automatically</p>}
          <Link to="/agreements/new" className="rounded-xl bg-gray-950 px-3.5 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
            New agreement
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
          {error}
        </div>
      )}

      {!error && agreements.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#18181b]">
          <h2 className="text-lg font-semibold text-gray-950 dark:text-white">No agreements yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
            Agreements created through this project will appear here after they are saved.
          </p>
        </div>
      ) : !error && (
        <>
          <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
            {[
              ['Active protected', formatUsdc(totals.activeProtected.toString())],
              ['Released', formatUsdc(totals.released.toString())],
              ['Refund available', formatUsdc(totals.refundAvailable.toString())],
            ].map(([label, value], index) => (
              <div key={label} className={`min-w-0 px-3 py-4 sm:px-5 ${index ? 'border-l border-gray-100 dark:border-white/10' : ''}`}>
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-950 dark:text-white sm:text-base">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className={`space-y-2 ${agreements.length === 1 ? 'hidden lg:block' : ''}`}>
              {agreements.map(agreement => (
                <button
                  type="button"
                  key={agreement.id}
                  onClick={() => setActiveId(agreement.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${active?.id === agreement.id
                    ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-200 bg-white text-gray-950 hover:border-gray-300 dark:border-white/10 dark:bg-[#18181b] dark:text-white dark:hover:border-white/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{agreement.title || 'Arc agreement'}</p>
                      <p className={`mt-1 text-xs ${active?.id === agreement.id ? 'text-white/60 dark:text-gray-500' : 'text-gray-400'}`}>
                        {agreement.chain ? formatUsdc(agreement.chain.amountUsdcUnits) : `${agreement.amount || '0'} USDC`} · {templateLabel(agreement.template)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${active?.id === agreement.id
                      ? 'bg-white/10 text-white dark:bg-gray-100 dark:text-gray-700'
                      : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400'}`}>{STATUS_LABEL[agreement.status]}</span>
                  </div>
                </button>
              ))}
            </div>

            {active && (
              <article className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <StatusBadge status={active.status} />
                    <h2 className="mt-4 text-xl font-semibold tracking-tight text-gray-950 dark:text-white">{active.title || 'Arc agreement'}</h2>
                    {active.description && <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{active.description}</p>}
                  </div>
                  {active.chain?.escrow && (
                    <a
                      href={`https://testnet.arcscan.app/address/${active.chain.escrow}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View escrow on Arcscan"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:text-gray-950 dark:border-white/10 dark:text-gray-400 dark:hover:text-white"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-y border-gray-100 py-5 dark:border-white/10">
                  <Detail label={active.chain ? 'Protected' : 'Agreement amount'} value={active.chain ? formatUsdc(active.chain.amountUsdcUnits) : `${active.amount || '0'} USDC`} />
                  <Detail label="Released" value={formatUsdc(active.chain?.releasedUsdcUnits)} />
                  <Detail label="Remaining" value={formatUsdc(active.chain?.remainingUsdcUnits)} />
                  <Detail label="Release" value={templateLabel(active.template)} />
                  <Detail label="Recipient" value={shortAddress(active.recipient)} />
                  <Detail label="Escrow" value={shortAddress(active.chain?.escrow)} />
                </div>

                {active.chain?.escrow && ['completed', 'cancelled', 'refunded'].includes(active.status) && (
                  <a
                    href={`https://testnet.arcscan.app/address/${active.chain.escrow}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                  >
                    View Arc proof
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}

                {active.status === 'expired' && (
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                    <div><p className="text-xs font-medium text-amber-950 dark:text-amber-100">Refund available</p><p className="mt-1 text-[11px] leading-5 text-amber-800/70 dark:text-amber-200/70">The original payer can return the remaining USDC.</p></div>
                    <a href={`https://app.hashpaylink.com/agreements/${active.id}`} className="shrink-0 rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Open payer review</a>
                  </div>
                )}

                {active.status === 'awaiting_start' && (
                  <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    {payerLink ? (
                      <>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">New private payer link</p>
                        <p className="mt-2 break-all text-xs leading-5 text-gray-500 dark:text-gray-400">{payerLink}</p>
                        <p className="mt-2 text-[11px] leading-5 text-gray-400">The previous payer link no longer works.</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => void copyPayerLink()} className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-900 dark:border-white/10 dark:bg-[#18181b] dark:text-white">
                            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {linkCopied ? 'Copied' : 'Copy link'}
                          </button>
                          <a href={payerLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
                            Open checkout
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">Payer link</p>
                          <p className="mt-1 text-[11px] leading-5 text-gray-400">Generate a new link if the original was not saved.</p>
                        </div>
                        <button type="button" disabled={rotatingLink} onClick={() => void rotatePayerLink()} className="shrink-0 rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950">
                          {rotatingLink ? 'Generating…' : 'Generate link'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {active.status === 'active' && ['fixed_unlock', 'progressive_release', 'milestone'].includes(active.template ?? 'fixed_unlock') && (
                  <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    {activeMilestone && (
                      <div className="mb-4 border-b border-gray-200 pb-4 dark:border-white/10">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                          Milestone {(active.chain?.nextStep ?? 0) + 1} of {active.milestones?.length ?? 0}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{activeMilestone.label}</p>
                          <p className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-300">{activeMilestone.percentage}%</p>
                        </div>
                      </div>
                    )}
                    {activeCheckpoint && (
                      <div className="mb-4 border-b border-gray-200 pb-4 dark:border-white/10">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                          Release {(active.chain?.nextStep ?? 0) + 1} of {active.checkpoints?.length ?? 0}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{activeCheckpoint.label || 'Work progress'}</p>
                          <p className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-300">{activeCheckpoint.percentage}% total</p>
                        </div>
                      </div>
                    )}
                    {active.releaseRequest && active.releaseRequest.status !== 'disputed' ? (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">
                            {['queued', 'provider_pending', 'chain_pending'].includes(active.releaseRequest.status) ? 'Payment approved' : 'Release requested'}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-gray-400">
                            {RELEASE_STATUS[active.releaseRequest.status] || 'Under review'}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 dark:bg-white/[0.07] dark:text-gray-300">
                          {active.releaseRequest.status === 'completed'
                            ? 'Complete'
                            : ['queued', 'provider_pending', 'chain_pending'].includes(active.releaseRequest.status)
                              ? 'Confirming'
                              : 'Pending'}
                        </span>
                      </div>
                    ) : releaseMode ? (
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{activeMilestone ? 'Submit milestone' : activeCheckpoint ? 'Submit progress' : 'Submit delivery'}</p>
                        <p className="mt-1 text-[11px] leading-5 text-gray-400">Tell the payer what was completed and where to review it.</p>
                        <textarea
                          value={deliveryNote}
                          onChange={event => setDeliveryNote(event.target.value)}
                          maxLength={500}
                          placeholder="What was delivered?"
                          className="mt-3 h-20 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-[#18181b] dark:text-white dark:focus:border-white/30"
                        />
                        <input
                          value={evidenceReference}
                          onChange={event => setEvidenceReference(event.target.value)}
                          maxLength={240}
                          inputMode="url"
                          placeholder="https://delivery-link.com"
                          className="mt-3 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-[#18181b] dark:text-white dark:focus:border-white/30"
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" disabled={requestingRelease} onClick={() => setReleaseMode(false)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 disabled:opacity-60 dark:border-white/10 dark:bg-[#18181b] dark:text-gray-200">
                            Cancel
                          </button>
                          <button type="button" disabled={requestingRelease || deliveryNote.trim().length < 12 || !evidenceReference.trim().startsWith('https://')} onClick={() => void requestRelease()} className="rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                            {requestingRelease ? 'Saving…' : 'Submit request'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">
                            {active.releaseRequest?.status === 'disputed' ? 'Delivery needs an update' : activeMilestone ? 'Milestone complete?' : activeCheckpoint ? 'Progress ready?' : 'Work delivered?'}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-gray-400">
                            {active.releaseRequest?.status === 'disputed'
                              ? active.releaseRequest.reviewNote || 'The payer reported an issue with this delivery.'
                              : 'Submit the completed work for payer review.'}
                          </p>
                        </div>
                        <button type="button" onClick={() => setReleaseMode(true)} className="shrink-0 rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
                          {active.releaseRequest?.status === 'disputed' ? 'Update delivery' : activeMilestone ? 'Submit milestone' : activeCheckpoint ? 'Submit progress' : 'Submit delivery'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Activity</h3>
                  {activity.length ? (
                    <div className="mt-3 space-y-0">
                      {activity.map((event, index) => (
                        <div key={event.id} className="flex gap-3">
                          <div className="flex w-3 flex-col items-center">
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                            {index < activity.length - 1 && <span className="min-h-8 w-px flex-1 bg-gray-200 dark:bg-white/10" />}
                          </div>
                          <div className="pb-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{EVENT_LABEL[event.event] || 'Agreement updated'}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{formatDate(event.occurredAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Waiting for the payer to fund this agreement.</p>
                  )}
                </div>
              </article>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

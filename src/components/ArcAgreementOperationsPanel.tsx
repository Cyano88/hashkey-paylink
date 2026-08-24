import { useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  Loader2,
  LockKeyhole,
} from 'lucide-react'
import { cn } from '../lib/utils'

type OperatorActionStatus =
  | 'awaiting_review'
  | 'disputed'
  | 'queued'
  | 'provider_pending'
  | 'chain_pending'
  | 'completed'
  | 'failed'
  | 'manual_review'

type OperatorAction = {
  id: string
  partnerId: string
  agreementId: string
  action: 'release' | 'cancel'
  step?: number
  evidenceHash: string
  evidenceReference: string
  deliveryNote?: string
  reviewPolicy?: 'operations' | 'payer'
  requestHash: string
  requestedBy: string
  requestedAt: string
  status: OperatorActionStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  providerState?: string
  transactionHash?: string
  observedBlockNumber?: string
  completedAt?: string
  failedAt?: string
  lastError?: string
  attempts: number
  updatedAt: string
}

async function evidenceDigest(input: { mode: 'release' | 'cancel'; partnerId: string; agreementId: string; reference: string }) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    version: 1,
    action: input.mode,
    partnerId: input.partnerId,
    agreementId: input.agreementId,
    reference: input.reference.trim(),
  }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `0x${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

type PayerAction = {
  action: 'cancel' | 'refund'
  status: string
  transactionHash?: string
  submittedAt?: string
  confirmedAt?: string
  observedBlockNumber?: string
  lastError?: string
  retryable: boolean
  updatedAt: string
}

type AgreementOperation = {
  partnerId: string
  agreementId: string
  title: string
  description: string
  amount: string
  recipient: string
  template: string
  activationStatus: string
  escrow: string | null
  createdAt: string
  updatedAt: string
  chain: {
    status: 'active' | 'completed' | 'cancelled' | 'refunded' | 'unknown'
    nextStep: number
    releasedUsdcUnits: string
    remainingUsdcUnits: string
    cancelUntil: string
    expiresAt: string
    observedBlockNumber: string
  } | null
  chainUnavailable: boolean
  payerAction: PayerAction | null
  operatorActions: OperatorAction[]
}

type OperationsResponse = {
  ok: boolean
  workerEnabled: boolean
  agreements: AgreementOperation[]
  summary: { total: number; active: number; review: number; attention: number; terminal: number }
  error?: string
}

const EMPTY_SUMMARY = { total: 0, active: 0, review: 0, attention: 0, terminal: 0 }

function formatDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function short(value?: string | null) {
  if (!value) return 'Not available'
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function usdc(units: string) {
  try {
    const value = BigInt(units)
    const whole = value / 1_000_000n
    const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole.toString()
  } catch {
    return '—'
  }
}

function operationState(agreement: AgreementOperation) {
  if (agreement.chainUnavailable) return { label: 'Chain unavailable', tone: 'danger' as const }
  if (agreement.payerAction?.status === 'manual_review'
    || agreement.operatorActions.some(action => ['disputed', 'manual_review', 'failed'].includes(action.status))) {
    return { label: 'Needs review', tone: 'danger' as const }
  }
  if (agreement.operatorActions.some(action => action.status === 'awaiting_review')) {
    return { label: 'Evidence review', tone: 'warning' as const }
  }
  if (agreement.operatorActions.some(action => ['queued', 'provider_pending', 'chain_pending'].includes(action.status))) {
    return { label: 'Processing', tone: 'warning' as const }
  }
  if (agreement.chain?.status === 'active') return { label: 'Active', tone: 'success' as const }
  if (agreement.chain?.status === 'completed') return { label: 'Completed', tone: 'neutral' as const }
  if (agreement.chain?.status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' as const }
  if (agreement.chain?.status === 'refunded') return { label: 'Refunded', tone: 'neutral' as const }
  return { label: 'Activation pending', tone: 'warning' as const }
}

export default function ArcAgreementOperationsPanel() {
  const { getAccessToken, user } = usePrivy()
  const [agreements, setAgreements] = useState<AgreementOperation[]>([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [workerEnabled, setWorkerEnabled] = useState(false)
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestMode, setRequestMode] = useState<'release' | 'cancel' | null>(null)
  const [evidenceReference, setEvidenceReference] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  async function api(method: 'GET' | 'POST', body?: Record<string, unknown>) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/arc-agreement-operations', {
      method,
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => undefined) as OperationsResponse & {
      operatorAction?: OperatorAction
    } | undefined
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Agreement operations request failed.')
    return data
  }

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    try {
      const data = await api('GET')
      setAgreements(data.agreements ?? [])
      setSummary(data.summary ?? EMPTY_SUMMARY)
      setWorkerEnabled(Boolean(data.workerEnabled))
      setActiveId(current => current && data.agreements.some(item => item.agreementId === current)
        ? current
        : data.agreements[0]?.agreementId ?? '')
      if (!quiet) setError('')
    } catch (reason) {
      if (!quiet) {
        setAgreements([])
        setSummary(EMPTY_SUMMARY)
        setError(reason instanceof Error ? reason.message : 'Agreement operations could not be loaded.')
      }
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load({ quiet: true }), 15_000)
    return () => window.clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = useMemo(
    () => agreements.find(item => item.agreementId === activeId) ?? agreements[0],
    [activeId, agreements],
  )

  useEffect(() => {
    setRequestMode(null)
    setEvidenceReference('')
    setReviewNote('')
    setNotice('')
  }, [active?.agreementId])

  async function requestAction() {
    if (!active || !requestMode) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const evidenceHash = await evidenceDigest({
        mode: requestMode,
        partnerId: active.partnerId,
        agreementId: active.agreementId,
        reference: evidenceReference,
      })
      await api('POST', {
        action: requestMode === 'release' ? 'request-release' : 'request-cancel',
        agreementId: active.agreementId,
        partnerId: active.partnerId,
        evidenceReference,
        evidenceHash,
      })
      setRequestMode(null)
      setEvidenceReference('')
      setNotice('Review request saved. A different operator must approve it before any transaction is submitted.')
      await load({ quiet: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The operator request could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function approve(action: OperatorAction) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api('POST', {
        action: 'approve',
        actionId: action.id,
        requestHash: action.requestHash,
        reviewNote,
      })
      setReviewNote('')
      setNotice(result.workerEnabled
        ? 'Evidence approved and queued for guarded execution.'
        : 'Evidence approved and queued. Execution remains disabled.')
      await load({ quiet: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The evidence review could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-7">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Agreements" value={summary.total} />
        <Metric label="Active" value={summary.active} tone="success" />
        <Metric label="Evidence review" value={summary.review} tone="warning" />
        <Metric label="Needs attention" value={summary.attention} tone="danger" />
        <Metric label="Terminal" value={summary.terminal} />
      </div>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="rounded-[1.5rem] border border-gray-200 bg-white p-2 shadow-card dark:border-white/10 dark:bg-[#111216] lg:sticky lg:top-24 lg:w-72">
          {loading ? <ListSkeleton /> : agreements.length ? (
            <div className="space-y-1">
              {agreements.map(agreement => {
                const state = operationState(agreement)
                return (
                  <button
                    key={agreement.agreementId}
                    type="button"
                    onClick={() => setActiveId(agreement.agreementId)}
                    className={cn(
                      'w-full rounded-2xl px-3 py-3 text-left transition',
                      active?.agreementId === agreement.agreementId
                        ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-semibold">{agreement.title}</p>
                      <span className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        state.tone === 'success' && 'bg-emerald-500',
                        state.tone === 'warning' && 'bg-amber-400',
                        state.tone === 'danger' && 'bg-red-500',
                        state.tone === 'neutral' && 'bg-gray-400',
                      )} />
                    </div>
                    <div className={cn(
                      'mt-1.5 flex items-center justify-between text-[10px]',
                      active?.agreementId === agreement.agreementId
                        ? 'text-white/55 dark:text-gray-500'
                        : 'text-gray-400',
                    )}>
                      <span>{agreement.amount ? `${agreement.amount} USDC` : 'Amount unavailable'}</span>
                      <span>{state.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-xs text-gray-400">No Arc Agreements recorded.</div>
          )}
        </aside>

        <section className="min-w-0 flex-1 rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-7">
          {loading ? <DetailSkeleton /> : active ? (
            <AgreementDetail
              agreement={active}
              workerEnabled={workerEnabled}
              currentUserId={user?.id ?? ''}
              busy={busy}
              requestMode={requestMode}
              evidenceReference={evidenceReference}
              reviewNote={reviewNote}
              onRequestMode={setRequestMode}
              onEvidenceReference={setEvidenceReference}
              onReviewNote={setReviewNote}
              onRequest={() => void requestAction()}
              onApprove={action => void approve(action)}
            />
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-gray-400">No agreement selected.</div>
          )}
          {error && <Message tone="error">{error}</Message>}
          {notice && <Message tone="success">{notice}</Message>}
        </section>
      </div>
    </div>
  )
}

function AgreementDetail({
  agreement,
  workerEnabled,
  currentUserId,
  busy,
  requestMode,
  evidenceReference,
  reviewNote,
  onRequestMode,
  onEvidenceReference,
  onReviewNote,
  onRequest,
  onApprove,
}: {
  agreement: AgreementOperation
  workerEnabled: boolean
  currentUserId: string
  busy: boolean
  requestMode: 'release' | 'cancel' | null
  evidenceReference: string
  reviewNote: string
  onRequestMode: (value: 'release' | 'cancel' | null) => void
  onEvidenceReference: (value: string) => void
  onReviewNote: (value: string) => void
  onRequest: () => void
  onApprove: (action: OperatorAction) => void
}) {
  const state = operationState(agreement)
  const latest = agreement.operatorActions[0]
  const openAction = agreement.operatorActions.find(action => (
    ['awaiting_review', 'disputed', 'queued', 'provider_pending', 'chain_pending', 'manual_review'].includes(action.status)
  ))
  const canRequest = agreement.chain?.status === 'active' && !openAction && !agreement.chainUnavailable
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Arc Agreement</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">{agreement.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">{agreement.description}</p>
        </div>
        <Status label={state.label} tone={state.tone} />
      </div>

      <div className="mt-6 rounded-2xl bg-gray-50 p-5 dark:bg-white/[0.045]">
        <p className="text-[11px] font-medium text-gray-400">Protected amount</p>
        <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">
          {agreement.amount || '—'} <span className="text-sm tracking-normal text-gray-400">USDC</span>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 dark:border-white/8 sm:grid-cols-4">
          <Detail label="Released" value={agreement.chain ? `${usdc(agreement.chain.releasedUsdcUnits)} USDC` : '—'} />
          <Detail label="Remaining" value={agreement.chain ? `${usdc(agreement.chain.remainingUsdcUnits)} USDC` : '—'} />
          <Detail label="Next release" value={agreement.chain?.status === 'active' ? `Step ${agreement.chain.nextStep + 1}` : '—'} />
          <Detail label="Confirmed block" value={agreement.chain?.observedBlockNumber ?? '—'} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Route label="Recipient" value={short(agreement.recipient)} />
        <Route label="Escrow" value={short(agreement.escrow)} />
        <Route label="Project" value={agreement.partnerId} />
        <Route label="Agreement" value={agreement.agreementId} />
      </div>

      {agreement.chainUnavailable && (
        <Message tone="error">Confirmed Arc state is unavailable. No operator action can be prepared.</Message>
      )}

      {agreement.payerAction && (
        <section className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-950 dark:text-white">Payer {agreement.payerAction.action}</p>
              <p className="mt-1 text-[11px] text-gray-400">{formatDate(agreement.payerAction.updatedAt)}</p>
            </div>
            <Status
              label={agreement.payerAction.status.replaceAll('_', ' ')}
              tone={agreement.payerAction.status === 'confirmed'
                ? 'success'
                : agreement.payerAction.status === 'manual_review' || agreement.payerAction.status === 'failed'
                  ? 'danger'
                  : 'warning'}
            />
          </div>
          {agreement.payerAction.lastError && (
            <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">{agreement.payerAction.lastError}</p>
          )}
        </section>
      )}

      {openAction?.status === 'awaiting_review' && openAction.reviewPolicy !== 'payer' && (
        <ReviewPanel
          action={openAction}
          currentUserId={currentUserId}
          reviewNote={reviewNote}
          busy={busy}
          onReviewNote={onReviewNote}
          onApprove={() => onApprove(openAction)}
        />
      )}

      {openAction && (openAction.status !== 'awaiting_review' || openAction.reviewPolicy === 'payer') && (
        <ActionState action={openAction} workerEnabled={workerEnabled} />
      )}

      {canRequest && !requestMode && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onRequestMode('release')} className="h-11 rounded-full bg-gray-950 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
            Review next release
          </button>
          <button type="button" onClick={() => onRequestMode('cancel')} className="h-11 rounded-full border border-red-200 text-xs font-semibold text-red-600 dark:border-red-400/20 dark:text-red-300">
            Review cancellation
          </button>
        </div>
      )}

      {canRequest && requestMode && (
        <RequestPanel
          mode={requestMode}
          evidenceReference={evidenceReference}
          busy={busy}
          onEvidenceReference={onEvidenceReference}
          onCancel={() => onRequestMode(null)}
          onSubmit={onRequest}
        />
      )}

      {latest && !openAction && (
        <section className="mt-5">
          <p className="text-xs font-semibold text-gray-950 dark:text-white">Latest operator action</p>
          <div className="mt-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold capitalize text-gray-800 dark:text-gray-200">{latest.action}</p>
              <Status label={latest.status.replaceAll('_', ' ')} tone={latest.status === 'completed' ? 'success' : latest.status === 'failed' ? 'danger' : 'neutral'} />
            </div>
            <p className="mt-2 text-[11px] text-gray-400">{formatDate(latest.updatedAt)}</p>
          </div>
        </section>
      )}
    </div>
  )
}

function ReviewPanel({ action, currentUserId, reviewNote, busy, onReviewNote, onApprove }: {
  action: OperatorAction
  currentUserId: string
  reviewNote: string
  busy: boolean
  onReviewNote: (value: string) => void
  onApprove: () => void
}) {
  const sameReviewer = Boolean(currentUserId && action.requestedBy === currentUserId)
  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
      <div className="flex items-start gap-3">
        <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
            {action.action === 'release' ? `Release step ${(action.step ?? 0) + 1}` : 'Cancel agreement'}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-amber-800/75 dark:text-amber-200/70">{action.evidenceReference}</p>
          {action.deliveryNote && <p className="mt-2 text-[11px] leading-5 text-amber-900 dark:text-amber-100">{action.deliveryNote}</p>}
          <p className="mt-2 break-all font-mono text-[9px] text-amber-700/60 dark:text-amber-200/50">{action.evidenceHash}</p>
        </div>
      </div>
      {sameReviewer ? (
        <p className="mt-4 rounded-xl bg-white/60 px-3 py-2.5 text-[11px] leading-5 text-amber-900 dark:bg-black/10 dark:text-amber-100">
          A different allowlisted operations identity must review this request.
        </p>
      ) : (
        <>
          <textarea
            value={reviewNote}
            onChange={event => onReviewNote(event.target.value)}
            placeholder="Independent review note"
            className="mt-4 h-20 w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-3 text-sm text-gray-950 outline-none focus:ring-4 focus:ring-amber-500/10 dark:border-amber-400/20 dark:bg-black/10 dark:text-white"
          />
          <button
            type="button"
            disabled={busy || reviewNote.trim().length < 8}
            onClick={onApprove}
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {action.action === 'cancel' ? 'Approve cancellation' : 'Approve release'}
          </button>
        </>
      )}
    </section>
  )
}

function ActionState({ action, workerEnabled }: { action: OperatorAction; workerEnabled: boolean }) {
  const danger = action.status === 'disputed' || action.status === 'manual_review' || action.status === 'failed'
  const awaitingPayer = action.status === 'awaiting_review' && action.reviewPolicy === 'payer'
  return (
    <section className={cn(
      'mt-5 rounded-2xl border p-4',
      danger
        ? 'border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10'
        : 'border-blue-200 bg-blue-50 dark:border-blue-400/20 dark:bg-blue-400/10',
    )}>
      <div className="flex items-start gap-3">
        {danger
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />
          : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />}
        <div>
          <p className={cn('text-xs font-semibold', danger ? 'text-red-900 dark:text-red-100' : 'text-blue-900 dark:text-blue-100')}>
            {awaitingPayer
              ? 'Waiting for payer review'
              : action.status === 'queued' && !workerEnabled
              ? 'Reviewed · execution disabled'
              : action.status.replaceAll('_', ' ')}
          </p>
          <p className={cn('mt-1 text-[11px] leading-5', danger ? 'text-red-700/75 dark:text-red-200/70' : 'text-blue-700/75 dark:text-blue-200/70')}>
            {action.lastError
              || (awaitingPayer
                ? 'Only the authenticated payer bound to this agreement can accept or dispute the submitted delivery.'
                : action.status === 'queued' && !workerEnabled
                ? 'The immutable request is queued, but no Circle transaction can be submitted while the operator worker is disabled.'
                : 'The durable journal will recover this exact action without issuing a replacement transaction.')}
          </p>
        </div>
      </div>
    </section>
  )
}

function RequestPanel({ mode, evidenceReference, busy, onEvidenceReference, onCancel, onSubmit }: {
  mode: 'release' | 'cancel'
  evidenceReference: string
  busy: boolean
  onEvidenceReference: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-950 dark:text-white">{mode === 'release' ? 'Review next release' : 'Review cancellation'}</p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">This saves an immutable request. A different operator must approve it.</p>
        </div>
        <LockKeyhole className="h-4 w-4 shrink-0 text-gray-400" />
      </div>
      <input
        value={evidenceReference}
        onChange={event => onEvidenceReference(event.target.value)}
        placeholder={mode === 'release' ? 'Evidence reference' : 'Cancellation reason reference'}
        className="mt-4 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
      />
      <p className="mt-2 text-[11px] leading-5 text-gray-400">Hash PayLink creates the immutable evidence fingerprint automatically.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="h-10 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-white/8 dark:text-gray-200">Keep agreement</button>
        <button type="button" disabled={busy || evidenceReference.trim().length < 6} onClick={onSubmit} className="flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />} Request review
        </button>
      </div>
    </section>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-card dark:border-white/10 dark:bg-[#111216]">
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className={cn(
        'mt-1 text-2xl font-semibold tracking-[-0.035em]',
        tone === 'neutral' && 'text-gray-950 dark:text-white',
        tone === 'success' && 'text-emerald-600 dark:text-emerald-300',
        tone === 'warning' && 'text-amber-600 dark:text-amber-300',
        tone === 'danger' && 'text-red-600 dark:text-red-300',
      )}>{value}</p>
    </div>
  )
}

function Status({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold capitalize',
      tone === 'neutral' && 'bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-300',
      tone === 'success' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
      tone === 'warning' && 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
      tone === 'danger' && 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300',
    )}>{label}</span>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-medium text-gray-400">{label}</p><p className="mt-1 truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{value}</p></div>
}

function Route({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-200 px-3 py-3 dark:border-white/10"><p className="text-[10px] text-gray-400">{label}</p><p className="mt-1 truncate font-mono text-[11px] font-semibold text-gray-700 dark:text-gray-200">{value}</p></div>
}

function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return <p className={cn('mt-4 rounded-xl px-3 py-2.5 text-xs leading-5', tone === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200')}>{children}</p>
}

function ListSkeleton() {
  return <div className="space-y-2 p-1">{[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/8" />)}</div>
}

function DetailSkeleton() {
  return <div><div className="h-6 w-48 animate-pulse rounded bg-gray-100 dark:bg-white/8" /><div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-gray-100 dark:bg-white/8" /><div className="mt-7 h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/8" /></div>
}

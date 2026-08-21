import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import {
  connectCircleEvmEmailWallet,
  executeCircleEvmEmailChallenge,
  type CircleEvmEmailSession,
} from '../lib/circleEvmEmailWallet'
import { PocketPillMark } from '../pocket/components/CPurseIcon'
import { linkPocketWallet } from '../pocket/api/pocketWalletLinkClient'
import UnifiedReceipt from '../components/UnifiedReceipt'
import type { PaylinkReceipt } from '../lib/paymentReceiptPdf'

type AgreementTemplate = 'fixed_unlock' | 'progressive_release' | 'milestone'
type AttemptStatus =
  | 'awaiting_approval'
  | 'approval_submitted'
  | 'ready_to_activate'
  | 'activation_submitted'
  | 'active'
  | 'approval_failed'
  | 'activation_failed'
  | 'reconciliation_failed'

type Agreement = {
  id: string
  partnerId: string
  title: string
  description: string
  amount: string
  recipient: string
  template: AgreementTemplate
  durationSeconds: number
  cancellationWindowSeconds: number
  checkpoints?: Array<{ label?: string; percentage: number }>
  milestones?: Array<{ label: string; percentage: number }>
}

type Attempt = {
  id: string
  status: AttemptStatus
  escrow?: string
  transactions: Array<{
    hash: string
    stage: 'approval' | 'activation'
    status: 'submitted' | 'confirmed' | 'failed'
  }>
  lifecycle?: {
    status: 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'
    nextStep: number
  }
}

type LifecycleAction = {
  action: 'cancel' | 'refund'
  status: 'reserved' | 'issued' | 'transaction_pending' | 'submitted' | 'confirmed' | 'provider_failed' | 'failed' | 'manual_review'
  transactionHash: string | null
  webhookPending?: boolean
  retryable?: boolean
}

type DeliveryReview = {
  id: string
  step: number
  status: 'awaiting_review' | 'disputed' | 'queued' | 'provider_pending' | 'chain_pending' | 'completed' | 'failed' | 'manual_review'
  canReview: boolean
  deliveryNote: string
  evidenceReference: string
  requestedAt: string
  reviewedAt?: string
  reviewNote?: string
  completedAt?: string
  transactionHash: string | null
  updatedAt: string
}

type ReviewResponse = {
  ok: true
  agreement: Agreement
  payer: {
    walletLinked: boolean
    walletAddress: string | null
    network: 'arc'
    creatorFundingBlocked?: boolean
  }
  attempt: Attempt | null
  recovery?: {
    stage: 'approval' | 'activation'
    pending: true
    chainSubmitted: boolean
  } | null
  lifecycle?: {
    available: boolean
    enabled?: boolean
    cancel?: { eligible: boolean; reason: string | null }
    refund?: { eligible: boolean; reason: string | null }
    action?: LifecycleAction | null
  } | null
  delivery?: DeliveryReview | null
  receipt?: PaylinkReceipt | null
}

type ActionResponse = {
  ok: true
  attempt: Attempt
  pending?: boolean
  stage?: 'approval' | 'activation'
  challengeId?: string
  lifecycleAction?: LifecycleAction | null
  delivery?: DeliveryReview | null
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const direct = (user as { email?: { address?: unknown } }).email?.address
  if (typeof direct === 'string') return direct
  const accounts = (user as { linkedAccounts?: unknown }).linkedAccounts
  if (!Array.isArray(accounts)) return ''
  for (const account of accounts) {
    if (!account || typeof account !== 'object') continue
    const record = account as { type?: unknown; address?: unknown; email?: unknown }
    if (record.type === 'email' && typeof record.address === 'string') return record.address
    if (typeof record.email === 'string') return record.email
  }
  return ''
}

function compactAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function durationLabel(seconds: number) {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400
    return `${days} day${days === 1 ? '' : 's'}`
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${Math.ceil(seconds / 60)} minutes`
}

function releaseLabel(agreement: Agreement) {
  if (agreement.template === 'fixed_unlock') return 'One release when complete'
  if (agreement.template === 'progressive_release') {
    return `${agreement.checkpoints?.length ?? 0} scheduled releases`
  }
  return `${agreement.milestones?.length ?? 0} milestone releases`
}

function deliveryContext(agreement: Agreement, delivery: DeliveryReview | null) {
  if (!delivery) return null
  if (agreement.template === 'progressive_release') {
    const checkpoint = agreement.checkpoints?.[delivery.step]
    if (!checkpoint) return null
    return `Release ${delivery.step + 1} of ${agreement.checkpoints?.length ?? 0} · ${checkpoint.percentage}% total`
  }
  if (agreement.template !== 'milestone') return null
  const milestone = agreement.milestones?.[delivery.step]
  if (!milestone) return null
  return `Milestone ${delivery.step + 1} of ${agreement.milestones?.length ?? 0} · ${milestone.label}`
}

function deliveryHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return 'Delivery proof' }
}

function readableError(value: unknown) {
  if (value instanceof Error && value.message) return value.message
  return 'This agreement could not be updated. Try again.'
}

function capabilityForAgreement(agreementId: string) {
  const storageKey = `hashpaylink:arc-agreement-access:${agreementId}`
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const fromUrl = fragment.get('access')?.trim() ?? ''
  if (fromUrl) {
    sessionStorage.setItem(storageKey, fromUrl)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    return fromUrl
  }
  return sessionStorage.getItem(storageKey)?.trim() ?? ''
}

function statusCopy(attempt: Attempt | null, walletLinked: boolean) {
  if (!walletLinked) return 'Continue to connect your Arc wallet.'
  if (!attempt) return 'Review the terms before funding the agreement.'
  if (attempt.status === 'awaiting_approval' || attempt.status === 'approval_failed') {
    return 'Approve the exact USDC amount for this agreement.'
  }
  if (attempt.status === 'ready_to_activate' || attempt.status === 'activation_failed') {
    return 'Fund the Arc escrow after checking the final terms.'
  }
  if (attempt.status === 'approval_submitted' || attempt.status === 'activation_submitted') {
    return 'Confirmation is in progress on Arc.'
  }
  if (attempt.status === 'active') return 'Agreement funded.'
  return 'This agreement needs support review.'
}

export default function ArcAgreementPayerPage() {
  const { agreementId = '' } = useParams()
  const { authenticated, ready, user, getAccessToken, logout } = usePrivy()
  const [capability, setCapability] = useState(() => capabilityForAgreement(agreementId))
  const [review, setReview] = useState<ReviewResponse | null>(null)
  const [session, setSession] = useState<CircleEvmEmailSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmLifecycle, setConfirmLifecycle] = useState<'cancel' | 'refund' | null>(null)
  const [issueMode, setIssueMode] = useState(false)
  const [issueText, setIssueText] = useState('')
  const [payerAddressCopied, setPayerAddressCopied] = useState(false)
  const mounted = useRef(true)
  const identityId = user?.id ?? ''
  const sessionIdentityId = useRef(identityId)

  useEffect(() => {
    if (sessionIdentityId.current === identityId) return
    sessionIdentityId.current = identityId
    setSession(null)
    setReview(null)
    setError('')
    setConfirmLifecycle(null)
    setLoading(true)
  }, [identityId])

  useEffect(() => {
    setCapability(capabilityForAgreement(agreementId))
  }, [agreementId])

  const recoverPayerAccess = useCallback(async () => {
    const identityToken = await getAccessToken()
    if (!identityToken) throw new Error('Sign in with the payer email to recover this agreement.')
    const response = await fetch('/api/v2/agreements/payer', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${identityToken}` },
      body: JSON.stringify({ agreementId, action: 'recover-access' }),
    })
    const data = await response.json().catch(() => ({})) as { ok?: boolean; payerAccessToken?: string; error?: string }
    if (!response.ok || !data.ok || !data.payerAccessToken) {
      throw new Error(data.error || 'This agreement could not be recovered for the signed-in payer.')
    }
    sessionStorage.setItem(`hashpaylink:arc-agreement-access:${agreementId}`, data.payerAccessToken)
    setCapability(data.payerAccessToken)
  }, [agreementId, getAccessToken])

  const request = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const identityToken = await getAccessToken()
    if (!identityToken) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/v2/agreements/payer', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${identityToken}`,
        'x-arc-agreement-access': capability,
      },
      body: JSON.stringify({ agreementId, ...body }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Agreement service is unavailable.')
    }
    return data as T
  }, [agreementId, capability, getAccessToken])

  const loadReview = useCallback(async (quiet = false) => {
    if (!ready) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!capability || !agreementId) {
      if (!agreementId) {
        setError('This agreement link is incomplete.')
        setLoading(false)
        return
      }
      try {
        await recoverPayerAccess()
        setError('')
      } catch (caught) {
        setError(readableError(caught))
      } finally {
        setLoading(false)
      }
      return
    }
    if (!quiet) setLoading(true)
    try {
      const next = await request<ReviewResponse>({ action: 'review' })
      if (mounted.current) {
        setReview(next)
        setError('')
      }
    } catch (caught) {
      if (mounted.current) setError(readableError(caught))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [agreementId, authenticated, capability, ready, recoverPayerAccess, request])

  useEffect(() => {
    mounted.current = true
    void loadReview()
    return () => {
      mounted.current = false
    }
  }, [loadReview])

  useEffect(() => {
    const status = review?.attempt?.status
    const chainRecoveryPending = review?.recovery?.chainSubmitted === true
    if (
      status !== 'approval_submitted'
      && status !== 'activation_submitted'
      && !chainRecoveryPending
    ) return
    const check = () => {
      void request<ActionResponse>({ action: 'status' })
        .then(result => {
          setReview(current => current ? {
            ...current,
            attempt: result.attempt,
            recovery: result.attempt.status === 'approval_submitted' || result.attempt.status === 'activation_submitted'
              ? current.recovery
              : null,
          } : current)
          setError('')
        })
        .catch(caught => setError(readableError(caught)))
    }
    check()
    const timer = window.setInterval(check, 4_000)
    return () => window.clearInterval(timer)
  }, [request, review?.attempt?.status, review?.recovery?.chainSubmitted])

  useEffect(() => {
    const stage = review?.recovery?.stage
    if (!stage || review?.recovery?.chainSubmitted || !session || busy) return
    const recover = () => {
      void request<ActionResponse>({
        action: 'recover',
        stage,
        circleUserToken: session.userToken,
      }).then(result => {
        setReview(current => current ? {
          ...current,
          attempt: result.attempt,
          recovery: result.attempt.status === 'approval_submitted' || result.attempt.status === 'activation_submitted'
            ? null
            : current.recovery,
        } : current)
        setError('')
      }).catch(caught => {
        const message = readableError(caught)
        setError(message)
        if (/expired|cancelled|failed|support review/i.test(message)) {
          setReview(current => current ? { ...current, recovery: null } : current)
        }
      })
    }
    recover()
    const timer = window.setInterval(recover, 4_000)
    return () => window.clearInterval(timer)
  }, [busy, request, review?.recovery?.chainSubmitted, review?.recovery?.stage, session])

  useEffect(() => {
    const lifecycleAction = review?.lifecycle?.action
    const lifecycleStatus = lifecycleAction?.status
    const terminalWebhookPending = lifecycleStatus === 'confirmed' && lifecycleAction?.webhookPending === true
    if (!terminalWebhookPending && !['transaction_pending', 'submitted'].includes(lifecycleStatus ?? '')) return
    const check = () => {
      void request<ActionResponse>({ action: 'lifecycle-status' })
        .then(result => {
          setReview(current => current?.lifecycle ? {
            ...current,
            lifecycle: { ...current.lifecycle, action: result.lifecycleAction ?? null },
          } : current)
          setError('')
        })
        // The transaction may already be confirmed while RPC or webhook
        // reconciliation is briefly unavailable. Preserve the authoritative
        // pending/confirmed state and retry quietly on the next interval.
        .catch(() => undefined)
    }
    check()
    const timer = window.setInterval(check, 4_000)
    return () => window.clearInterval(timer)
  }, [request, review?.lifecycle?.action?.status, review?.lifecycle?.action?.webhookPending])

  useEffect(() => {
    const lifecycleStatus = review?.lifecycle?.action?.status
    if (!session || busy || lifecycleStatus !== 'transaction_pending') return
    const recover = () => {
      void request<ActionResponse>({
        action: 'lifecycle-recover',
        circleUserToken: session.userToken,
      }).then(result => {
        setReview(current => current?.lifecycle ? {
          ...current,
          lifecycle: { ...current.lifecycle, action: result.lifecycleAction ?? null },
        } : current)
        setError('')
      }).catch(() => {
        // Circle can return COMPLETE before the Arc transaction is visible to
        // the reconciliation RPC. Keep polling the durable action instead of
        // presenting a false failure after payer confirmation.
      })
    }
    recover()
    const timer = window.setInterval(recover, 4_000)
    return () => window.clearInterval(timer)
  }, [busy, request, review?.lifecycle?.action?.status, session])

  async function connectWallet() {
    const email = emailFromPrivyUser(user)
    if (!email) {
      setError('Continue with email before connecting your Arc wallet.')
      return null
    }
    setBusy(true)
    setError('')
    try {
      const nextSession = await connectCircleEvmEmailWallet(email, 'arc')
      const identityToken = await getAccessToken()
      if (!identityToken) throw new Error('Sign in again to continue.')
      await linkPocketWallet({
        accessToken: identityToken,
        network: 'arc',
        circleUserToken: nextSession.userToken,
        wallet: nextSession.wallet,
      })
      setSession(nextSession)
      await loadReview(true)
      return nextSession
    } catch (caught) {
      setError(readableError(caught))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function switchPayerEmail() {
    if (busy) return
    setBusy(true)
    setSession(null)
    setReview(null)
    setError('')
    setConfirmLifecycle(null)
    setLoading(true)
    try {
      await logout()
    } finally {
      setBusy(false)
    }
  }

  async function copyPayerAddress() {
    const address = review?.payer.walletAddress
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setPayerAddressCopied(true)
    } catch {
      setError('Copy failed. Allow clipboard access and try again.')
    }
  }

  async function prepare() {
    if (!session) {
      await connectWallet()
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await request<ActionResponse>({
        action: 'prepare',
        circleUserToken: session.userToken,
      })
      setReview(current => current ? { ...current, attempt: result.attempt } : current)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function approveStage(stage: 'approval' | 'activation') {
    if (!session) {
      await connectWallet()
      return
    }
    setBusy(true)
    setError('')
    try {
      const challenge = await request<ActionResponse>({
        action: 'challenge',
        stage,
        circleUserToken: session.userToken,
      })
      if (!challenge.challengeId) throw new Error('Circle confirmation is unavailable.')
      const execution = await executeCircleEvmEmailChallenge({
        session,
        challengeId: challenge.challengeId,
      })
      if (execution.transactionHash) {
        const result = await request<ActionResponse>({
          action: 'record',
          stage,
          transactionHash: execution.transactionHash,
          circleUserToken: session.userToken,
        })
        setReview(current => current ? { ...current, attempt: result.attempt, recovery: null } : current)
      } else {
        const result = await request<ActionResponse>({
          action: 'recover',
          stage,
          circleUserToken: session.userToken,
        })
        setReview(current => current ? {
          ...current,
          attempt: result.attempt,
          recovery: result.attempt.status === 'approval_submitted' || result.attempt.status === 'activation_submitted'
            ? null
            : { stage, pending: true, chainSubmitted: false },
        } : current)
      }
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function submitLifecycleAction(lifecycleAction: 'cancel' | 'refund') {
    const activeSession = session ?? await connectWallet()
    if (!activeSession) return
    setBusy(true)
    setError('')
    let confirmationAccepted = false
    try {
      const challenge = await request<ActionResponse>({
        action: 'lifecycle-challenge',
        lifecycleAction,
        circleUserToken: activeSession.userToken,
      })
      if (!challenge.challengeId) throw new Error('Circle confirmation is unavailable.')
      const execution = await executeCircleEvmEmailChallenge({
        session: activeSession,
        challengeId: challenge.challengeId,
      })
      confirmationAccepted = true
      setConfirmLifecycle(null)
      const pendingAction: LifecycleAction = {
        ...(challenge.lifecycleAction ?? {
          action: lifecycleAction,
          status: 'issued',
          transactionHash: null,
        }),
        action: lifecycleAction,
        status: 'transaction_pending',
        transactionHash: execution.transactionHash ?? challenge.lifecycleAction?.transactionHash ?? null,
      }
      setReview(current => current?.lifecycle ? {
        ...current,
        lifecycle: { ...current.lifecycle, action: pendingAction },
      } : current)
      const result = execution.transactionHash
        ? await request<ActionResponse>({
            action: 'lifecycle-record',
            transactionHash: execution.transactionHash,
            circleUserToken: activeSession.userToken,
          })
        : await request<ActionResponse>({
            action: 'lifecycle-recover',
            circleUserToken: activeSession.userToken,
          })
      setReview(current => current?.lifecycle ? {
        ...current,
        lifecycle: { ...current.lifecycle, action: result.lifecycleAction ?? null },
      } : current)
      setConfirmLifecycle(null)
    } catch (caught) {
      if (!confirmationAccepted) {
        setError(readableError(caught))
      }
    } finally {
      setBusy(false)
    }
  }

  async function decideDelivery(decision: 'accept' | 'dispute') {
    if (decision === 'dispute' && issueText.trim().length < 8) {
      setError('Briefly explain what needs to be fixed.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await request<ActionResponse>({
        action: 'delivery-decision',
        deliveryId: review?.delivery?.id,
        decision,
        ...(decision === 'dispute' ? { issue: issueText } : {}),
      })
      setReview(current => current ? { ...current, delivery: result.delivery ?? null } : current)
      setIssueMode(false)
      setIssueText('')
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  const agreement = review?.agreement
  const attempt = review?.attempt ?? null
  const walletLinked = review?.payer.walletLinked ?? false
  const creatorFundingBlocked = Boolean(review?.payer.creatorFundingBlocked && !attempt)
  const isPending = attempt?.status === 'approval_submitted' || attempt?.status === 'activation_submitted'
    || Boolean(review?.recovery?.pending && session)
  const isActive = attempt?.status === 'active'
  const isTerminalFailure = attempt?.status === 'reconciliation_failed'

  let actionLabel = 'Continue with email'
  let action: (() => void) | null = null
  if (authenticated && agreement) {
    if (creatorFundingBlocked) {
      actionLabel = 'Use another email'
    } else if (!walletLinked || !session) {
      actionLabel = walletLinked ? 'Verify Arc wallet' : 'Connect Arc wallet'
      action = () => void connectWallet()
    } else if (!attempt) {
      actionLabel = 'Continue'
      action = () => void prepare()
    } else if (attempt.status === 'awaiting_approval' || attempt.status === 'approval_failed') {
      actionLabel = 'Approve USDC'
      action = () => void approveStage('approval')
    } else if (attempt.status === 'ready_to_activate' || attempt.status === 'activation_failed') {
      actionLabel = 'Fund and start'
      action = () => void approveStage('activation')
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-8">
      <div className="mb-5 flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400">
        <PocketPillMark size="sm" />
        <span>Hash PayLink Agreement</span>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#141416] dark:shadow-none">
        {!ready || loading ? (
          <div className="space-y-4 p-6 sm:p-8" aria-label="Loading agreement">
            <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-white/8" />
            <div className="h-8 w-3/4 animate-pulse rounded-xl bg-gray-100 dark:bg-white/8" />
            <div className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/8" />
          </div>
        ) : !authenticated ? (
          <div className="p-8 text-center">
            <LockKeyhole className="mx-auto h-6 w-6 text-gray-400" />
            <h1 className="mt-4 text-lg font-semibold text-gray-950 dark:text-white">Review your agreement</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Continue with the payer email to open this private agreement.
            </p>
            <div className="mt-6 text-left">
              <PocketEmailLogin context="agreement" />
            </div>
          </div>
        ) : agreement ? (
          <>
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Review agreement
                  </p>
                  <h1 className="text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">
                    {agreement.title}
                  </h1>
                </div>
                <span className="shrink-0 rounded-full bg-[#111827] px-3 py-1.5 text-[10px] font-semibold text-white dark:bg-white dark:text-gray-950">
                  Arc Testnet
                </span>
              </div>

              <p className="mb-7 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {agreement.description}
              </p>

              <div className="rounded-2xl bg-[#F6F7F9] p-5 dark:bg-white/[0.055]">
                <p className="text-[11px] font-medium text-gray-400">Total protected amount</p>
                <p className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">
                  {agreement.amount} <span className="text-base tracking-normal text-gray-400">USDC</span>
                </p>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 dark:border-white/8">
                  <Detail label="Release" value={releaseLabel(agreement)} />
                  <Detail label="Duration" value={durationLabel(agreement.durationSeconds)} />
                  <Detail label="Recipient" value={compactAddress(agreement.recipient)} mono />
                  <Detail label="Cancel window" value={durationLabel(agreement.cancellationWindowSeconds)} />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-400">Your payer wallet</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {review.payer.walletAddress ? compactAddress(review.payer.walletAddress) : 'Not connected'}
                    </p>
                    {review.payer.walletAddress && (
                      <button
                        type="button"
                        onClick={() => void copyPayerAddress()}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white"
                      >
                        <Copy className="h-3 w-3" />
                        {payerAddressCopied ? 'Copied' : 'Copy address'}
                      </button>
                    )}
                  </div>
                </div>
                {authenticated ? (
                  <button
                    type="button"
                    data-login-action="arc-agreement-change-payer"
                    disabled={busy}
                    onClick={() => void switchPayerEmail()}
                    className="shrink-0 rounded-full border border-gray-200 px-3 py-2 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    Use another email
                  </button>
                ) : (
                  <PocketPillMark tone="subtle" />
                )}
              </div>

              <div className="mt-6">
                {!authenticated ? (
                  <PocketEmailLogin context="agreement" />
                ) : creatorFundingBlocked ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-400/10">
                    <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">Use a different payer account</p>
                    <p className="mt-1 text-[11px] leading-5 text-amber-800/75 dark:text-amber-200/75">The agreement creator cannot also fund this agreement.</p>
                  </div>
                ) : isActive ? (
                  <ActiveAgreementPanel
                    lifecycle={review.lifecycle ?? null}
                    delivery={review.delivery ?? null}
                    amount={agreement.amount}
                    deliveryContext={deliveryContext(agreement, review.delivery ?? null)}
                    releaseActionLabel={agreement.template === 'milestone' ? 'Release milestone' : `Release ${agreement.amount} USDC`}
                    agreementLifecycleStatus={attempt.lifecycle?.status}
                    receipt={review.receipt ?? null}
                    busy={busy}
                    walletSessionReady={Boolean(session)}
                    confirmation={confirmLifecycle}
                    onConfirm={setConfirmLifecycle}
                    onSubmit={value => void submitLifecycleAction(value)}
                    issueMode={issueMode}
                    issueText={issueText}
                    onIssueMode={setIssueMode}
                    onIssueText={setIssueText}
                    onDeliveryDecision={value => void decideDelivery(value)}
                  />
                ) : isPending ? (
                  <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-white/8 dark:text-gray-300">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                    Confirming on Arc
                  </div>
                ) : isTerminalFailure ? (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
                    This agreement needs support review. Do not submit another transaction.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={action ?? undefined}
                    disabled={busy || !action}
                    className="flex h-12 w-full items-center justify-between rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                  >
                    <span>{busy ? 'Please wait' : actionLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {!creatorFundingBlocked && !review.delivery && review.lifecycle?.action?.status !== 'confirmed' && (
                  <p className="mt-3 text-center text-[11px] leading-5 text-gray-400">
                    {statusCopy(attempt, walletLinked)}
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium leading-5 text-red-700 dark:bg-red-400/10 dark:text-red-200">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <LockKeyhole className="mx-auto h-6 w-6 text-gray-400" />
            <h1 className="mt-4 text-lg font-semibold text-gray-950 dark:text-white">Agreement unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {error || 'Use the original private agreement link.'}
            </p>
            {authenticated && error === 'This agreement is not available for this payer identity.' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchPayerEmail()}
                className="mt-6 flex h-12 w-full items-center justify-between rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
              >
                <span>Sign in with another email</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </section>

      {!isActive && (
        <section className="mt-5 rounded-[24px] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#141416]">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gray-500 dark:text-gray-300" />
            <h2 className="text-xs font-semibold text-gray-800 dark:text-gray-100">How it works</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Step number="1" label="Review" />
            <Step number="2" label="Approve USDC" />
            <Step number="3" label="Fund escrow" />
          </div>
        </section>
      )}
    </div>
  )
}

function ActiveAgreementPanel({
  lifecycle,
  delivery,
  amount,
  deliveryContext,
  releaseActionLabel,
  agreementLifecycleStatus,
  receipt,
  busy,
  walletSessionReady,
  confirmation,
  onConfirm,
  onSubmit,
  issueMode,
  issueText,
  onIssueMode,
  onIssueText,
  onDeliveryDecision,
}: {
  lifecycle: ReviewResponse['lifecycle']
  delivery: DeliveryReview | null
  amount: string
  deliveryContext: string | null
  releaseActionLabel: string
  agreementLifecycleStatus?: 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'
  receipt: PaylinkReceipt | null
  busy: boolean
  walletSessionReady: boolean
  confirmation: 'cancel' | 'refund' | null
  onConfirm: (value: 'cancel' | 'refund' | null) => void
  onSubmit: (value: 'cancel' | 'refund') => void
  issueMode: boolean
  issueText: string
  onIssueMode: (value: boolean) => void
  onIssueText: (value: string) => void
  onDeliveryDecision: (value: 'accept' | 'dispute') => void
}) {
  const availableAction = lifecycle?.cancel?.eligible
    ? 'cancel'
    : lifecycle?.refund?.eligible
      ? 'refund'
      : null
  const current = lifecycle?.action
  if (agreementLifecycleStatus === 'completed') {
    return <TerminalAgreementState title="Agreement completed" copy="All protected USDC has been released on Arc." receipt={receipt} />
  }
  if (agreementLifecycleStatus === 'cancelled' || agreementLifecycleStatus === 'refunded') {
    return <TerminalAgreementState title={agreementLifecycleStatus === 'cancelled' ? 'Agreement cancelled' : 'Remaining USDC returned'} copy="Confirmed on Arc." receipt={receipt} />
  }
  if (current?.status === 'confirmed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            {current.action === 'cancel' ? 'Agreement cancelled' : 'Remaining USDC returned'}
          </p>
          <p className="text-[11px] opacity-75">Confirmed on Arc.</p>
        </div>
      </div>
    )
  }
  if (availableAction === 'refund') {
    if (
      current
      && (
        current.status === 'submitted'
        || (current.status === 'transaction_pending' && walletSessionReady)
      )
    ) {
      return (
        <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-white/8 dark:text-gray-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
          Confirming refund on Arc
        </div>
      )
    }
    if (
      current
      && (
        current.status === 'reserved'
        || current.status === 'issued'
        || (current.status === 'transaction_pending' && !walletSessionReady)
        || (current.status === 'provider_failed' && current.retryable)
      )
    ) {
      return (
        <button
          type="button"
          onClick={() => onSubmit('refund')}
          disabled={busy}
          className="flex h-12 w-full items-center justify-between rounded-full bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
        >
          <span>{busy ? 'Please wait' : 'Continue refund'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      )
    }
    if (current && ['manual_review', 'provider_failed', 'failed'].includes(current.status)) {
      return <DeliveryState title="Refund needs review" copy="Do not submit another wallet transaction." tone="warning" />
    }
    if (confirmation === 'refund') {
      return (
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <p className="text-sm font-semibold text-gray-950 dark:text-white">Return the remaining USDC?</p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
            The unreleased balance returns to your payer wallet. This cannot be undone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onConfirm(null)} disabled={busy} className="h-10 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:bg-white/8 dark:text-gray-200">Keep agreement</button>
            <button type="button" onClick={() => onSubmit('refund')} disabled={busy} className="h-10 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
              {busy ? 'Please wait' : 'Confirm refund'}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div>
        <DeliveryState title="Agreement ended" copy="The unreleased USDC is ready to return." tone="warning" />
        {lifecycle?.enabled && (
          <button
            type="button"
            onClick={() => onConfirm('refund')}
            className="mt-3 h-10 w-full rounded-full bg-gray-950 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
          >
            Return remaining USDC
          </button>
        )}
      </div>
    )
  }
  if (delivery) {
    const accepting = ['queued', 'provider_pending', 'chain_pending'].includes(delivery.status)
    if (delivery.status === 'completed') {
      return <DeliveryState title="Payment released" copy="Confirmed on Arc." tone="success" />
    }
    if (delivery.status === 'disputed') {
      return <DeliveryState title="Issue reported" copy="The USDC remains protected while the recipient updates the delivery." tone="warning" />
    }
    if (accepting) {
      return <DeliveryState title="Release approved" copy="Confirming payment on Arc." tone="success" />
    }
    if (delivery.status === 'failed' || delivery.status === 'manual_review') {
      return <DeliveryState title="Release needs review" copy="No new release should be submitted for this delivery." tone="warning" />
    }
    if (!delivery.canReview) {
      if (confirmation) {
        const cancelling = confirmation === 'cancel'
        return (
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
            <p className="text-sm font-semibold text-gray-950 dark:text-white">
              {cancelling ? 'Cancel this agreement?' : 'Return the remaining USDC?'}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
              {cancelling ? `${amount} USDC returns to your payer wallet.` : 'The unreleased balance returns to your payer wallet.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onConfirm(null)} disabled={busy} className="h-10 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:bg-white/8 dark:text-gray-200">Keep agreement</button>
              <button type="button" onClick={() => onSubmit(confirmation)} disabled={busy} className="h-10 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                {busy ? 'Please wait' : cancelling ? 'Confirm cancellation' : 'Confirm refund'}
              </button>
            </div>
          </div>
        )
      }
      return (
        <div>
          <DeliveryState title="Payer review unavailable" copy="Sign in with the original payer account to review this delivery." tone="warning" />
          {availableAction && lifecycle?.enabled && (
            <button
              type="button"
              onClick={() => onConfirm(availableAction)}
              className="mt-3 h-10 w-full rounded-full border border-gray-200 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
            >
              {availableAction === 'cancel' ? 'Cancel agreement' : 'Return remaining USDC'}
            </button>
          )}
        </div>
      )
    }
    return (
      <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Delivery ready</p>
        <p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">Review the completed work</p>
        {deliveryContext && <p className="mt-1 text-[11px] font-medium text-gray-400">{deliveryContext}</p>}
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{delivery.deliveryNote}</p>
        <a
          href={delivery.evidenceReference}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 flex h-10 items-center justify-between rounded-xl bg-gray-50 px-3 text-xs font-semibold text-gray-700 dark:bg-white/[0.055] dark:text-gray-200"
        >
          <span className="truncate">Open proof · {deliveryHost(delivery.evidenceReference)}</span>
          <ExternalLink className="ml-3 h-3.5 w-3.5 shrink-0" />
        </a>
        {issueMode ? (
          <div className="mt-4">
            <textarea
              value={issueText}
              onChange={event => onIssueText(event.target.value)}
              maxLength={300}
              placeholder="What needs to be fixed?"
              className="h-20 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => onIssueMode(false)} className="h-10 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:bg-white/8 dark:text-gray-200">Cancel</button>
              <button type="button" disabled={busy || issueText.trim().length < 8} onClick={() => onDeliveryDecision('dispute')} className="h-10 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">Report issue</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => onIssueMode(true)} className="h-10 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-white/10 dark:text-gray-200">Report issue</button>
            <button type="button" disabled={busy} onClick={() => onDeliveryDecision('accept')} className="h-10 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{releaseActionLabel}</button>
          </div>
        )}
        <p className="mt-3 text-center text-[10px] leading-4 text-gray-400">Only release after checking the delivered work.</p>
      </div>
    )
  }
  if (
    current
    && (
      current.status === 'submitted'
      || (current.status === 'transaction_pending' && walletSessionReady)
    )
  ) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-white/8 dark:text-gray-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        Confirming {current.action === 'cancel' ? 'cancellation' : 'refund'} on Arc
      </div>
    )
  }
  if (
    current
    && (
      current.status === 'reserved'
      || current.status === 'issued'
      || (current.status === 'transaction_pending' && !walletSessionReady)
      || (current.status === 'provider_failed' && current.retryable)
    )
  ) {
    return (
      <button
        type="button"
        onClick={() => onSubmit(current.action)}
        disabled={busy}
        className="flex h-12 w-full items-center justify-between rounded-full bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
      >
        <span>{busy ? 'Please wait' : `Continue ${current.action === 'cancel' ? 'cancellation' : 'refund'}`}</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    )
  }
  if (current && ['manual_review', 'provider_failed', 'failed'].includes(current.status)) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
        This wallet action needs review. Do not submit it again.
      </div>
    )
  }
  if (confirmation) {
    const cancelling = confirmation === 'cancel'
    return (
      <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
        <p className="text-sm font-semibold text-gray-950 dark:text-white">
          {cancelling ? 'Cancel this agreement?' : 'Return the remaining USDC?'}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
          {cancelling
            ? `${amount} USDC returns to your payer wallet. This cannot be undone.`
            : 'The unreleased balance returns to your payer wallet. This cannot be undone.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onConfirm(null)}
            disabled={busy}
            className="h-10 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:bg-white/8 dark:text-gray-200"
          >
            Keep agreement
          </button>
          <button
            type="button"
            onClick={() => onSubmit(confirmation)}
            disabled={busy}
            className="h-10 rounded-full bg-gray-950 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
          >
            {busy ? 'Please wait' : cancelling ? 'Confirm cancellation' : 'Confirm refund'}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Agreement funded</p>
          <p className="text-[11px] opacity-75">{amount} USDC is protected on Arc. Work can begin.</p>
        </div>
      </div>
      {availableAction && lifecycle?.enabled && (
        <button
          type="button"
          onClick={() => onConfirm(availableAction)}
          className="mt-3 h-10 w-full rounded-full border border-gray-200 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
        >
          {availableAction === 'cancel' ? 'Cancel agreement' : 'Return remaining USDC'}
        </button>
      )}
    </div>
  )
}

function DeliveryState({ title, copy, tone }: { title: string; copy: string; tone: 'success' | 'warning' }) {
  const success = tone === 'success'
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ${success
      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300'
      : 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${success ? 'bg-emerald-600' : 'bg-amber-600'}`}>
        {success ? <Check className="h-4 w-4" /> : <LockKeyhole className="h-3.5 w-3.5" />}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] opacity-75">{copy}</p>
      </div>
    </div>
  )
}

function TerminalAgreementState({ title, copy, receipt }: { title: string; copy: string; receipt: PaylinkReceipt | null }) {
  return (
    <div>
      <DeliveryState title={title} copy={copy} tone="success" />
      {receipt && <UnifiedReceipt receipt={receipt} className="mt-3" />}
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold text-gray-800 dark:text-gray-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function Step({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <span className="grid h-6 w-6 place-items-center rounded-full bg-gray-950 text-[10px] font-semibold text-white dark:bg-white dark:text-gray-950">
        {number}
      </span>
      <p className="mt-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

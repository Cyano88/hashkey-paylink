import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import SlideAction, { type SlideActionStatus } from '../components/SlideAction'
import UnifiedReceipt from '../components/UnifiedReceipt'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { copyToClipboard } from '../lib/utils'
import PocketStatusCheck from '../pocket/components/PocketStatusCheck'
import usePocketX402Controller from '../pocket/controllers/usePocketX402Controller'
import usePocketIdentity from '../pocket/hooks/usePocketIdentity'
import { createPocketIdempotencyKey } from '../pocket/lib/pocketSchemas'
import { formatPocketDisplayAmount } from '../pocket/lib/pocketMoney'
import type { PaylinkReceipt, ReceiptLookupResponse } from '../lib/paymentReceiptPdf'

type CheckoutStatus = 'pending' | 'processing' | 'paid' | 'failed'
type AgentCheckoutLookup = {
  ok?: boolean
  checkout?: {
    id: string
    checkoutMode: 'human' | 'agentic'
    agenticType?: 'creator_earnings' | 'agent_treasury'
    kind: string
    merchantName: string
    brandImageUrl?: string
    title: string
    description?: string
    amount: string
    flexible: boolean
    network: string
    availableNetworks: string[]
    settlementMode: string
    status: CheckoutStatus
    settlementStatus?: string
    expiresAt: string
    paymentAttempt?: {
      id: string
      status: CheckoutStatus
      transaction?: string
      payer?: string
      confirmedAt?: string
      receiptId?: string
      receiptUrl?: string
    }
  }
  agentPaymentUrl?: string
  returnUrl?: string
  error?: string
}

type WalletPayResponse = {
  ok?: boolean
  status?: 'processing' | 'paid' | 'failed'
  error?: { message?: string } | string
}

const NETWORK_LABELS: Record<string, string> = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  arc: 'Arc Testnet',
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[calc(100dvh-5rem)] items-center justify-center bg-gray-50 px-4 py-8 dark:bg-[#090a0d]">
      <section className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#111216]">
        {children}
      </section>
    </main>
  )
}

function CheckoutBrand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/pocket-circle.png" alt="" className="h-5 w-5 object-contain dark:invert" />
      <span className="text-[11px] font-bold tracking-[-0.01em] text-gray-800 dark:text-gray-100">Hash PayLink Checkout</span>
    </div>
  )
}

function amountValue(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function activationAmount(required: string, available: string | undefined) {
  const deficit = Math.max(0, amountValue(required) - amountValue(available))
  const amount = Math.max(0.5, Math.ceil(deficit * 1_000_000) / 1_000_000)
  return Math.min(5, amount).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function additionalWalletFunds(required: string, available: string | undefined) {
  const deficit = Math.max(0, amountValue(required) - amountValue(available))
  return (Math.ceil(deficit * 1_000_000) / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function paymentError(value: WalletPayResponse | undefined) {
  if (typeof value?.error === 'string') return value.error
  return value?.error?.message || 'Circle Agent Wallet could not complete this payment.'
}

export default function AgentCheckoutPage() {
  const { checkoutId = '' } = useParams()
  const attemptId = new URLSearchParams(window.location.search).get('attempt') ?? ''
  const { ready: identityReady, authenticated, email, getAccessToken } = usePocketIdentity()
  const x402 = usePocketX402Controller({ authenticated, email, getAccessToken })
  const [lookup, setLookup] = useState<AgentCheckoutLookup>()
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [canonicalReceipt, setCanonicalReceipt] = useState<PaylinkReceipt | null>(null)
  const [walletCopied, setWalletCopied] = useState(false)
  const [payStatus, setPayStatus] = useState<SlideActionStatus>('idle')
  const [payError, setPayError] = useState('')
  const paymentKey = useRef(createPocketIdempotencyKey('agentic-checkout'))

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    async function loadCheckout() {
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}&attempt=${encodeURIComponent(attemptId)}&purpose=return`, { cache: 'no-store' })
        const body = await response.json().catch(() => undefined) as AgentCheckoutLookup | undefined
        if (!response.ok || !body?.ok || !body.checkout) throw new Error(body?.error || 'This checkout could not be opened.')
        if (body.checkout.checkoutMode !== 'agentic') throw new Error('This checkout is reserved for human payment.')
        if (!body.agentPaymentUrl) throw new Error('This checkout is not available for agent wallets.')
        if (cancelled) return
        setLookup(body)
        setError('')
        if (body.checkout.status === 'paid') setPayStatus('successful')
        if (body.checkout.status === 'pending' || body.checkout.status === 'processing') {
          timer = window.setTimeout(loadCheckout, payStatus === 'pending' || payStatus === 'submitted' ? 1_500 : 2_500)
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'This checkout could not be opened.')
      }
    }
    void loadCheckout()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [attemptId, checkoutId, payStatus, refreshKey])

  useEffect(() => {
    paymentKey.current = createPocketIdempotencyKey(`agentic-checkout:${attemptId || 'attempt'}`)
    setPayStatus('idle')
    setPayError('')
  }, [attemptId])

  useEffect(() => {
    const checkoutNetwork = lookup?.checkout?.network
    if (checkoutNetwork === 'base' || checkoutNetwork === 'arc') x402.selectNetwork(checkoutNetwork)
  }, [lookup?.checkout?.network, x402.selectNetwork])

  useEffect(() => {
    const checkout = lookup?.checkout
    if (!checkout || !x402.snapshot?.connected) return
    const next = activationAmount(checkout.amount, x402.snapshot.gatewayBalance)
    if (x402.amount !== next) x402.setAmount(next)
  }, [lookup?.checkout, x402.amount, x402.setAmount, x402.snapshot?.connected, x402.snapshot?.gatewayBalance])

  useEffect(() => {
    const receiptId = lookup?.checkout?.paymentAttempt?.receiptId
    if (lookup?.checkout?.status !== 'paid' || !receiptId) {
      setCanonicalReceipt(null)
      return
    }
    let cancelled = false
    void fetch(`/api/receipt?id=${encodeURIComponent(receiptId)}`, { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => undefined) as ReceiptLookupResponse | undefined }))
      .then(({ response, body }) => {
        if (!cancelled && response.ok && body?.ok && body.receipt) setCanonicalReceipt(body.receipt)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [lookup?.checkout?.paymentAttempt?.receiptId, lookup?.checkout?.status])

  const checkout = lookup?.checkout
  const connected = Boolean(x402.snapshot?.connected && x402.snapshot.walletAddress)
  const gatewayEnough = Boolean(checkout && amountValue(x402.snapshot?.gatewayBalance) + 0.0000005 >= amountValue(checkout.amount))
  const walletCanActivate = amountValue(x402.snapshot?.walletBalance) + 0.0000005 >= amountValue(x402.amount)
  const sessionChecking = !identityReady || (authenticated && !x402.snapshotReady)
  const walletAddress = x402.snapshot?.walletAddress || ''
  const network = checkout ? NETWORK_LABELS[checkout.network] || checkout.network : ''
  const walletFundingDeficit = additionalWalletFunds(x402.amount, x402.snapshot?.walletBalance)

  async function copyWalletAddress() {
    if (!walletAddress) return
    await copyToClipboard(walletAddress)
    setWalletCopied(true)
    window.setTimeout(() => setWalletCopied(false), 1_800)
  }

  async function payCheckout() {
    if (!checkout || !checkout.paymentAttempt?.id || payStatus !== 'idle' || !gatewayEnough) return
    setPayStatus('pending')
    setPayError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to pay.')
      const response = await fetch('/api/v2/checkouts/agent/pay', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'idempotency-key': paymentKey.current,
        },
        body: JSON.stringify({
          checkoutId: checkout.id,
          paymentAttemptId: checkout.paymentAttempt.id,
        }),
      })
      const body = await response.json().catch(() => undefined) as WalletPayResponse | undefined
      if (!response.ok || !body?.ok) throw new Error(paymentError(body))
      if (body.status === 'paid') {
        setPayStatus('successful')
        setRefreshKey(value => value + 1)
        return
      }
      setPayStatus('submitted')
      setRefreshKey(value => value + 1)
    } catch (cause) {
      setPayStatus('error')
      setPayError(cause instanceof Error ? cause.message : 'Circle Agent Wallet could not complete this payment.')
      window.setTimeout(() => setPayStatus('idle'), 1_800)
    }
  }

  if (error) {
    return (
      <CheckoutShell>
        <div className="p-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-400/10"><AlertCircle className="h-5 w-5" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-[-0.03em] text-gray-950 dark:text-white">Checkout unavailable</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
          <button type="button" onClick={() => { setError(''); setLookup(undefined); setRefreshKey(value => value + 1) }} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
        </div>
      </CheckoutShell>
    )
  }

  if (!checkout) {
    return (
      <CheckoutShell>
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-gray-700 dark:text-white" />
          <h1 className="mt-4 text-lg font-bold text-gray-950 dark:text-white">Opening secure checkout</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Verifying payment details...</p>
        </div>
      </CheckoutShell>
    )
  }

  const paymentReference = checkout.paymentAttempt?.transaction || checkout.paymentAttempt?.id || checkout.id
  const receiptReference = checkout.paymentAttempt?.receiptId || `hpl_${checkout.paymentAttempt?.id || checkout.id}`
  const agentReceipt: PaylinkReceipt = {
    type: 'hashpaylink_agent_checkout_receipt',
    receiptId: receiptReference,
    receiptHash: receiptReference,
    title: 'Agent payment confirmed',
    status: 'confirmed',
    eventId: checkout.id,
    txHash: paymentReference,
    chain: checkout.network,
    payer: checkout.paymentAttempt?.payer || 'Circle Agent Wallet',
    memo: checkout.title,
    amount: checkout.amount,
    asset: 'USDC',
    createdAt: checkout.paymentAttempt?.confirmedAt ? Date.parse(checkout.paymentAttempt.confirmedAt) : Date.now(),
    source: 'agentic-checkout',
    merchantId: checkout.merchantName,
    recipient: checkout.merchantName,
    destination: `${network} · Circle Gateway`,
    settlementType: 'circle-gateway-checkout',
    proof: { receiptHash: receiptReference },
  }

  if (checkout.status === 'paid') {
    return (
      <CheckoutShell>
        <div className="px-6 pb-6 pt-5">
          <CheckoutBrand />
          <div className="py-8 text-center">
            <PocketStatusCheck className="mx-auto h-12 w-12" />
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Payment confirmed</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-gray-950 dark:text-white">{checkout.amount} USDC sent</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{checkout.merchantName} can now deliver {checkout.title.toLowerCase()}.</p>
          </div>
          <UnifiedReceipt receipt={canonicalReceipt || agentReceipt} compact />
          {lookup?.returnUrl ? (
            <a href={lookup.returnUrl} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950">
              Continue to {checkout.merchantName} <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <Link to="/" className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-gray-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Done</Link>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-medium text-gray-400"><ShieldCheck className="h-3.5 w-3.5" /> Verified against the status used by signed webhooks</p>
        </div>
      </CheckoutShell>
    )
  }

  return (
    <CheckoutShell>
      <div className="px-6 pb-6 pt-5">
        <CheckoutBrand />
        <div className="pb-6 pt-7 text-center">
          {checkout.brandImageUrl && <img src={checkout.brandImageUrl} alt="" className="mx-auto mb-3 h-9 w-9 rounded-xl object-contain" />}
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{checkout.merchantName}</p>
          <h1 className="mt-1.5 text-xl font-bold tracking-[-0.035em] text-gray-950 dark:text-white">{checkout.title}</h1>
          {checkout.description && <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400">{checkout.description}</p>}
          <p className="mt-5 text-4xl font-bold tracking-[-0.05em] text-gray-950 dark:text-white">{checkout.amount} <span className="text-lg text-gray-400">USDC</span></p>
          <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-semibold text-gray-400">
            <span>{network}</span><span>·</span><span>Circle Gateway x402</span>
          </div>
        </div>

        {sessionChecking ? (
          <div className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
            <Loader2 className="h-4 w-4 animate-spin" /> Restoring wallet
          </div>
        ) : !authenticated ? (
          <div className="space-y-2">
            <PrivyConnectButton
              debugLabel="agent-checkout-email"
              loginOptions={{ loginMethods: ['email'] }}
              logoutOnAuthenticated={false}
              className="relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-white dark:text-gray-950"
            >
              <Wallet className="absolute left-5 h-4 w-4" />
              <span>Continue</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10"><ArrowRight className="h-4 w-4" /></span>
            </PrivyConnectButton>
            <p className="text-center text-[11px] text-gray-400">Secure email access. Wallet powered by Circle.</p>
          </div>
        ) : !connected ? (
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-white/[0.05]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/[0.08]"><Wallet className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Circle Agent Wallet</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{email}</p>
              </div>
            </div>
            {x402.walletChoices.length > 0 && (
              <select
                value={x402.expectedWallet}
                onChange={event => x402.setExpectedWallet(event.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 outline-none dark:border-white/10 dark:bg-[#17181c] dark:text-white"
              >
                <option value="">Select your Circle wallet</option>
                {x402.walletChoices.map(choice => <option key={choice.address} value={choice.address}>{choice.address.slice(0, 8)}...{choice.address.slice(-6)} {choice.balance ? `· ${choice.balance} USDC` : ''}</option>)}
              </select>
            )}
            {x402.walletStep === 'otp' ? (
              <>
                <input
                  value={x402.otp}
                  onChange={event => x402.setOtp(event.target.value.trim())}
                  placeholder="Enter the latest Circle email code"
                  disabled={x402.walletBusy}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                />
                <button type="button" onClick={() => void x402.completeConnection()} disabled={x402.walletBusy || !x402.otp.trim()} className="relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                  {x402.walletBusy ? <Loader2 className="absolute left-5 h-4 w-4 animate-spin" /> : <Check className="absolute left-5 h-4 w-4" />}
                  Continue
                  <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10"><ArrowRight className="h-4 w-4" /></span>
                </button>
                <button type="button" onClick={() => void x402.resendOtp()} disabled={x402.walletBusy} className="w-full text-xs font-semibold text-gray-500">Resend code</button>
              </>
            ) : (
              <button type="button" onClick={() => void x402.beginConnection()} disabled={x402.walletBusy} className="relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                {x402.walletBusy ? <Loader2 className="absolute left-5 h-4 w-4 animate-spin" /> : <Wallet className="absolute left-5 h-4 w-4" />}
                Continue
                <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10"><ArrowRight className="h-4 w-4" /></span>
              </button>
            )}
            {x402.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">{x402.error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <details className="group rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <img src="/pocket-circle.png" alt="" className="h-7 w-7 object-contain dark:invert" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Circle Agent Wallet</span>
                  <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-white">{formatPocketDisplayAmount(x402.snapshot?.gatewayBalance || '0')} USDC</span>
                  <span className="block text-[9px] font-semibold text-gray-400">App Pay</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 border-t border-gray-200 pt-2.5 dark:border-white/10">
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">USDC balance</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-white">{formatPocketDisplayAmount(x402.snapshot?.walletBalance || '0')} USDC</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-100 py-2 dark:border-white/[0.07]">
                  <span className="text-xs text-gray-500 dark:text-gray-400">App Pay balance</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-white">{formatPocketDisplayAmount(x402.snapshot?.gatewayBalance || '0')} USDC</span>
                </div>
                <button type="button" onClick={() => void copyWalletAddress()} className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                  {walletCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {walletCopied ? 'Address copied' : `Copy ${network} deposit address`}
                </button>
              </div>
            </details>

            {!gatewayEnough ? (
              <div className="space-y-2">
                {walletCanActivate && !x402.activationError ? (
                  <button type="button" onClick={() => void x402.activate()} disabled={x402.activationBusy || x402.activationPending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                    {x402.activationBusy || x402.activationPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating App Pay</> : <>Move {x402.amount} USDC to App Pay <ArrowRight className="h-4 w-4" /></>}
                  </button>
                ) : (
                  <button type="button" onClick={() => void copyWalletAddress()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">
                    {walletCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {walletCopied ? 'Deposit address copied' : 'Copy deposit address'}
                  </button>
                )}
                <p className="text-center text-[11px] leading-4 text-gray-400">
                  {walletCanActivate
                    ? `This checkout needs ${checkout.amount} USDC in App Pay. Circle's minimum transfer is 0.5 USDC.`
                    : `Add ${walletFundingDeficit} USDC to this wallet on ${network}. This checkout detects it automatically.`}
                </p>
                {(x402.activationError || x402.error) && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">{x402.activationError || x402.error}</p>}
              </div>
            ) : (
              <SlideAction
                status={payStatus}
                disabled={!gatewayEnough}
                onConfirm={() => void payCheckout()}
                labels={{
                  idle: `Slide to pay ${checkout.amount} USDC`,
                  pending: 'Confirming with Circle',
                  submitted: 'Payment submitted',
                  successful: 'Payment successful',
                  error: 'Payment failed',
                }}
              />
            )}
            {payError && <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">{payError}</p>}
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-medium text-gray-400"><ShieldCheck className="h-3.5 w-3.5" /> One checkout · one approval · verified by Circle Gateway</p>
      </div>
    </CheckoutShell>
  )
}

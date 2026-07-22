import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, ArrowUpFromLine, Bot, Check, ChevronDown, Copy, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PocketStatusCheck from '../pocket/components/PocketStatusCheck'
import { copyToClipboard } from '../lib/utils'

type CheckoutStatus = 'pending' | 'processing' | 'paid' | 'failed'
type AgentCheckoutLookup = {
  ok?: boolean
  checkout?: { id: string; kind: string; merchantName: string; title: string; description?: string; amount: string; flexible: boolean; network: string; availableNetworks: string[]; settlementMode: string; status: CheckoutStatus; settlementStatus?: string; expiresAt: string }
  paymentUrl?: string
  agentPaymentUrl?: string
  agentCheckoutUrl?: string
  returnUrl?: string
  error?: string
}

const NETWORK_LABELS: Record<string, string> = { base: 'Base', arbitrum: 'Arbitrum', arc: 'Arc' }

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-6 border-b border-gray-100 py-3 last:border-0 dark:border-white/[0.07]">
    <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className={`max-w-[62%] text-right text-xs font-semibold text-gray-900 dark:text-white ${mono ? 'break-all font-mono text-[10px]' : ''}`}>{value}</dd>
  </div>
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,#f4f7fb_0%,#ffffff_45%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top,#181b21_0%,#090a0d_48%)]">
    <section className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#111216]">{children}</section>
  </main>
}

export default function AgentCheckoutPage() {
  const { checkoutId = '' } = useParams()
  const [lookup, setLookup] = useState<AgentCheckoutLookup>()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    async function loadCheckout() {
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}&purpose=return`, { cache: 'no-store' })
        const body = await response.json().catch(() => undefined) as AgentCheckoutLookup | undefined
        if (!response.ok || !body?.ok || !body.checkout) throw new Error(body?.error || 'This checkout could not be opened.')
        if (!body.agentPaymentUrl) throw new Error('This checkout is not available for agent wallets.')
        if (cancelled) return
        setLookup(body)
        setError('')
        if (body.checkout.status === 'pending' || body.checkout.status === 'processing') timer = window.setTimeout(loadCheckout, 2500)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'This checkout could not be opened.')
      }
    }
    void loadCheckout()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [checkoutId, refreshKey])

  const agentPaymentUrl = useMemo(() => lookup?.agentPaymentUrl ? new URL(lookup.agentPaymentUrl, window.location.origin).toString() : '', [lookup?.agentPaymentUrl])
  async function copyEndpoint() {
    if (!agentPaymentUrl) return
    await copyToClipboard(agentPaymentUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (error) return <CheckoutShell><div className="p-7 text-center">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-400/10"><AlertCircle className="h-5 w-5" /></span>
    <h1 className="mt-4 text-xl font-bold tracking-[-0.03em] text-gray-950 dark:text-white">Agent checkout unavailable</h1>
    <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
    <button type="button" onClick={() => { setError(''); setLookup(undefined); setRefreshKey(value => value + 1) }} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
  </div></CheckoutShell>

  if (!lookup?.checkout) return <CheckoutShell><div className="p-8 text-center">
    <Loader2 className="mx-auto h-7 w-7 animate-spin text-gray-700 dark:text-white" />
    <h1 className="mt-4 text-lg font-bold text-gray-950 dark:text-white">Opening agent checkout</h1>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Verifying payment details...</p>
  </div></CheckoutShell>

  const { checkout } = lookup
  const network = NETWORK_LABELS[checkout.network] || checkout.network
  const reference = `${checkout.id.slice(0, 12)}...${checkout.id.slice(-4)}`
  const walletNetwork = encodeURIComponent(checkout.network)
  const gatewayWalletUrl = checkout.network === 'arbitrum'
    ? `/agent?walletManager=service&n=arbitrum&returnTo=${encodeURIComponent(window.location.pathname)}`
    : `/pocket/home/x402?n=${walletNetwork}`

  if (checkout.status === 'paid') return <CheckoutShell>
    <div className="bg-gradient-to-b from-gray-50 to-white px-7 pb-7 pt-8 text-center dark:from-white/[0.04] dark:to-transparent">
      <PocketStatusCheck className="mx-auto h-12 w-12" />
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Payment confirmed</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-gray-950 dark:text-white">Agent payment confirmed</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{checkout.merchantName} can now fulfill this checkout.</p>
      <p className="mt-6 text-4xl font-bold tracking-[-0.05em] text-gray-950 dark:text-white">{checkout.amount} <span className="text-xl text-gray-400">USDC</span></p>
    </div>
    <div className="px-7 pb-7">
      <dl className="rounded-2xl border border-gray-200 px-4 dark:border-white/10">
        <DetailRow label="Payment path" value="Circle Agent Wallet" /><DetailRow label="Protocol" value="Circle Gateway x402" /><DetailRow label="Network" value={network} /><DetailRow label="Checkout" value={reference} mono />
      </dl>
      {lookup.returnUrl ? <a href={lookup.returnUrl} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">Return to {checkout.merchantName} <ExternalLink className="h-4 w-4" /></a> : <Link to="/" className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-gray-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Done</Link>}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-medium text-gray-400"><ShieldCheck className="h-3.5 w-3.5" /> Verified against the status used by signed webhooks</p>
    </div>
  </CheckoutShell>

  return <CheckoutShell>
    <div className="bg-gradient-to-b from-gray-50 to-white px-7 pb-7 pt-7 dark:from-white/[0.04] dark:to-transparent">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300"><Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" /> Circle Agent Wallet</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Awaiting payment</span>
      </div>
      <p className="mt-7 text-xs font-semibold text-gray-500 dark:text-gray-400">{checkout.merchantName}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-gray-950 dark:text-white">{checkout.title}</h1>
      {checkout.description && <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{checkout.description}</p>}
      <p className="mt-7 text-4xl font-bold tracking-[-0.05em] text-gray-950 dark:text-white">{checkout.amount} <span className="text-xl text-gray-400">USDC</span></p>
    </div>
    <div className="px-7 pb-7">
      <dl className="rounded-2xl border border-gray-200 px-4 dark:border-white/10">
        <DetailRow label="Network" value={network} /><DetailRow label="Protocol" value="Circle Gateway x402" /><DetailRow label="Checkout" value={reference} mono /><DetailRow label="Expires" value={new Date(checkout.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />
      </dl>
      <button type="button" onClick={() => void copyEndpoint()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Endpoint copied' : 'Copy agent payment endpoint'}</button>
      <details className="group mt-3 rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-gray-700 marker:content-none dark:text-gray-200">
          <span className="flex items-center gap-2"><Wallet className="h-3.5 w-3.5 text-gray-400" /> Wallet options</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100 px-2 py-2 dark:border-white/[0.07]">
          <Link to={`/pocket/home/smart-wallet?action=fund&n=${walletNetwork}`} className="flex min-h-11 items-center gap-3 rounded-xl px-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"><Download className="h-4 w-4 text-gray-400" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">Deposit USDC</span><span className="block text-[10px] text-gray-400">Copy the wallet address and fund it</span></span><ArrowRight className="h-3.5 w-3.5 text-gray-300" /></Link>
          <Link to={gatewayWalletUrl} className="flex min-h-11 items-center gap-3 rounded-xl px-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"><ArrowRight className="h-4 w-4 text-gray-400" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">Add Gateway balance</span><span className="block text-[10px] text-gray-400">Move wallet USDC into App Pay</span></span><ArrowRight className="h-3.5 w-3.5 text-gray-300" /></Link>
          <Link to={`/pocket/home/smart-wallet?action=withdraw&n=${walletNetwork}`} className="flex min-h-11 items-center gap-3 rounded-xl px-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"><ArrowUpFromLine className="h-4 w-4 text-gray-400" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">Withdraw USDC</span><span className="block text-[10px] text-gray-400">Open the authenticated wallet flow</span></span><ArrowRight className="h-3.5 w-3.5 text-gray-300" /></Link>
        </div>
      </details>
      <Link to={`/pay/c/${encodeURIComponent(checkout.id)}`} className="mt-2 flex h-11 w-full items-center justify-center text-xs font-semibold text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">Use hosted checkout instead</Link>
      <p className="mt-2 text-center text-[10px] leading-4 text-gray-400">Compatible agents handle the x402 challenge and payment signature. Status updates automatically.</p>
    </div>
  </CheckoutShell>
}

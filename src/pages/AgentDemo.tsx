/**
 * /agent — Payment-Gated AI Demo
 *
 * Demonstrates the Hash PayLink agentic economy primitive:
 * 1. Enter an event ID + your payer name
 * 2. Verification checks 0G Mainnet for your payment proof
 * 3. If verified → chat with the AI, get on-chain proof per response
 * 4. If not verified → pay first via Hash PayLink, then retry
 */

import { useState, useRef, useEffect } from 'react'
import { Link }                         from 'react-router-dom'
import { cn }                           from '../lib/utils'
import {
  CheckCircle2, AlertCircle, Loader2, Send,
  ExternalLink, ArrowLeft, ShieldCheck, Zap,
  Wallet, CreditCard, Radio,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type VerifyResult = {
  verified: boolean
  payment?: { payer: string; chain: string; amount: string; ts: number }
  proof?:   { ogTxHash: string; ogExplorer: string; network: string }
  error?:   string
  paymentLink?: string
}

type Message = {
  question: string
  answer:   string
  proof:    { ogTxHash: string; ogExplorer: string }
}

// ─── Demo credentials (pre-filled for judges) ─────────────────────────────────
const DEMO_EVENT_ID = 'test-0g-1778114523394'
const DEMO_PAYER    = 'HashPayLink 0G Test'

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDemo() {
  const params = new URLSearchParams(window.location.search)
  const agentSlug = params.get('agent') ?? ''
  const agentWallet = params.get('wallet') ?? params.get('e') ?? ''
  const agentPrice = params.get('price') ?? '1'
  const agentStreamPrice = params.get('streamPrice') ?? ''
  const agentStreamDuration = params.get('streamDuration') ?? ''
  const agentNetwork = params.get('n') ?? 'base'
  const showAgentProfile = params.get('profile') === 'agent' || Boolean(agentSlug || agentWallet)
  const [eventId,    setEventId]    = useState(() => params.get('eventId') ?? '')
  const [payer,      setPayer]      = useState(() => params.get('payer')   ?? '')
  const [fundAmount, setFundAmount] = useState(() => params.get('fund') ?? '10')
  const [verifying,  setVerifying]  = useState(false)
  const [verified,   setVerified]   = useState<VerifyResult | null>(null)
  const [question,   setQuestion]   = useState('')
  const [messages,   setMessages]   = useState<Message[]>([])
  const [isAsking,   setIsAsking]   = useState(false)
  const [askError,   setAskError]   = useState<string | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const autoRan      = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  // Auto-verify when eventId + payer arrive via access link URL params
  useEffect(() => {
    if (autoRan.current) return
    const id   = params.get('eventId')
    const name = params.get('payer')
    if (id && name) {
      autoRan.current = true
      setVerifying(true)
      setVerified(null)
      fetch(`/api/agent-verify?eventId=${encodeURIComponent(id)}&payer=${encodeURIComponent(name)}`)
        .then(r => r.json() as Promise<VerifyResult>)
        .then(data => { setVerified(data); if (data.verified) setMessages([]) })
        .catch(() => setVerified({ verified: false, error: 'Verification service unreachable' }))
        .finally(() => setVerifying(false))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    if (!eventId.trim() || !payer.trim()) return
    setVerifying(true)
    setVerified(null)
    try {
      const res  = await fetch(`/api/agent-verify?eventId=${encodeURIComponent(eventId.trim())}&payer=${encodeURIComponent(payer.trim())}`)
      const data = await res.json() as VerifyResult
      setVerified(data)
      if (data.verified) setMessages([])
    } catch {
      setVerified({ verified: false, error: 'Verification service unreachable' })
    } finally {
      setVerifying(false)
    }
  }

  async function handleAsk() {
    if (!question.trim() || isAsking || !verified?.verified) return
    const q = question.trim()
    setQuestion('')
    setAskError(null)
    setIsAsking(true)
    try {
      const res  = await fetch('/api/agent-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ eventId: eventId.trim(), payer: payer.trim(), question: q }),
      })
      const data = await res.json() as {
        answer?: string; proof?: { ogTxHash: string; ogExplorer: string }; error?: string
      }
      if (!data.answer || !data.proof) throw new Error(data.error ?? 'No response')
      setMessages(prev => [...prev, { question: q, answer: data.answer!, proof: data.proof! }])
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsAsking(false)
    }
  }

  function fillDemo() {
    setEventId(DEMO_EVENT_ID)
    setPayer(DEMO_PAYER)
    setVerified(null)
    setMessages([])
  }

  function buildAgentFundUrl() {
    const p = new URLSearchParams()
    p.set('id', `agent-${agentSlug || 'hashpaylink'}-fund-${Date.now().toString(36)}`)
    p.set('a', fundAmount.trim() || '10')
    p.set('m', `Fund agent wallet: ${agentSlug || 'Hash PayLink Agent'}`)
    p.set('n', agentNetwork)
    p.set('x', '1')
    p.set('v', '1')
    p.set('src', 'agent')
    if (agentWallet) p.set('e', agentWallet)
    return `/pay?${p.toString()}`
  }

  function buildAgentStreamUrl() {
    if (!agentWallet || !agentStreamPrice || !agentStreamDuration) return ''
    const p = new URLSearchParams()
    p.set('app', 'streampay')
    p.set('amount', agentStreamPrice)
    p.set('recipient', agentWallet)
    p.set('duration', agentStreamDuration)
    p.set('reason', `Agent retainer: ${agentSlug || 'Hash PayLink Agent'}`)
    p.set('src', 'agent')
    p.set('wallet', 'circle')
    return `/?${p.toString()}`
  }

  const agentStreamUrl = buildAgentStreamUrl()

  return (
    <div className="mx-auto max-w-2xl animate-slide-up space-y-6">

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Create a link
      </Link>

      {showAgentProfile && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-[#1c1c20] dark:border-white/10">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Agent treasury</p>
              <h1 className="mt-1 truncate text-lg font-semibold text-gray-900 dark:text-white">
                {agentSlug || 'Hash PayLink Agent'}
              </h1>
              <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                {agentWallet || 'Circle Agent Wallet not configured'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Ask</p>
              <p className="text-xs text-gray-500">{agentPrice} USDC once</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <Radio className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Stream</p>
              <p className="text-xs text-gray-500">
                {agentStreamPrice && agentStreamDuration ? `${agentStreamPrice} USDC / ${agentStreamDuration}` : 'Not set'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <Wallet className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Fund</p>
              <p className="text-xs text-gray-500">Treasury on {agentNetwork}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <input
                value={fundAmount}
                onChange={e => setFundAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none dark:text-white"
              />
              <span className="text-xs font-semibold text-gray-400">USDC</span>
            </div>
            <a
              href={agentWallet ? buildAgentFundUrl() : undefined}
              aria-disabled={!agentWallet}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98]',
                agentWallet
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'pointer-events-none bg-gray-100 text-gray-400 dark:bg-white/[0.06]'
              )}
            >
              <Wallet className="h-4 w-4" /> Fund Agent Wallet
            </a>
          </div>

          {agentStreamUrl && (
            <a
              href={agentStreamUrl}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
            >
              <Radio className="h-4 w-4" /> Start StreamPay Retainer
            </a>
          )}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-100 bg-white p-6 shadow-sm dark:bg-[#1c1c20] dark:border-purple-900/30">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
            <ShieldCheck className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              Payment-Gated AI Assistant
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Access is granted only to verified payers. Payment proof is read directly
              from{' '}
              <a href="https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events"
                target="_blank" rel="noopener noreferrer"
                className="font-medium text-purple-500 hover:underline underline-offset-2">
                0G Mainnet
              </a>
              {' '}— no central server involved.
            </p>
          </div>
        </div>

        {/* Demo shortcut */}
        <button
          onClick={fillDemo}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-purple-200 dark:border-purple-800 px-3 py-1.5 text-xs font-medium text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        >
          <Zap className="h-3 w-3" /> Try with demo credentials
        </button>
      </div>

      {/* ── Step 1 — Verify ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-[#1c1c20] dark:border-white/10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Step 1 — Verify your payment
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Event ID
            </label>
            <input
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="e.g. test-0g-1778114523394"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Your name / payer handle
            </label>
            <input
              value={payer}
              onChange={e => setPayer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="The name you entered when paying"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800"
            />
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifying || !eventId.trim() || !payer.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-purple-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying on 0G…</>
            : <><ShieldCheck className="h-4 w-4" /> Verify Payment on 0G</>}
        </button>

        {/* Verification result */}
        {verified && !verified.verified && (
          <div className="rounded-xl border border-red-100 bg-red-50 dark:bg-red-900/10 dark:border-red-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">No payment found</p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              {verified.error ?? 'No verified payment found on 0G Storage for this payer.'}
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 underline underline-offset-2"
            >
              Create a payment link →
            </Link>
          </div>
        )}

        {verified?.verified && verified.payment && verified.proof && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Payment verified on 0G</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {verified.payment.payer} · {verified.payment.amount} · {verified.payment.chain}
            </p>
            <a
              href={verified.proof.ogExplorer}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
            >
              View on-chain proof <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Step 2 — Chat ─────────────────────────────────────────────────── */}
      {verified?.verified && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:bg-[#1c1c20] dark:border-white/10 overflow-hidden">
          <div className="border-b border-gray-100 dark:border-white/10 px-5 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Step 2 — Ask anything
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Access granted · responses include verifiable 0G proof
            </p>
          </div>

          {/* Messages */}
          <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-5 space-y-5">
            {messages.length === 0 && !isAsking && (
              <p className="text-center text-sm text-gray-300 dark:text-gray-600 pt-8">
                Your payment is verified. Ask anything below.
              </p>
            )}

            {messages.map((m, i) => (
              <div key={i} className="space-y-3">
                {/* Question */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-2.5 text-sm text-white">
                    {m.question}
                  </div>
                </div>
                {/* Answer */}
                <div className="space-y-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {m.answer}
                  </div>
                  {/* 0G proof per message */}
                  <a
                    href={m.proof.ogExplorer}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <span className="px-1 py-0.5 rounded border bg-purple-50 text-purple-500 border-purple-100 dark:bg-purple-900/20 dark:border-purple-900/30 font-bold leading-none text-[8px]">
                      0G
                    </span>
                    Payment proof verified on 0G Mainnet <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            ))}

            {isAsking && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating response…
              </div>
            )}

            {askError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 dark:bg-red-900/10 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-600">{askError}</p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 dark:border-white/10 p-4">
            <div className="flex items-center gap-2">
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                placeholder="Ask anything…"
                disabled={isAsking}
                className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 disabled:opacity-50"
              />
              <button
                onClick={handleAsk}
                disabled={isAsking || !question.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:bg-[#1c1c20] dark:border-white/10 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">How this works</p>
        <div className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          {[
            'You pay via Hash PayLink — any chain, zero gas',
            'Payment record is uploaded to 0G decentralized storage',
            'Root hash anchored on PayLinkArchive contract (0G Mainnet)',
            'This page queries 0G Mainnet directly — no Hash PayLink server involved',
            'Payment verified → AI responds + returns on-chain proof per message',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/20 text-[9px] font-bold text-purple-500">
                {i + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <a
          href="https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-purple-500 hover:underline underline-offset-2 pt-1"
        >
          View all archived payments on 0G Explorer <ExternalLink className="h-3 w-3" />
        </a>
      </div>

    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  LineChart,
  MessageCircle,
  Pencil,
  Radio,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { cn } from '../lib/utils'

const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'

function displayTelegramName(rawName: string | null, fallback = 'there') {
  const clean = (rawName ?? '').replace(/^@+/, '').trim()
  if (!clean) return fallback
  if (/\s/.test(clean)) return clean
  return `@${clean}`
}

const paymentLinkServices = [
  {
    title: 'Request USDC',
    body: 'Request one payer or collect from a group.',
    icon: Coins,
    status: 'Open',
    active: true,
  },
  {
    title: 'Fund Polymarket',
    body: 'Send USDC to a Polymarket funding wallet.',
    icon: Building2,
    status: 'Soon',
    active: false,
  },
  {
    title: 'Fund Agent Wallet',
    body: 'Fund a Circle CLI agent wallet.',
    icon: Wallet,
    status: 'Soon',
    active: false,
  },
]

const telegramSections = [
  { id: 'payment-links', title: 'Payment Links', icon: Coins, active: true },
  { id: 'agent-wallets', title: 'Agent Wallets', icon: Bot, active: false },
  { id: 'market-tools', title: 'Market Tools', icon: LineChart, active: false },
  { id: 'streampay', title: 'StreamPay', icon: Radio, active: false },
]

type RequestMode = 'person' | 'group'

type SavedRequest = {
  mode: RequestMode
  wallet: string
  label: string
  target: string
  amount: string
}

export default function TelegramPaymentLinks() {
  const [searchParams] = useSearchParams()
  const initialMode: RequestMode | '' = searchParams.get('mode') === 'group' ? 'group' : searchParams.get('mode') === 'person' ? 'person' : ''
  const initialPersonTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('payer') ?? searchParams.get('p'), '')
  const initialGroupTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('group') ?? searchParams.get('g') ?? searchParams.get('chat'), '')
  const [opened, setOpened] = useState(searchParams.get('open') === '1')
  const [activeSection] = useState('payment-links')
  const [activeService, setActiveService] = useState(initialMode ? 'request-usdc' : '')
  const [requestMode, setRequestMode] = useState<RequestMode | ''>(initialMode)
  const [savedRequest, setSavedRequest] = useState<SavedRequest | null>(null)
  const [wallet, setWallet] = useState('')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState(initialMode === 'group' ? initialGroupTarget : initialPersonTarget)
  const telegramName = useMemo(
    () => displayTelegramName(searchParams.get('u') ?? searchParams.get('username'), 'there'),
    [searchParams],
  )

  const requestFormTarget = target.trim()
  const canSaveRequest = wallet.trim().length > 5 && label.trim().length > 1 && requestFormTarget.length > 1 && !!requestMode

  function openRequestService() {
    setActiveService('request-usdc')
    if (savedRequest) {
      setRequestMode(savedRequest.mode)
      setWallet(savedRequest.wallet)
      setLabel(savedRequest.label)
      setAmount(savedRequest.amount)
      setTarget(savedRequest.target)
    }
  }

  function resetRequestForm(mode: RequestMode) {
    setRequestMode(mode)
    if (!savedRequest || savedRequest.mode !== mode) {
      setWallet('')
      setLabel('')
      setAmount('')
      setTarget(mode === 'group' ? initialGroupTarget : initialPersonTarget)
    } else {
      setTarget(savedRequest.target)
    }
  }

  function saveRequest() {
    if (!requestMode || !canSaveRequest) return
    setSavedRequest({
      mode: requestMode,
      wallet: wallet.trim(),
      label: label.trim(),
      target: requestFormTarget,
      amount: amount.trim(),
    })
    setRequestMode('')
  }

  return (
    <div className="mx-auto max-w-md animate-slide-up space-y-5">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400">
          <MessageCircle className="h-4 w-4" />
          <span>Telegram</span>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.08]">
            <Bot className="h-[18px] w-[18px] text-gray-700 dark:text-gray-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Hello {telegramName}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                What do you want to fund or request today?
              </p>
            </div>

            {!opened && (
              <button
                type="button"
                onClick={() => setOpened(true)}
                className="mt-1 flex w-full items-center justify-between rounded-b-xl rounded-tr-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.08]"
              >
                <span>Open Hash PayLink</span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {opened && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Hash PayLink</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Telegram Dashboard</h1>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Create payment actions and share them back into Telegram.
              </p>
            </div>
            <img src="/hash-logo-transparent.png" alt="" className="h-9 w-9 rounded-lg border border-gray-100 bg-white object-contain p-1 dark:border-white/10 dark:bg-white/[0.06]" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {telegramSections.map(({ id, title, icon: Icon, active }) => (
              <button
                key={id}
                type="button"
                disabled={!active}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition-all',
                  id === activeSection
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-100 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400',
                  !active && 'cursor-not-allowed opacity-70',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{title}</span>
              </button>
            ))}
          </div>

          {activeService === 'request-usdc' ? (
            <RequestUsdcPanel
              requestMode={requestMode}
              savedRequest={savedRequest}
              requestFormTarget={requestFormTarget}
              canSaveRequest={canSaveRequest}
              wallet={wallet}
              label={label}
              amount={amount}
              target={target}
              setWallet={setWallet}
              setLabel={setLabel}
              setAmount={setAmount}
              setTarget={setTarget}
              resetRequestForm={resetRequestForm}
              saveRequest={saveRequest}
              onBack={() => {
                setActiveService('')
                setRequestMode('')
              }}
              onBackToModes={() => setRequestMode('')}
              onEditSaved={() => {
                if (!savedRequest) return
                setRequestMode(savedRequest.mode)
                setWallet(savedRequest.wallet)
                setLabel(savedRequest.label)
                setAmount(savedRequest.amount)
                setTarget(savedRequest.target)
              }}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {paymentLinkServices.map(({ title, body, icon: Icon, status, active }) => (
                <button
                  key={title}
                  type="button"
                  onClick={active ? openRequestService : undefined}
                  disabled={!active}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all',
                    active
                      ? 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]'
                      : 'cursor-not-allowed border-gray-100 bg-gray-50/60 opacity-70 dark:border-white/10 dark:bg-white/[0.03]',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06]',
                      )}>
                        {status}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</span>
                  </span>
                  {active ? <ArrowRight className="h-4 w-4 text-gray-400" /> : <CheckCircle2 className="h-4 w-4 text-gray-300" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RequestUsdcPanel({
  requestMode,
  savedRequest,
  requestFormTarget,
  canSaveRequest,
  wallet,
  label,
  amount,
  target,
  setWallet,
  setLabel,
  setAmount,
  setTarget,
  resetRequestForm,
  saveRequest,
  onBack,
  onBackToModes,
  onEditSaved,
}: {
  requestMode: RequestMode | ''
  savedRequest: SavedRequest | null
  requestFormTarget: string
  canSaveRequest: boolean
  wallet: string
  label: string
  amount: string
  target: string
  setWallet: (value: string) => void
  setLabel: (value: string) => void
  setAmount: (value: string) => void
  setTarget: (value: string) => void
  resetRequestForm: (mode: RequestMode) => void
  saveRequest: () => void
  onBack: () => void
  onBackToModes: () => void
  onEditSaved: () => void
}) {
  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={requestMode ? onBackToModes : onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Request USDC</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Create a payment request</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Save it, then share a clean payment card in Telegram.
          </p>
        </div>
        {savedRequest && (
          <button
            type="button"
            onClick={onEditSaved}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            aria-label="Edit request"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {savedRequest && !requestMode ? (
        <SavedRequestCard request={savedRequest} onEdit={() => resetRequestForm(savedRequest.mode)} />
      ) : (
        <>
          {!requestMode && (
            <div className="mt-4 space-y-2">
              <RequestModeButton
                icon={UserRound}
                title="Share to one chat"
                body="One payer. Share to any DM or chat."
                onClick={() => resetRequestForm('person')}
              />
              <RequestModeButton
                icon={UsersRound}
                title="Share to a group"
                body="One collection link for donations, dues, splits, or registrations."
                onClick={() => resetRequestForm('group')}
              />
            </div>
          )}

          {requestMode && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {requestMode === 'group' ? 'Group collection' : 'One-chat request'}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {requestMode === 'group' ? 'Group collection' : 'One payer'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {requestMode === 'group'
                    ? 'Everyone opens the same collection link.'
                    : 'Create one payment request and share it in Telegram.'}
                </p>
              </div>

              <InputBlock
                label={requestMode === 'group' ? 'Group name' : 'Payer'}
                value={target}
                onChange={setTarget}
                placeholder={requestMode === 'group' ? 'Pizza DAO, class dues...' : 'Drea, Alex, customer name...'}
              />
              <InputBlock
                label="Receive wallet"
                value={wallet}
                onChange={setWallet}
                placeholder="0x... or Solana address"
              />
              <InputBlock
                label={requestMode === 'group' ? 'Collection name' : 'For'}
                value={label}
                onChange={setLabel}
                placeholder={requestMode === 'group' ? 'Pizza DAO, donations, dues...' : 'Dinner, invoice, Shy...'}
              />
              <InputBlock
                label="Amount"
                value={amount}
                onChange={setAmount}
                placeholder="Optional"
              />

              <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {requestMode === 'group' ? 'Group' : 'Payer'}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {requestMode === 'group'
                    ? (requestFormTarget || 'Telegram group')
                    : requestFormTarget}
                </p>
              </div>

              <button
                type="button"
                onClick={saveRequest}
                disabled={!canSaveRequest}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Send className="h-4 w-4" />
                {requestMode === 'group' ? 'Save collection' : 'Save request'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RequestModeButton({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof UserRound
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-all hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </button>
  )
}

function InputBlock({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
      />
    </label>
  )
}

function SavedRequestCard({
  request,
  onEdit,
}: {
  request: SavedRequest
  onEdit: () => void
}) {
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const amountLine = request.amount ? `${request.amount} USDC` : 'Flexible amount'

  async function shareInTelegram() {
    if (sharing) return
    setSharing(true)
    setShareError('')

    try {
      const res = await fetch('/api/telegram-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const data = await res.json() as { ok?: boolean; botPayload?: string; error?: string }
      if (!res.ok || !data.ok || !data.botPayload) {
        throw new Error(data.error || 'Could not prepare Telegram request.')
      }

      const botUrl = buildTelegramBotStartUrl(data.botPayload)
      const telegramWebApp = (window as Window & {
        Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } }
      }).Telegram?.WebApp

      if (telegramWebApp?.openTelegramLink) {
        telegramWebApp.openTelegramLink(botUrl)
      } else {
        window.location.href = botUrl
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not open Telegram.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Request saved</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-200/80">
          Ready to share in Telegram.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Current request</p>
            <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{request.label}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {request.target} {request.amount ? `- ${request.amount} USDC` : '- flexible amount'}
            </p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.08]"
            aria-label="Edit request"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={shareInTelegram}
        disabled={sharing}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
      >
        <Send className="h-4 w-4" />
        {sharing ? 'Preparing request...' : 'Share in Telegram'}
      </button>
      {shareError && <p className="text-center text-xs text-red-500 dark:text-red-300">{shareError}</p>}
    </div>
  )
}

function buildRequestPayLink(request: SavedRequest) {
  const params = new URLSearchParams()
  const wallet = request.wallet.trim()
  const amount = request.amount.trim()

  if (amount) params.set('a', amount)
  else params.set('f', '1')

  params.set('src', 't')
  if (wallet.toLowerCase().startsWith('0x')) {
    params.set('n', 'base')
    params.set('e', wallet)
  } else {
    params.set('n', 'solana')
    params.set('s', wallet)
  }

  params.set('m', request.label)
  if (request.mode === 'group') {
    params.set('v', '1')
    params.set('id', request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }

  return `${window.location.origin}/pay?${params.toString()}`
}

function buildShortRequestPayLink(request: SavedRequest) {
  const wallet = request.wallet.trim()
  const amount = request.amount.trim() || '-'
  const memo = request.label.trim() || '-'
  const network = wallet.startsWith('0x') ? 'base' : 'solana'
  const params = new URLSearchParams()
  if (request.mode === 'group') {
    params.set('v', '1')
    params.set('id', request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return `${window.location.origin}/p/${encodeURIComponent(network)}/${encodeURIComponent(amount)}/${encodeURIComponent(wallet)}/${encodeURIComponent(memo)}${suffix}`
}

function buildTelegramBotStartUrl(payload: string) {
  const base = TELEGRAM_BOT_URL.trim().replace(/\/+$/, '') || 'https://t.me/HashPayLinkBot'
  const cleanPayload = payload.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  if (base.includes('?')) return `${base}&start=${encodeURIComponent(cleanPayload)}`
  return `${base}?start=${encodeURIComponent(cleanPayload)}`
}

import { ChevronDown, LineChart, Radio, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../lib/utils'
import {
  LpScoutPanel,
  type LpScoutPrefill,
  PolyPortfolioPanel,
  PolyStreamPanel,
  PolyWorldCupHubPanel,
  PolyWorldCupNewsPanel,
  TelegramHelperPanel,
} from './TelegramPaymentLinks'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'worldcup-news' | 'worldcup-scores'
type PolyDeskMenuKey = 'agent' | PolyDeskLane

function PolymarketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M6.25 5.8 18.4 2.75a1 1 0 0 1 1.24.97v16.56a1 1 0 0 1-1.24.97L6.25 18.2a1 1 0 0 1-.75-.97V6.77a1 1 0 0 1 .75-.97Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 8.45 17.2 5.9v5.35L7.2 8.45ZM7.2 15.55l10-2.8v5.35l-10-2.55Z"
        fill="currentColor"
      />
    </svg>
  )
}

function PolyDeskLiveAgentIcon({ isStatic = false }: { isStatic?: boolean }) {
  return (
    <span className={cn('polydesk-live-agent', isStatic && 'polydesk-live-agent--static')} aria-hidden="true">
      <PolymarketMark className="polydesk-live-agent__mark" />
      <span className="ask-hash-live-agent__bubble">
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}

function ServiceDeskIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="42" y="260" width="76" height="158" rx="12" fill="currentColor" />
      <path
        d="M138 276h65c20 0 43 8 62 19l42 24c9 5 13 15 9 24-3 7-10 12-18 12H207v12h99c10 0 19-2 27-7l113-48c14-6 30 2 34 16 3 10-1 21-11 27L297 459c-14 8-30 10-45 5l-137-44V292c7-10 14-16 23-16Z"
        fill="currentColor"
      />
      <path
        d="M208 356h90c18 0 29-20 20-35"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M314 64h52l10 47 39-27 37 37-27 39 47 10v52l-47 10 27 39-37 37-39-27-10 47h-52l-10-47-39 27-37-37 27-39-47-10v-52l47-10-27-39 37-37 39 27 10-47Z"
        fill="currentColor"
      />
      <circle cx="340" cy="196" r="56" fill="#ffffff" />
    </svg>
  )
}

const polyDeskServices: Array<{
  id: PolyDeskLane
  title: string
  body: string
  icon: typeof Wallet
}> = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    body: 'Track balances, open positions, claimables, and risk alerts.',
    icon: Wallet,
  },
  {
    id: 'worldcup',
    title: 'World Cup',
    body: 'Live scores, market odds, and direct trade routes.',
    icon: Radio,
  },
  {
    id: 'lp-scout',
    title: 'LP Scout',
    body: 'Paid x402 research for LP reward opportunities.',
    icon: LineChart,
  },
]

const polyDeskMenuItems: Array<{
  id: PolyDeskMenuKey
  title: string
  body: string
  icon?: typeof Wallet
}> = [
  {
    id: 'agent',
    title: 'Desk Agent',
    body: 'Ask PolyDesk for market context, wallet readiness, funding guidance, and LP Scout routing.',
  },
  ...polyDeskServices,
]

function normalizeLane(value: string | null): PolyDeskLane | '' {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' ? value : ''
}

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores'
    ? value
    : ''
}

export default function PolyDesk() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeLane = normalizeLane(searchParams.get('lane'))
  const activeServiceView = normalizeServiceView(searchParams.get('service'))
  const agentRouteOpen = searchParams.get('agent') === '1'
  const [isAgentOpen, setIsAgentOpen] = useState(Boolean(activeLane || agentRouteOpen))
  const [agentLane, setAgentLane] = useState<PolyDeskLane | ''>(activeLane)
  const [serviceView, setServiceView] = useState<PolyDeskServiceView>(activeServiceView)
  const [lpScoutPrefill, setLpScoutPrefill] = useState<LpScoutPrefill | null>(null)
  const [polyDeskResetSignal, setPolyDeskResetSignal] = useState(0)
  const helperKey = activeLane || 'choose-lane'
  const welcomeText = 'Welcome back, there. Ask me about Polymarket funding, portfolio, World Cup markets, LP Scout, and live market context.'

  const ownerKey = useMemo(() => {
    const email = searchParams.get('email')?.trim().toLowerCase()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    return email ? `email:${email}` : wallet ? `wallet:${wallet}` : 'polydesk-web'
  }, [searchParams])

  function openAgent() {
    const next = new URLSearchParams(searchParams)
    next.set('agent', '1')
    next.delete('lane')
    next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView('')
    setAgentLane('')
    setIsAgentOpen(true)
    window.setTimeout(() => {
      document.querySelector('[data-polydesk-active-view="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  function openMenuItem(item: PolyDeskMenuKey) {
    if (item === 'agent') {
      openAgent()
      return
    }
    openServiceView(item)
  }

  function openServiceView(view: PolyDeskServiceView) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    if (view) next.set('service', view)
    else next.delete('service')
    setSearchParams(next, { replace: false })
    setIsAgentOpen(false)
    setAgentLane('')
    setServiceView(view)
    window.setTimeout(() => {
      document.querySelector('[data-polydesk-service-view="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  function closeServiceView() {
    setServiceView('')
    setLpScoutPrefill(null)
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    setSearchParams(next, { replace: false })
  }

  function resetLane() {
    if (serviceView) {
      closeServiceView()
      return
    }
    if (activeLane || agentLane) {
      const next = new URLSearchParams(searchParams)
      next.set('agent', '1')
      next.delete('lane')
      window.localStorage.removeItem(`hashpaylink-helper-active-mode:${ownerKey}:polydesk`)
      setAgentLane('')
      setPolyDeskResetSignal(value => value + 1)
      if (activeLane) setSearchParams(next, { replace: false })
      return
    }
    if (agentRouteOpen) {
      const historyState = window.history.state as { idx?: number } | null
      if ((historyState?.idx ?? 0) > 0) {
        navigate(-1)
        return
      }
      const next = new URLSearchParams(searchParams)
      next.delete('lane')
      next.delete('agent')
      setSearchParams(next, { replace: true })
      setIsAgentOpen(false)
      return
    }
    if (isAgentOpen) {
      setIsAgentOpen(false)
      return
    }
    if (!activeLane) {
      navigate(-1)
      return
    }
  }

  useEffect(() => {
    setIsAgentOpen(Boolean(activeLane || agentRouteOpen))
    setAgentLane(activeLane)
  }, [activeLane, agentRouteOpen])

  useEffect(() => {
    setServiceView(activeServiceView)
    if (activeServiceView) {
      setIsAgentOpen(false)
      setAgentLane('')
    }
  }, [activeServiceView])

  return (
    <main className="text-gray-950 dark:text-white">
      <div className="mx-auto mt-6 w-full max-w-lg space-y-6 sm:mt-8">
        <div className="px-1">
          <h1 className="text-[22px] font-black tracking-tight text-gray-950 dark:text-white">PolyDesk</h1>
          <p className="mt-1 text-[13px] leading-5 text-gray-500 dark:text-gray-400">
            Polymarket watch, trading, World Cup markets, and LP Scout.
          </p>
        </div>

        {isAgentOpen && (
          <button
            type="button"
            onClick={resetLane}
            className="inline-flex items-center gap-1.5 px-1 text-[12px] font-bold text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-200"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-90" />
            Back
          </button>
        )}

        {!isAgentOpen && !serviceView && (
          <section className="space-y-2">
            {polyDeskMenuItems.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openMenuItem(item.id)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                      {item.id === 'agent' ? (
                        <PolyDeskLiveAgentIcon isStatic />
                      ) : Icon ? (
                        <Icon className="h-4 w-4" />
                      ) : (
                        <ServiceDeskIcon className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-black text-gray-950 dark:text-white">{item.title}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">{item.body}</span>
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-gray-950">
                    <ChevronDown className="-rotate-90 h-4 w-4" />
                  </span>
                </button>
              )
            })}
          </section>
        )}

        {isAgentOpen && (
          <section
            data-polydesk-active-view="true"
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]"
          >
            <div className="border-b border-gray-100 p-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <PolyDeskLiveAgentIcon isStatic />
                <div>
                  <p className="text-[13px] font-bold text-gray-900 dark:text-white">Desk Agent</p>
                  <p className="text-[11px] text-gray-400">Polymarket service assistant</p>
                </div>
              </div>
            </div>
            <TelegramHelperPanel
              key={helperKey}
              telegramName="there"
              ownerKey={ownerKey}
              telegramId=""
              fallbackOwner="polydesk-web"
              initialEventId=""
              initialPayer=""
              initialHelperMode="polydesk"
              initialPolyDeskSubMode={activeLane}
              initialNotice=""
              lockedHelperMode="polydesk"
              welcomeText={welcomeText}
              inputPlaceholder="Ask PolyDesk..."
              hideTopDivider
              polyDeskResetSignal={polyDeskResetSignal}
              onPolyDeskSubModeChange={setAgentLane}
              onRecoverTelegramName={() => undefined}
              onBack={() => {
                if (activeLane) {
                  const next = new URLSearchParams(searchParams)
                  next.delete('lane')
                  setSearchParams(next, { replace: false })
                }
              }}
            />
          </section>
        )}

        {serviceView && !isAgentOpen && (
          <section
            data-polydesk-service-view="true"
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]"
          >
            {serviceView === 'portfolio' ? (
              <PolyPortfolioPanel
                onBack={closeServiceView}
                onOpenLpScout={() => openServiceView('lp-scout')}
                onOpenWorldCup={() => openServiceView('worldcup')}
                telegramOwner={ownerKey}
                telegramId=""
              />
            ) : serviceView === 'worldcup' ? (
              <PolyWorldCupHubPanel
                onBack={closeServiceView}
                onOpenNews={() => openServiceView('worldcup-news')}
                onOpenScores={() => openServiceView('worldcup-scores')}
                onOpenPortfolio={() => openServiceView('portfolio')}
              />
            ) : serviceView === 'worldcup-news' ? (
              <PolyWorldCupNewsPanel
                onBack={() => openServiceView('worldcup')}
                onOpenScores={() => openServiceView('worldcup-scores')}
                onOpenLpScout={prefill => {
                  setLpScoutPrefill(prefill)
                  openServiceView('lp-scout')
                }}
              />
            ) : serviceView === 'worldcup-scores' ? (
              <PolyStreamPanel
                onBack={() => openServiceView('worldcup')}
                onOpenNews={() => openServiceView('worldcup-news')}
              />
            ) : (
              <LpScoutPanel
                prefill={lpScoutPrefill}
                onPrefillConsumed={() => setLpScoutPrefill(null)}
                onOpenWalletManager={() => {
                  navigate('/agent?profile=agent&walletManager=service&src=lp-scout')
                }}
                onBack={closeServiceView}
              />
            )}
          </section>
        )}
      </div>
    </main>
  )
}

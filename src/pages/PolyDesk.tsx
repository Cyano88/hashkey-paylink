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

function ServiceHubIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M314 64h52l10 47 39-27 37 37-27 39 47 10v52l-47 10 27 39-37 37-39-27-10 47h-52l-10-47-39 27-37-37 27-39-47-10v-52l47-10-27-39 37-37 39 27 10-47Z"
        fill="currentColor"
      />
      <circle cx="340" cy="196" r="56" fill="#ffffff" />
      <rect x="42" y="260" width="76" height="158" rx="12" fill="currentColor" />
      <path
        d="M138 276h65c20 0 43 8 62 19l42 24c9 5 13 15 9 24-3 7-10 12-18 12H207v12h99c10 0 19-2 27-7l113-48c14-6 30 2 34 16 3 10-1 21-11 27L297 459c-14 8-30 10-45 5l-137-44V292c7-10 14-16 23-16Z"
        fill="currentColor"
      />
    </svg>
  )
}

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
  const [promptIndex, setPromptIndex] = useState(0)
  const helperKey = activeLane || 'choose-lane'
  const welcomeText = 'Welcome back, there. Ask me about Polymarket funding, portfolio, World Cup markets, LP Scout, and live market context.'
  const introPrompts = useMemo(() => [
    { text: 'I am Desk Agent.', delayMs: 5200 },
    { text: 'Tap to launch me.', delayMs: 3600 },
    { text: 'I can help with portfolio alerts.', delayMs: 6200 },
    { text: 'I can read World Cup markets.', delayMs: 6200 },
    { text: 'I can guide LP Scout access.', delayMs: 6200 },
    { text: 'I can help fund Polymarket.', delayMs: 6200 },
  ], [])

  const ownerKey = useMemo(() => {
    const email = searchParams.get('email')?.trim().toLowerCase()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    return email ? `email:${email}` : wallet ? `wallet:${wallet}` : 'polydesk-web'
  }, [searchParams])

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
    if (isAgentOpen) return undefined
    const delay = introPrompts[promptIndex]?.delayMs ?? 5200
    const timer = window.setTimeout(() => {
      setPromptIndex(index => (index + 1) % introPrompts.length)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [introPrompts, isAgentOpen, promptIndex])

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

  function launchAgent() {
    if (!agentRouteOpen) {
      const next = new URLSearchParams(searchParams)
      next.set('agent', '1')
      next.delete('service')
      setSearchParams(next, { replace: false })
    }
    setServiceView('')
    setIsAgentOpen(true)
  }

  return (
    <main className="text-gray-950 dark:text-white">
      <div className="mx-auto w-full max-w-md space-y-5">
        {isAgentOpen && (
          <button
            type="button"
            onClick={resetLane}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <span className="back-btn" aria-hidden="true">
              <span className="arrow-container">
                <span className="chevron c1" />
                <span className="chevron c2" />
                <span className="chevron c3" />
              </span>
            </span>
            Back
          </button>
        )}

        {!isAgentOpen && !serviceView && (
          <div className="mb-1 flex flex-col items-start text-left">
            <span className="mb-4 inline-flex items-center justify-center gap-2 text-sm font-bold leading-none text-[#0071E3] dark:text-blue-200">
              <ServiceHubIcon className="h-7 w-7 shrink-0 text-gray-950 dark:text-white" />
              Service Hub
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-[2.25rem]">
              What do you want to do today?
            </h2>
          </div>
        )}

        {!serviceView && (
          <button
            type="button"
            onClick={launchAgent}
            className={cn(
              'group w-full border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:border-gray-200 hover:shadow-lg active:scale-[0.995] dark:border-white/10 dark:bg-[#111114] dark:hover:bg-[#15151a]',
              isAgentOpen ? '!mt-0 rounded-t-2xl rounded-b-none border-b-0 pb-3 shadow-none' : 'rounded-2xl',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 items-start pt-0.5 text-gray-700 dark:text-gray-300">
                <PolyDeskLiveAgentIcon isStatic={isAgentOpen} />
              </div>
              <div className="min-w-0 flex-1">
                {isAgentOpen ? (
                  <p className="pt-0.5 text-sm font-semibold text-gray-900 dark:text-white">Desk Agent</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Desk Agent</p>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">Hello There</p>
                      </div>
                      <span className="back-btn shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600" aria-hidden="true">
                        <span className="arrow-container arrow-container--right">
                          <span className="chevron c1" />
                          <span className="chevron c2" />
                          <span className="chevron c3" />
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
                      <p
                        key={promptIndex}
                        className="telegram-agent-typewriter text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100"
                      >
                        {introPrompts[promptIndex]?.text}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </button>
        )}

        {isAgentOpen && (
          <section className="!mt-0 overflow-hidden rounded-b-2xl border border-t-0 border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]">
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
              inputPlaceholder="Ask Desk Agent..."
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
            className={cn(
              serviceView === 'portfolio'
                ? 'p-0'
                : 'rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]',
            )}
          >
            {serviceView === 'portfolio' ? (
              <PolyPortfolioPanel
                onBack={closeServiceView}
                onOpenLpScout={() => openServiceView('lp-scout')}
                onOpenWorldCup={() => openServiceView('worldcup')}
                telegramOwner={ownerKey}
                telegramId=""
                surface="standalone"
                initialPortfolioAction={searchParams.get('portfolio') === 'trading' ? 'trading' : null}
                initialTradingWalletTab={searchParams.get('wallet') === 'balance' ? 'balance' : undefined}
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

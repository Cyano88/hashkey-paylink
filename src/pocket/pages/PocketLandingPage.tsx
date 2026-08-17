import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Lock, Mail } from '../components/PocketIcons'
import { Link, useNavigate } from 'react-router-dom'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { CPurseIcon } from '../components/CPurseIcon'
import PocketThemeToggle from '../components/PocketThemeToggle'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import type { PocketSplashState } from '../hooks/usePocketSessionSplash'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

type LogoTarget = { top: number; left: number; width: number; height: number }

export default function PocketLandingPage({ splashState = 'idle' }: { splashState?: PocketSplashState }) {
  const navigate = useNavigate()
  const { ready, authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [authReadyTimedOut, setAuthReadyTimedOut] = useState(false)
  const heroLogoRef = useRef<HTMLDivElement>(null)
  const [logoTarget, setLogoTarget] = useState<LogoTarget | null>(null)
  const splashActive = splashState !== 'idle'
  const splashLaunching = splashState === 'launching'
  const splashLogoVisible = splashState === 'holding' || splashLaunching

  const enterPocket = () => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.home}`)

  useEffect(() => {
    if (ready) {
      setAuthReadyTimedOut(false)
      return
    }
    const timeout = window.setTimeout(() => setAuthReadyTimedOut(true), 6_000)
    return () => window.clearTimeout(timeout)
  }, [ready])

  useEffect(() => {
    if (!authenticated || splashState !== 'idle' || !profile.loaded || profile.busy || profile.loadError || !profile.profile) return
    enterPocket()
  }, [authenticated, profile.busy, profile.loadError, profile.loaded, profile.profile, splashState]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkingProfile = authenticated && (!profile.loaded || profile.busy)
  const profileLoadFailed = authenticated && profile.loaded && Boolean(profile.loadError)

  useLayoutEffect(() => {
    if (!splashActive) return
    const updateTarget = () => {
      const rect = heroLogoRef.current?.getBoundingClientRect()
      if (!rect) return
      setLogoTarget({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    updateTarget()
    window.addEventListener('resize', updateTarget)
    return () => window.removeEventListener('resize', updateTarget)
  }, [splashActive])

  const revealClass = splashActive
    ? splashLaunching
      ? 'translate-y-0 opacity-100'
      : 'translate-y-5 opacity-0'
    : 'translate-y-0 opacity-100'

  if (authenticated) {
    return (
      <main className="fixed inset-0 z-40 flex items-center justify-center bg-[#F5F5F7]" aria-label="Opening Pocket">
        <CPurseIcon size={96} title="Pocket" className="h-24 w-24 text-gray-950" />
      </main>
    )
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#F5F5F7] text-gray-950 transition-colors dark:bg-[#0A0A0A] dark:text-white">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-[-20%] top-[-24rem] h-[40rem] rounded-full bg-black/[0.035] blur-3xl dark:bg-white/[0.045]" />

      <nav className="pointer-events-none absolute inset-x-0 top-0 z-10 sm:relative sm:border-b sm:border-black/[0.08] sm:bg-[#F5F5F7]/90 sm:backdrop-blur-xl sm:dark:border-white/[0.08] sm:dark:bg-[#0A0A0A]/90">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-end px-5 sm:justify-between sm:px-8">
          <div className="pointer-events-auto hidden items-center gap-2.5 sm:flex">
            <CPurseIcon size={38} title="" className="shrink-0 text-gray-950 dark:text-white" />
            <span className="text-[15px] font-black tracking-[-0.025em]">Pocket</span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <PocketThemeToggle />
          </div>
        </div>
      </nav>

      <main className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[560px] flex-col px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-10">
        {checkingProfile || profileLoadFailed ? (
          <section className="flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-[430px]">
              <CPurseIcon size={72} title="" className="mx-auto text-gray-950 dark:text-white" />

              {checkingProfile ? (
                <div className="mt-9 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                    <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-gray-950 border-t-transparent dark:border-white dark:border-t-transparent" />
                  </span>
                  <h1 className="mt-5 text-2xl font-black tracking-[-0.035em]">Checking your Pocket</h1>
                  <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Restoring your secure profile.</p>
                </div>
              ) : (
                <div className="mt-9 text-center">
                  <h1 className="text-2xl font-black tracking-[-0.035em]">We could not check your profile</h1>
                  <p className="mt-2 text-sm font-medium leading-6 text-gray-500 dark:text-gray-400">{profile.loadError}</p>
                  <button
                    type="button"
                    onClick={() => void profile.reload()}
                    className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center py-9 text-center sm:py-12">
            <div ref={heroLogoRef} className={`h-[164px] w-[164px] sm:h-[190px] sm:w-[190px] ${splashActive ? 'opacity-0' : 'opacity-100'}`}>
              <CPurseIcon size={190} title="Pocket" className="h-full w-full text-gray-950 dark:text-white" />
            </div>

            <div className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${revealClass}`} style={{ transitionDelay: splashLaunching ? '100ms' : '0ms' }}>
              <p className="mt-9 text-[11px] font-black uppercase tracking-[0.28em] text-gray-500 dark:text-white/40">Your money, ready to move</p>
              <h1 className="mt-3 max-w-md text-4xl font-black leading-[0.98] tracking-[-0.055em] sm:text-5xl">
                One pocket for digital dollars.
              </h1>
              <p className="mx-auto mt-5 max-w-sm text-sm font-medium leading-6 text-gray-500 dark:text-white/55">
                Receive, manage, and move USDC across the ways you get paid.
              </p>
            </div>
          </section>
        )}

        {!checkingProfile && !profileLoadFailed && <section className={`space-y-2.5 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${revealClass}`} style={{ transitionDelay: splashLaunching ? '180ms' : '0ms' }}>
          {authenticated ? (
            <div className="flex min-h-14 items-center justify-center gap-2.5 text-sm font-semibold text-gray-500 dark:text-gray-400" aria-live="polite">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-950 dark:border-white/25 dark:border-t-white" aria-hidden="true" />
              <span>Opening Pocket</span>
            </div>
          ) : !ready ? (
            <button
              type="button"
              onClick={authReadyTimedOut ? () => window.location.reload() : undefined}
              disabled={!authReadyTimedOut}
              className="relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-6 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:cursor-wait dark:bg-white dark:text-gray-950"
            >
              {authReadyTimedOut ? (
                <span>Retry secure sign in</span>
              ) : (
                <span className="flex items-center gap-2.5" aria-live="polite">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white dark:border-gray-950/25 dark:border-t-gray-950" aria-hidden="true" />
                  Preparing secure sign in
                </span>
              )}
            </button>
          ) : (
            <PrivyConnectButton
              debugLabel="pocket-landing-sign-in"
              logoutOnAuthenticated={false}
              className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
            >
              <Mail className="absolute left-5 h-4 w-4" />
              <span>Sign in to Pocket</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
                <ArrowRight className="h-4 w-4" />
              </span>
            </PrivyConnectButton>
          )}

          <p className="text-center text-[11px] font-medium text-gray-500 dark:text-white/40">Secure email access.</p>
          <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-gray-400 dark:text-white/30">
            <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            Secure payments powered by Circle
          </p>

          <footer className="pt-4 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-500 dark:text-white/40">
              <Link to="/docs/terms" className="transition hover:text-gray-950 dark:hover:text-white/75">Terms</Link>
              <Link to="/docs/privacy" className="transition hover:text-gray-950 dark:hover:text-white/75">Privacy</Link>
              <a href="mailto:support@hashpaylink.com" className="transition hover:text-gray-950 dark:hover:text-white/75">Support</a>
            </div>
            <p className="mt-2 text-[10px] font-bold tracking-[0.08em] text-gray-400 dark:text-white/25">Pocket</p>
          </footer>
        </section>}
      </main>

      {splashActive && (
        <>
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed inset-0 z-20 bg-[#F5F5F7] transition-opacity duration-700 ease-out motion-reduce:hidden ${splashLaunching ? 'opacity-0' : 'opacity-100'}`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed z-30 text-gray-950 transition-[top,left,width,height,transform,opacity] duration-[820ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:hidden ${splashLogoVisible ? 'opacity-100' : 'opacity-0'}`}
            style={splashLaunching && logoTarget
              ? {
                  top: logoTarget.top,
                  left: logoTarget.left,
                  width: logoTarget.width,
                  height: logoTarget.height,
                  transform: 'translate3d(0,0,0)',
                }
              : {
                  top: '50%',
                  left: '50%',
                  width: `${(logoTarget?.width ?? 164) * 1.2}px`,
                  height: `${(logoTarget?.height ?? 164) * 1.2}px`,
                  transform: `translate3d(-50%,-50%,0) scale(${splashLogoVisible ? 1 : 0.92})`,
                }}
          >
            <CPurseIcon size={228} title="" className="h-full w-full" />
          </div>
        </>
      )}
    </div>
  )
}

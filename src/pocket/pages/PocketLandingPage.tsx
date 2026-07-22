import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Lock, Mail, RotateCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { CPurseIcon } from '../components/CPurseIcon'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketLandingPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [enterAfterLogin, setEnterAfterLogin] = useState(false)
  const [nameStep, setNameStep] = useState<'first' | 'last'>('first')
  const [opening, setOpening] = useState(false)

  const enterPocket = () => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.smartWallet}`)

  useEffect(() => {
    if (!authenticated || !enterAfterLogin || opening || !profile.loaded || profile.busy || profile.loadError || !profile.profile) return
    enterPocket()
  }, [authenticated, enterAfterLogin, opening, profile.busy, profile.loadError, profile.loaded, profile.profile]) // eslint-disable-line react-hooks/exhaustive-deps

  async function finishProfile() {
    if (!profile.draft.lastName.trim()) return
    setOpening(true)
    const startedAt = Date.now()
    const saved = await profile.save()
    if (!saved) {
      setOpening(false)
      return
    }
    const remaining = Math.max(0, 650 - (Date.now() - startedAt))
    if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining))
    enterPocket()
  }

  const checkingProfile = authenticated && enterAfterLogin && (!profile.loaded || profile.busy) && !opening
  const onboarding = authenticated && enterAfterLogin && profile.loaded && !profile.profile && !profile.loadError
  const profileLoadFailed = authenticated && enterAfterLogin && profile.loaded && Boolean(profile.loadError) && !opening

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#F5F5F7] text-gray-950 transition-colors dark:bg-[#0A0A0A] dark:text-white">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-[-20%] top-[-24rem] h-[40rem] rounded-full bg-black/[0.035] blur-3xl dark:bg-white/[0.045]" />

      <nav className="relative z-10 border-b border-black/[0.08] bg-[#F5F5F7]/90 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0A0A0A]/90">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <CPurseIcon size={38} title="" className="shrink-0 text-gray-950 dark:text-white" />
            <span className="text-[15px] font-black tracking-[-0.025em]">Pocket</span>
          </div>
          <div className="flex items-center gap-2">
            {!authenticated && (
              <button
                type="button"
                onClick={enterPocket}
                className="rounded-full border border-gray-950 bg-gray-950 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-gray-800 active:scale-[0.98] dark:border-white dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                Guest Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[560px] flex-col px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-10">
        {onboarding || checkingProfile || profileLoadFailed || opening ? (
          <section className="flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-[430px]">
              <CPurseIcon size={72} title="" className="mx-auto text-gray-950 dark:text-white" />

              {checkingProfile || opening ? (
                <div className="mt-9 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                    <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-gray-950 border-t-transparent dark:border-white dark:border-t-transparent" />
                  </span>
                  <h1 className="mt-5 text-2xl font-black tracking-[-0.035em]">{opening ? 'Opening your Pocket' : 'Checking your Pocket'}</h1>
                  <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">{opening ? 'Saving your payout identity and preparing your account.' : 'Restoring your secure profile.'}</p>
                </div>
              ) : profileLoadFailed ? (
                <div className="mt-9 text-center">
                  <h1 className="text-2xl font-black tracking-[-0.035em]">We could not check your profile</h1>
                  <p className="mt-2 text-sm font-medium leading-6 text-gray-500 dark:text-gray-400">{profile.loadError}</p>
                  <button
                    type="button"
                    onClick={() => void profile.reload()}
                    className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                  >
                    <RotateCw className="h-4 w-4" />
                    Try again
                  </button>
                </div>
              ) : (
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Pocket setup</p>
                    <p className="text-[10px] font-black text-gray-400">{nameStep === 'first' ? '1' : '2'} of 2</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <span className={`h-1 rounded-full ${nameStep === 'first' ? 'bg-gray-950 dark:bg-white' : 'bg-gray-300 dark:bg-white/20'}`} />
                    <span className={`h-1 rounded-full ${nameStep === 'last' ? 'bg-gray-950 dark:bg-white' : 'bg-gray-300 dark:bg-white/20'}`} />
                  </div>

                  <h1 className="mt-7 text-3xl font-black tracking-[-0.045em]">{nameStep === 'first' ? 'What is your first name?' : 'And your last name?'}</h1>
                  <p className="mt-2 text-sm font-medium leading-6 text-gray-500 dark:text-gray-400">Used for bank-payout records, receipts, and account support.</p>

                  <label className="mt-6 block">
                    <span className="sr-only">{nameStep === 'first' ? 'First name' : 'Last name'}</span>
                    <input
                      key={nameStep}
                      autoFocus
                      autoComplete={nameStep === 'first' ? 'given-name' : 'family-name'}
                      value={nameStep === 'first' ? profile.draft.firstName : profile.draft.lastName}
                      onChange={event => profile.setDraft(nameStep === 'first'
                        ? { ...profile.draft, firstName: event.target.value }
                        : { ...profile.draft, lastName: event.target.value })}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        if (nameStep === 'first' && profile.draft.firstName.trim()) setNameStep('last')
                        if (nameStep === 'last' && profile.draft.lastName.trim()) void finishProfile()
                      }}
                      placeholder={nameStep === 'first' ? 'First name' : 'Last name'}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-semibold text-gray-950 shadow-sm outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:border-white/25"
                    />
                  </label>

                  <div className="relative mt-4">
                    {nameStep === 'last' && (
                      <button
                        type="button"
                        aria-label="Back to first name"
                        onClick={() => setNameStep('first')}
                        className="absolute left-1.5 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15 dark:bg-black/[0.06] dark:text-gray-950 dark:hover:bg-black/10"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => nameStep === 'first' ? setNameStep('last') : void finishProfile()}
                      disabled={nameStep === 'first' ? !profile.draft.firstName.trim() : !profile.draft.lastName.trim()}
                      className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                    >
                      <span>{nameStep === 'first' ? 'Next' : 'Open my Pocket'}</span>
                      <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  </div>

                  {profile.error && <p className="mt-3 text-center text-xs font-semibold text-red-600 dark:text-red-300">{profile.error}</p>}
                  <p className="mt-4 truncate text-center text-[11px] font-medium text-gray-400">Signed in as {email}</p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center py-9 text-center sm:py-12">
            <CPurseIcon size={190} title="Pocket" className="h-[164px] w-[164px] text-gray-950 dark:text-white sm:h-[190px] sm:w-[190px]" />

            <p className="mt-9 text-[11px] font-black uppercase tracking-[0.28em] text-gray-500 dark:text-white/40">Your money, ready to move</p>
            <h1 className="mt-3 max-w-md text-4xl font-black leading-[0.98] tracking-[-0.055em] sm:text-5xl">
              One pocket for digital dollars.
            </h1>
            <p className="mt-5 max-w-sm text-sm font-medium leading-6 text-gray-500 dark:text-white/55">
              Receive, manage, and move USDC across the ways you get paid.
            </p>
          </section>
        )}

        {!onboarding && !checkingProfile && !profileLoadFailed && !opening && <section className="space-y-2.5">
          {authenticated ? (
            <button
              type="button"
              onClick={() => setEnterAfterLogin(true)}
              className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
            >
              <img src="/pocket-circle.png" alt="" className="absolute left-5 h-5 w-5 object-contain invert dark:invert-0" />
              <span>Open Pocket</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          ) : (
            <PrivyConnectButton
              debugLabel="pocket-landing-sign-in"
              logoutOnAuthenticated={false}
              onBeforeLogin={() => setEnterAfterLogin(true)}
              className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
            >
              <Mail className="absolute left-5 h-4 w-4" />
              <span>Sign in to Pocket Wallet</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
                <ArrowRight className="h-4 w-4" />
              </span>
            </PrivyConnectButton>
          )}

          <p className="text-center text-[11px] font-medium text-gray-500 dark:text-white/40">Secure access with email or your connected wallet.</p>
          <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-gray-400 dark:text-white/30">
            <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            Wallet access powered by Circle
          </p>

          <footer className="pt-4 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-500 dark:text-white/40">
              <Link to="/docs/terms" className="transition hover:text-gray-950 dark:hover:text-white/75">Terms</Link>
              <Link to="/docs/privacy" className="transition hover:text-gray-950 dark:hover:text-white/75">Privacy</Link>
              <a href="mailto:support@hashpaylink.com" className="transition hover:text-gray-950 dark:hover:text-white/75">Support</a>
            </div>
            <p className="mt-2 text-[10px] font-bold tracking-[0.08em] text-gray-400 dark:text-white/25">Pocket by Hash PayLink</p>
          </footer>
        </section>}
      </main>
    </div>
  )
}

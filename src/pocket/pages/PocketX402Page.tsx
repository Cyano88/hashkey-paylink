import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketMarketplacePanel from '../components/PocketMarketplacePanel'
import PocketSelect from '../components/PocketSelect'
import usePocketX402Controller from '../controllers/usePocketX402Controller'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { buildPocketX402FundUrl } from '../lib/pocketX402FundUrl'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

function balanceText(value: string | undefined, checked: boolean, error?: string) {
  if (value !== undefined) return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
  return error || checked ? 'Unavailable' : 'Checking...'
}

export default function PocketX402Page() {
  const navigate = useNavigate()
  const { ready: identityReady, authenticated, email, getAccessToken } = usePocketIdentity()
  const x402 = usePocketX402Controller({ authenticated, email, getAccessToken })
  const [marketplaceRefreshToken, setMarketplaceRefreshToken] = useState(0)
  const sessionChecking = !identityReady || (authenticated && !x402.snapshotReady)
  const connected = Boolean(x402.snapshot?.connected && x402.snapshot.walletAddress)
  const walletBalance = Number(x402.snapshot?.walletBalance ?? '0')
  const treasuryEmpty = x402.snapshot?.walletBalanceChecked && (!Number.isFinite(walletBalance) || walletBalance <= 0)
  const fundUrl = useMemo(() => {
    if (!x402.snapshot?.walletAddress) return ''
    return buildPocketX402FundUrl({
      origin: window.location.origin,
      network: x402.network,
      walletAddress: x402.snapshot.walletAddress,
    })
  }, [x402.network, x402.snapshot?.walletAddress])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'move'
      ? pocketPathFor({ section: 'move', view: 'usdc' })
      : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'home', view: 'smart-wallet' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const refreshAppPay = async () => {
    if (!authenticated) return
    await x402.refresh()
    setMarketplaceRefreshToken(value => value + 1)
  }

  return (
    <PocketRouteShell active="home" onSelect={selectNav} onRefresh={authenticated ? refreshAppPay : undefined} refreshing={x402.refreshing}>
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-violet-50/70 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-violet-500/[0.08]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Available for app payments</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                {x402.snapshot?.gatewayBalance !== undefined
                  ? Number(x402.snapshot.gatewayBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })
                  : sessionChecking ? '—' : '0.00'} <span className="text-sm font-bold text-gray-400">USDC</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                <span className={cn(
                  'rounded-full border px-2 py-1',
                  connected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
                    : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400',
                )}>
                  {sessionChecking ? 'Restoring session' : connected ? 'Wallet linked' : 'Setup needed'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <details className="group rounded-xl border border-gray-100 bg-white/70 px-3 py-2 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200">
            Payment network
          </summary>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-white/[0.07]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Circle Gateway</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Choose where apps are paid</p>
            </div>
            <PocketSelect
              value={x402.network}
              options={[{ value: 'base', label: 'Base' }, { value: 'arc', label: 'Arc Testnet' }]}
              onChange={value => x402.selectNetwork(value === 'arc' ? 'arc' : 'base')}
              disabled={x402.walletStep === 'otp'}
              ariaLabel="App Pay network"
              className="w-[132px]"
              buttonClassName="min-h-8 rounded-lg py-1 text-xs"
            />
          </div>
        </details>

        {sessionChecking ? (
          <div className="flex min-h-28 items-center justify-center gap-2 rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 text-xs font-semibold text-gray-400 dark:border-white/10 dark:bg-[#151518]/95">
            <Loader2 className="h-4 w-4 animate-spin" /> Restoring App Pay
          </div>
        ) : !authenticated ? (
          <div className="w-full space-y-2 rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95">
            <PrivyConnectButton
              debugLabel="x402-wallet-email"
              loginOptions={{ loginMethods: ['email', 'wallet'] }}
              logoutOnAuthenticated={false}
              className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] dark:bg-white dark:text-gray-950"
            >
              <Mail className="absolute left-5 h-4 w-4" />
              <span>Sign in to Pocket</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10">
                <ArrowRight className="h-4 w-4" />
              </span>
            </PrivyConnectButton>
            <p className="px-3 pb-1 text-center text-[11px] font-medium text-gray-400">Secure access with email or the wallet controlling this session.</p>
          </div>
        ) : !connected ? (
          <div className="w-full space-y-2 rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95">
            <div className="px-1 pb-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Set up App Pay</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {x402.snapshot?.found ? 'Verify access to your secure payment wallet.' : 'Use a secure wallet to fund pay-per-use apps and AI tools.'}
              </p>
            </div>

            {x402.walletStep === 'otp' ? (
              <div className="space-y-2">
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                  Code sent to {email || 'your email'} - {x402.network === 'arc' ? 'Arc Testnet' : 'Base'} Circle wallet
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                  <input value={x402.otp} onChange={event => x402.setOtp(event.target.value.trim())} placeholder="Enter Circle OTP" disabled={x402.walletBusy} className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none dark:text-white" />
                </div>
                <button type="button" onClick={() => void x402.completeConnection()} disabled={x402.walletBusy || !x402.otp.trim()} className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950">
                  {x402.walletBusy ? <Loader2 className="absolute left-5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="absolute left-5 h-4 w-4" />} Verify latest code
                  <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10"><ArrowRight className="h-4 w-4" /></span>
                </button>
                <button type="button" onClick={() => void x402.resendOtp()} disabled={x402.walletBusy} className="w-full py-1 text-xs font-semibold text-gray-500 transition hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-white">Resend code</button>
                <p className="text-xs text-gray-500 dark:text-gray-400">Use the newest email code. Resending replaces the previous code.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-200"><Wallet className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{x402.walletMode === 'create' ? 'Pocket wallet setup' : 'Existing wallet verification'}</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-gray-800 dark:text-gray-100">{email || 'Email session active'}</p>
                  </div>
                </div>
                {x402.walletChoices.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/70 p-2 dark:border-amber-400/20 dark:bg-amber-400/10">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">Choose wallet</p>
                    {x402.walletChoices.map(choice => (
                      <button key={choice.address} type="button" onClick={() => x402.setExpectedWallet(choice.address)} className={cn('w-full rounded-lg border px-2.5 py-2 text-left', x402.expectedWallet.toLowerCase() === choice.address.toLowerCase() ? 'border-gray-900 bg-white dark:border-white dark:bg-white/[0.12]' : 'border-amber-100 bg-white/80 dark:border-amber-400/20 dark:bg-black/10')}>
                        <span className="block truncate font-mono text-xs">{choice.address}</span>
                        <span className="mt-0.5 block text-[11px] text-gray-500">{choice.balance !== undefined ? `${Number(choice.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC` : choice.balanceError || 'Balance unavailable'}</span>
                      </button>
                    ))}
                    <p className="px-1 text-[11px] text-amber-700/80 dark:text-amber-200/80">After choosing, resend OTP and verify again so Circle confirms this exact wallet.</p>
                  </div>
                )}
                <button type="button" onClick={() => void x402.beginConnection()} disabled={x402.walletBusy} className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950">
                  {x402.walletBusy ? <><Loader2 className="absolute left-5 h-4 w-4 animate-spin" /> Verifying wallet</> : <><Wallet className="absolute left-5 h-4 w-4" /><span>{x402.walletMode === 'create' ? 'Create App Pay wallet' : 'Reconnect App Pay'}</span><span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 dark:bg-black/10"><ArrowRight className="h-4 w-4" /></span></>}
                </button>
                <p className="text-center text-[11px] font-medium text-gray-400">Circle will email a one-time code.</p>
                {!x402.snapshot?.found && <button type="button" onClick={() => x402.chooseMode(x402.walletMode === 'create' ? 'login' : 'create')} className="w-full text-xs font-semibold text-gray-500">{x402.walletMode === 'create' ? 'Use an existing Circle wallet instead' : 'Use a new Pocket wallet instead'}</button>}
              </div>
            )}
            {x402.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/20 dark:text-red-300">{x402.error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pocket wallet</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={x402.snapshot?.walletBalanceError}>{balanceText(x402.snapshot?.walletBalance, x402.snapshot?.walletBalanceChecked ?? false, x402.snapshot?.walletBalanceError)}</p>
                </div>
                <a href={fundUrl} className="inline-flex h-9 w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"><ArrowRight className="h-3.5 w-3.5" /> Fund</a>
              </div>
              <div className="border-t border-gray-100 px-3 py-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Available for app payments</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={x402.snapshot?.gatewayBalanceError}>{balanceText(x402.snapshot?.gatewayBalance, x402.snapshot?.gatewayBalanceChecked ?? false, x402.snapshot?.gatewayBalanceError)}</p>
                  </div>
                  <button type="button" onClick={() => { x402.setActivationOpen(!x402.activationOpen); }} disabled={x402.activationBusy || x402.activationPending || treasuryEmpty} className="inline-flex h-9 w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                    {x402.activationPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating</> : <><ArrowRight className="h-3.5 w-3.5" /> Add funds</>}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{x402.activationPending ? 'Updating App Pay balance...' : treasuryEmpty ? 'Add USDC to your Pocket wallet first.' : 'Set aside USDC for apps, AI tools, and pay-per-use services.'}</p>
              </div>
              {(x402.activationOpen || x402.activationSuccess) && (
                <div className="border-t border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-black/10">
                  {x402.activationSuccess ? (
                    <div className="py-2 text-center">
                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-5 w-5" /></div>
                      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{x402.activationPending ? 'Adding App Pay funds' : 'App Pay funded'}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{x402.activationSuccess}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Add App Pay funds</p>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Set aside USDC from your Pocket wallet for pay-per-use services.</p>
                      <label className="mb-1.5 mt-3 block text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</label>
                      <div className="flex h-10 max-w-[150px] overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.06]">
                        <input value={x402.amount} onChange={event => x402.setAmount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-gray-900 outline-none dark:text-white" />
                        <span className="border-l border-gray-200 px-2.5 py-3 text-[11px] font-semibold text-gray-400 dark:border-white/10">USDC</span>
                      </div>
                      {(x402.activationError || x402.error) && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{x402.activationError || x402.error}</p>}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => x402.setActivationOpen(false)} disabled={x402.activationBusy} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">Cancel</button>
                        <button type="button" onClick={() => void x402.activate()} disabled={x402.activationBusy || Boolean(x402.activationError)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{x402.activationBusy ? <><span>Adding funds</span><Loader2 className="h-4 w-4 animate-spin" /></> : <><ArrowRight className="h-4 w-4" /> Add funds</>}</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {x402.error && !x402.activationOpen && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/20 dark:text-red-300">{x402.error}</p>}
            <PocketMarketplacePanel
              connected={connected}
              network={x402.network}
              gatewayBalance={x402.snapshot?.gatewayBalance}
              getAccessToken={getAccessToken}
              onUseBase={() => x402.selectNetwork('base')}
              refreshToken={marketplaceRefreshToken}
            />
          </div>
        )}
      </div>
    </PocketRouteShell>
  )
}

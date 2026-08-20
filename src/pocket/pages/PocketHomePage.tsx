import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, ChevronRight, Eye, EyeOff, Send, Store, Users, Wallet } from '../components/PocketIcons'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import usePocketProfile from '../hooks/usePocketProfile'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import { cn } from '../../lib/utils'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'

type HomeNetwork = 'base' | 'arbitrum' | 'solana'
const NETWORK_KEY = 'pocket.home.network'
const BALANCE_VISIBLE_KEY = 'pocket.balanceVisible'
const NETWORKS = [
  { key: 'base', label: 'Base', logo: '/brand/base-logo.jpeg', dark: false },
  { key: 'arbitrum', label: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg', dark: false },
  { key: 'solana', label: 'Solana', logo: '/brand/solana-logo.jpeg', dark: true },
  { key: 'arc', label: 'Arc', logo: '/brand/arc-logo.jpeg', dark: true, soon: true },
] as const

function initialNetwork(): HomeNetwork {
  const saved = window.localStorage.getItem(NETWORK_KEY)
  return saved === 'arbitrum' || saved === 'solana' ? saved : 'base'
}

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' })
  if (tab === 'activity') return pocketPathFor({ section: 'activity', view: 'all' })
  return POCKET_ROUTES.home
}

export default function PocketHomePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: true, recent: true, getAccessToken })
  const showNgn = profile.profile?.displayCurrency === 'NGN'
  const fx = usePocketFxQuote(1, showNgn)
  const [selected, setSelectedState] = useState<HomeNetwork>(initialNetwork)
  const [balanceVisible, setBalanceVisible] = useState(() => window.localStorage.getItem(BALANCE_VISIBLE_KEY) !== 'false')
  // Keep the compact Home preview above the fixed native navigation. Four rows
  // intersect the nav's compositor layer on current Android WebView builds and
  // can leave the lower viewport unrasterized; the full list remains in Activity.
  const recent = activity.rows.slice(0, 3)
  const balancesReady = !authenticated || wallets.resolved
  const balancesVisible = balancesReady && (!wallets.error || wallets.rows.length > 0)
  const activityReady = !authenticated || activity.resolved

  const open = (path: string) => navigate(POCKET_BASE_PATH + path)
  const selectedBalance = wallets.rows.find(row => row.key === selected)?.balance ?? 0
  const setSelected = (network: HomeNetwork) => { window.localStorage.setItem(NETWORK_KEY, network); setSelectedState(network) }
  const toggleBalance = () => setBalanceVisible(current => { window.localStorage.setItem(BALANCE_VISIBLE_KEY, String(!current)); return !current })
  const hidden = '....'

  return <PocketRouteShell active="home" onSelect={tab => open(navPath(tab))}>
    <section className="overflow-hidden rounded-[26px] bg-gray-950 px-5 py-4 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Total available</p>
            <button type="button" onClick={toggleBalance} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/65 hover:bg-white/10 dark:text-gray-500 dark:hover:bg-gray-950/[0.06]" aria-label={balanceVisible ? 'Hide balances' : 'Show balances'}>
              {balanceVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1.5">
            {balancesVisible ? <p className="min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">{balanceVisible ? formatPocketDisplayAmount(wallets.total) : hidden} <span className="text-xs font-medium tracking-normal opacity-50">USDC</span></p> : <span aria-label="Loading balances" className="block h-10 w-44 animate-pulse rounded-xl bg-white/15 dark:bg-gray-950/10" />}
          </div>
          {showNgn && (fx.quote ? <p className="mt-1 text-xs font-semibold tabular-nums text-white/55 dark:text-gray-500">{balanceVisible ? '~ NGN ' + Math.round(wallets.total * fx.quote.rate).toLocaleString('en-NG') : 'NGN ' + hidden}</p> : fx.busy ? <span aria-label="Loading Naira equivalent" className="mt-2 block h-3 w-24 animate-pulse rounded bg-white/10 dark:bg-gray-950/[0.08]" /> : null)}
          {balancesReady && (!wallets.totalComplete || wallets.error) && <p className="mt-1 text-[10px] font-medium text-white/45 dark:text-gray-500">Some network balances are updating.</p>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => open(POCKET_ROUTES.send)} className="flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white dark:text-gray-500 dark:hover:bg-gray-950/[0.06] dark:hover:text-gray-950"><Send className="h-5 w-5" /><span className="text-[9px] font-black uppercase tracking-wide">Send</span></button>
          <button type="button" onClick={() => open(POCKET_ROUTES.swap)} className="flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white dark:text-gray-500 dark:hover:bg-gray-950/[0.06] dark:hover:text-gray-950"><ArrowLeftRight className="h-5 w-5" /><span className="text-[9px] font-black uppercase tracking-wide">Swap</span></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {NETWORKS.map(network => <button key={network.key} type="button" disabled={network.soon} onClick={() => !network.soon && setSelected(network.key)} className={cn('relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl transition', network.soon ? 'cursor-default opacity-35' : selected === network.key ? 'bg-white/12 dark:bg-gray-950/[0.08]' : 'opacity-55 hover:opacity-90')} aria-label={network.soon ? network.label + ', coming soon' : 'Show ' + network.label + ' balance'} aria-pressed={!network.soon && selected === network.key}>
          <img src={network.logo} alt="" className={cn('h-6 w-6 rounded-md object-cover grayscale contrast-200', network.dark ? 'invert dark:invert-0' : 'dark:invert')} />
          {network.soon && <span className="text-[8px] font-black uppercase tracking-wider">Soon</span>}
        </button>)}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3 text-center dark:border-gray-950/10">
        {balancesVisible ? <p className="text-lg font-semibold tabular-nums tracking-tight">{balanceVisible ? formatPocketDisplayAmount(selectedBalance) : hidden} <span className="text-[10px] font-medium tracking-normal opacity-50">USDC</span></p> : <span className="mx-auto block h-6 w-28 animate-pulse rounded-lg bg-white/10 dark:bg-gray-950/[0.08]" />}
      </div>
    </section>

    <section className="grid grid-cols-4 gap-2">
      {[
        { label: 'Bank', icon: Banknote, path: POCKET_ROUTES.bank + '?mode=withdraw' },
        { label: 'POS', icon: Store, path: POCKET_ROUTES.pos },
        { label: 'Request', icon: Users, path: POCKET_ROUTES.usdc },
        { label: 'Deposit', icon: Wallet, path: POCKET_ROUTES.deposit },
      ].map(item => <button key={item.label} type="button" onClick={() => open(item.path)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-1 text-[10px] font-bold text-gray-700 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035] dark:text-gray-200"><item.icon className="h-5 w-5" />{item.label}</button>)}
    </section>

    <section className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="flex items-center justify-between"><div><p className="text-sm font-black text-gray-950 dark:text-white">Recent activity</p><p className="mt-0.5 text-[11px] text-gray-400">Your latest money movement</p></div><button type="button" onClick={() => open(POCKET_ROUTES.activity)} className="flex items-center gap-1 text-[11px] font-bold text-gray-500">View all<ChevronRight className="h-3.5 w-3.5" /></button></div>
      <div className="mt-4 space-y-1">{!activityReady ? <PocketRecentActivitySkeleton /> : recent.length ? recent.map(row => <button key={row.eventId + ':' + row.txHash} type="button" onClick={() => open(POCKET_ROUTES.activity)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.07]">{row.direction === 'in' || ['refunded', 'reversed'].includes(String(row.paycrestStatus ?? '').toLowerCase()) || row.refundTxHash ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{row.activityLabel || row.memo || 'Payment'}</span><span className="mt-0.5 block text-[10px] text-gray-400">{new Date(row.ts).toLocaleDateString()}</span></span><span className="text-xs font-black tabular-nums text-gray-900 dark:text-white">{row.direction === 'in' || ['refunded', 'reversed'].includes(String(row.paycrestStatus ?? '').toLowerCase()) || row.refundTxHash ? '+' : '-'}{row.amount} USDC</span></button>) : <p className="py-8 text-center text-xs font-medium text-gray-400">{activity.error || 'Your completed payments will appear here.'}</p>}</div>
    </section>
  </PocketRouteShell>
}

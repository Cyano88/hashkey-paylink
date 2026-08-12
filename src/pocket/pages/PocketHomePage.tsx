import { useNavigate } from 'react-router-dom'
import { Banknote, ChevronRight, Store, TrendingUp, Users, Wallet } from '../components/PocketIcons'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import { POCKET_BASE_PATH, pocketPathFor } from '../lib/pocketRoutes'

function navPath(tab: PocketNavTab) {
  if (tab === 'home') return pocketPathFor({ section: 'home', view: 'overview' })
  if (tab === 'move') return pocketPathFor({ section: 'move', view: 'usdc' })
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' })
  return pocketPathFor({ section: 'activity', view: 'all' })
}

export default function PocketHomePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })
  const fx = usePocketFxQuote(1)
  const recent = activity.rows.slice(0, 3)
  const unresolved = authenticated && (!wallets.resolved || !activity.resolved || (!fx.quote && fx.busy))

  if (unresolved) return <PocketLoadingState active="home" />

  const open = (path: string) => navigate(POCKET_BASE_PATH + path)
  return <PocketRouteShell active="home" onSelect={tab => open(navPath(tab))}>
    <section className="overflow-hidden rounded-[28px] bg-gray-950 p-6 text-white shadow-[0_22px_60px_rgba(15,23,42,0.16)] dark:bg-white dark:text-gray-950">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Total available</p>
      <p className="mt-3 text-4xl font-black tabular-nums tracking-[-0.045em]">{formatPocketDisplayAmount(wallets.total)} <span className="text-sm tracking-normal opacity-50">USDC</span></p>
      {fx.quote && <p className="mt-1 text-xs font-semibold tabular-nums text-white/55 dark:text-gray-500">~ NGN {Math.round(wallets.total * fx.quote.rate).toLocaleString('en-NG')}</p>}
      <button type="button" onClick={() => open(navPath('move'))} className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-gray-950 dark:bg-gray-950 dark:text-white"><Wallet className="h-4 w-4" />Move money</button>
    </section>

    <section className="grid grid-cols-3 gap-2">
      {[
        { label: 'Bank payout', icon: Banknote, path: pocketPathFor({ section: 'move', view: 'bank' }) },
        { label: 'POS', icon: Store, path: pocketPathFor({ section: 'move', view: 'pos' }) },
        { label: 'Request', icon: Users, path: pocketPathFor({ section: 'move', view: 'usdc' }) },
      ].map(item => <button key={item.label} type="button" onClick={() => open(item.path)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 text-[11px] font-bold text-gray-700 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035] dark:text-gray-200"><item.icon className="h-5 w-5" />{item.label}</button>)}
    </section>

    <section className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="flex items-center justify-between"><div><p className="text-sm font-black text-gray-950 dark:text-white">Recent activity</p><p className="mt-0.5 text-[11px] text-gray-400">Your latest money movement</p></div><button type="button" onClick={() => open(navPath('activity'))} className="flex items-center gap-1 text-[11px] font-bold text-gray-500">View all<ChevronRight className="h-3.5 w-3.5" /></button></div>
      <div className="mt-4 space-y-1">
        {recent.length ? recent.map(row => <button key={row.eventId + ':' + row.txHash} type="button" onClick={() => open(navPath('activity'))} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.07]"><TrendingUp className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{row.activityLabel || row.memo || 'Payment'}</span><span className="mt-0.5 block text-[10px] text-gray-400">{new Date(row.ts).toLocaleDateString()}</span></span><span className="text-xs font-black tabular-nums text-gray-900 dark:text-white">{row.direction === 'out' ? '-' : '+'}{row.amount} USDC</span></button>) : <p className="py-8 text-center text-xs font-medium text-gray-400">Your completed payments will appear here.</p>}
      </div>
    </section>
  </PocketRouteShell>
}

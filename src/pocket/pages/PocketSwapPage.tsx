import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketSelect from '../components/PocketSelect'
import PocketSlideAction from '../components/PocketSlideAction'
import { Loader2 } from '../components/PocketIcons'
import type { PocketNavTab } from '../components/PocketBottomNav'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import usePocketBridgeController from '../controllers/usePocketBridgeController'
import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' })
  if (tab === 'activity') return POCKET_ROUTES.activity
  return POCKET_ROUTES.home
}
const label = (network: PocketBridgeNetwork) => network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'

export default function PocketSwapPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: false, getAccessToken })
  const [source, setSource] = useState<PocketBridgeNetwork>(() => {
    const saved = window.localStorage.getItem('pocket.home.network')
    return saved === 'arbitrum' || saved === 'solana' ? saved : 'base'
  })
  const onWalletReady = useCallback((network: PocketBridgeNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [network]: wallet })), [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const sourceBalance = wallets.rows.find(row => row.key === source)?.balance ?? 0
  const swap = usePocketBridgeController({ source, sourceBalance, wallets: wallets.wallets, ensureWallet: walletController.ensureWallet, getEvmSession: (network, address) => walletController.getEvmSession(network, address), getSolanaSession: walletController.getSolanaSession, getAccessToken, refresh: wallets.refreshBalances, onActivity: () => void activity.refresh() })
  const setSourceNetwork = (value: PocketBridgeNetwork) => { window.localStorage.setItem('pocket.home.network', value); setSource(value) }
  if (authenticated && !wallets.resolved) return <PocketLoadingState active="home" />
  return <PocketRouteShell active="home" onSelect={tab => navigate(POCKET_BASE_PATH + navPath(tab))}>
    <PocketFlowHeader title="Swap USDC" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    <section className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">From</p><PocketSelect value={source} options={(['base','arbitrum','solana'] as PocketBridgeNetwork[]).map(value => ({ value, label: label(value) }))} onChange={value => setSourceNetwork(value as PocketBridgeNetwork)} ariaLabel="Select source network" /></div>
        <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">To</p><PocketSelect value={swap.destination} options={swap.destinations.map(value => ({ value, label: label(value) }))} onChange={value => swap.setDestination(value as PocketBridgeNetwork)} ariaLabel="Select destination network" /></div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span className="text-xs font-semibold text-gray-500">Available</span><span className="text-sm font-black tabular-nums">{formatPocketDisplayAmount(sourceBalance)} USDC</span></div>
      <label className="block"><span className="text-[11px] font-bold text-gray-500">Amount</span><span className="mt-2 flex gap-2"><input type="text" inputMode="decimal" value={swap.amount} onChange={event => swap.setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-bold outline-none dark:border-white/10 dark:bg-white/[0.04]" /><button type="button" onClick={() => swap.setAmount(Math.max(0, sourceBalance - Number(swap.quote?.fee || 0.25)).toFixed(6).replace(/\.?0+$/, ''))} className="rounded-2xl border border-gray-200 px-4 text-xs font-black dark:border-white/10">Max</button></span></label>
      {swap.status === 'quoting' ? <p className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Getting live quote</p> : swap.quote ? <div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-xs dark:bg-white/[0.04]"><div className="flex justify-between"><span className="text-gray-500">You receive</span><b>{formatPocketDisplayAmount(swap.quote.receive)} USDC</b></div><div className="flex justify-between"><span className="text-gray-500">Network fee</span><b>{formatPocketDisplayAmount(swap.quote.fee)} USDC</b></div></div> : null}
      <PocketSlideAction status={swap.status === 'successful' ? 'successful' : swap.status === 'bridging' ? 'submitted' : swap.status === 'confirming' || swap.status === 'quoting' ? 'pending' : 'idle'} disabled={!swap.quote || Number(swap.quote.total) > sourceBalance || swap.status === 'quoting'} onConfirm={() => void swap.bridge()} labels={{ disabled: 'Enter swap amount', idle: 'Confirm swap', pending: swap.status === 'quoting' ? 'Refreshing live quote' : 'Confirm swap in Circle', submitted: 'Swap processing', successful: 'Swapped' }} />
      <p className="text-center text-[10px] leading-4 text-gray-400">Native USDC moves through Circle CCTP. Source-network gas may apply.</p>
      {swap.notice && <p className="text-center text-xs font-semibold text-emerald-600">{swap.notice}</p>}
      {swap.error && <p className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{swap.error}</p>}
    </section>
  </PocketRouteShell>
}

import PocketFlowHeader from '../components/PocketFlowHeader'
import { Phone, Wifi, Tv, Lightbulb, ChevronRight } from '../components/PocketIcons'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import { PocketBillsSkeleton } from '../components/PocketContentSkeletons'
import usePocketBillsController from '../controllers/usePocketBillsController'
import usePocketPaymentLiquidityController from '../controllers/usePocketPaymentLiquidityController'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketBillsPanel from '../features/bills/PocketBillsPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import { POCKET_BASE_PATH, pocketPathFor, type PocketBillView } from '../lib/pocketRoutes'

const BILL_ACTIONS = [
  { view: 'airtime', label: 'Airtime', Icon: Phone },
  { view: 'data', label: 'Data', Icon: Wifi },
  { view: 'tv', label: 'TV', Icon: Tv },
  { view: 'electricity', label: 'Electricity', Icon: Lightbulb },
] as const

export default function PocketBillsPage({ view }: { view: PocketBillView | 'overview' }) {
  const navigate = useNavigate()
  if (view !== 'overview') return <PocketBillFlow key={view} view={view} />
  const selectNav = (tab: PocketNavTab) => navigate(POCKET_BASE_PATH + pocketPathFor(tab === 'bills' ? { section: 'bills', view: 'overview' } : tab === 'profile' ? { section: 'profile', view: 'details' } : tab === 'activity' ? { section: 'activity', view: 'all' } : { section: 'home', view: 'overview' }))
  return <PocketRouteShell active="bills" onSelect={selectNav}>
    <h1 className="py-3 text-center text-base font-black tracking-tight text-gray-950 dark:text-white">Bills</h1>
    <section aria-label="Bill services" className="divide-y divide-gray-100 dark:divide-[#262626]">
      {BILL_ACTIONS.map(({ view, label, Icon }) => <button key={view} type="button" onClick={() => navigate(POCKET_BASE_PATH + pocketPathFor({ section: 'bills', view }))} className="flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#171717] dark:text-gray-200"><Icon className="h-5 w-5" /></span>
        <span className="flex-1 text-sm font-bold text-gray-950 dark:text-white">{label}</span>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </button>)}
    </section>
  </PocketRouteShell>
}

function PocketBillFlow({ view }: { view: PocketBillView }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const localPreview = import.meta.env.DEV
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && new URLSearchParams(location.search).get('preview') === '1'
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletOpenError, setWalletOpenError] = useState('')
  const onWalletReady = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana' | 'ethereum' | 'polygon', wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
    wallets.setWallets(current => ({ ...current, [network]: wallet }))
  }, [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const ensureBaseWallet = useCallback(async () => walletController.ensureWallet('base'), [walletController])
  const bills = usePocketBillsController({
    view,
    authenticated,
    baseWallet: wallets.wallets.base,
    getAccessToken,
    ensureBaseWallet,
    getEvmSession: address => walletController.getEvmSession('base', address),
    refreshBalances: wallets.refreshBalances,
  })
  const paymentLiquidity = usePocketPaymentLiquidityController({
    enabled: authenticated && bills.status === 'ready',
    amount: bills.intent?.amountUsdc ?? '',
    destination: 'base',
    getAccessToken,
    ensureWallet: walletController.ensureWallet,
    getEvmSession: (network, address) => walletController.getEvmSession(network, address),
    getSolanaSession: walletController.getSolanaSession,
    refreshBalances: wallets.refreshBalances,
  })
  const routedBills = {
    ...bills,
    processing: bills.processing || paymentLiquidity.busy,
    error: paymentLiquidity.error || bills.error,
    pay: async () => {
      if (!bills.intent || bills.status !== 'ready') return
      try {
        await paymentLiquidity.ensureLiquidity()
        await bills.pay()
      } catch {
        // The liquidity controller keeps the actionable, retry-safe message.
      }
    },
  }

  const openBaseWallet = useCallback(async () => {
    setWalletBusy(true); setWalletOpenError('')
    setWalletOpenError('')
    try {
      await ensureBaseWallet()
      await wallets.refreshBalances()
    } catch (reason) {
      setWalletOpenError(reason instanceof Error ? reason.message : 'Base wallet setup failed.')
    } finally {
      setWalletBusy(false)
    }
  }, [ensureBaseWallet, wallets.refreshBalances, wallets.setError])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
        ? pocketPathFor({ section: 'home', view: 'overview' })
        : tab === 'profile'
        ? pocketPathFor({ section: 'profile', view: 'details' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'bills', view: 'overview' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const flowHeader = <PocketFlowHeader centered title={BILL_ACTIONS.find(action => action.view === view)!.label} onBack={() => navigate(POCKET_BASE_PATH + pocketPathFor({ section: 'bills', view: 'overview' }))} />

  if (authenticated && (!wallets.resolved || (wallets.error && !wallets.wallets.base?.address))) return <PocketRouteShell active="bills" onSelect={selectNav}>{flowHeader}<PocketBillsSkeleton /></PocketRouteShell>

  const baseBalance = wallets.rows.find(row => row.key === 'base')?.balance ?? 0
  return (
    <PocketRouteShell active="bills" onSelect={selectNav}>
      {flowHeader}
      <PocketBillsPanel
        view={view}
        authenticated={authenticated}
        preview={localPreview}
        bills={routedBills}
        baseAddress={localPreview ? '0x6F4bA8c27eDAA611Dfa019a5Bb3E42c92F1A7D10' : wallets.wallets.base?.address ?? ''}
        baseBalance={localPreview ? 125.48 : baseBalance}
        walletBusy={walletBusy}
        onOpenWallet={() => void openBaseWallet()}
        onPreparePayment={async () => {
          await paymentLiquidity.prepareLiquidity()
          await bills.preparePaymentApproval()
        }}
        paymentRouting={{
          status: paymentLiquidity.status,
          notice: paymentLiquidity.notice,
          insufficient: paymentLiquidity.insufficient,
        }}
      />
      {walletOpenError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{walletOpenError}</p>}
    </PocketRouteShell>
  )
}

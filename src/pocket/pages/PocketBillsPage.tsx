import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import usePocketBillsController from '../controllers/usePocketBillsController'
import usePocketPaymentLiquidityController from '../controllers/usePocketPaymentLiquidityController'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketBillsPanel from '../features/bills/PocketBillsPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import { POCKET_BASE_PATH, pocketPathFor, type PocketBillView } from '../lib/pocketRoutes'

export default function PocketBillsPage({ view }: { view: PocketBillView }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const localPreview = import.meta.env.DEV
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && new URLSearchParams(location.search).get('preview') === '1'
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [walletBusy, setWalletBusy] = useState(false)
  const onWalletReady = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana', wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
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
    setWalletBusy(true)
    wallets.setError('')
    try {
      await ensureBaseWallet()
      await wallets.refreshBalances()
    } catch (reason) {
      wallets.setError(reason instanceof Error ? reason.message : 'Base wallet setup failed.')
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
          : pocketPathFor({ section: 'bills', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  if (authenticated && !wallets.resolved) return <PocketLoadingState active="bills" />

  const baseBalance = wallets.rows.find(row => row.key === 'base')?.balance ?? 0
  return (
    <PocketRouteShell active="bills" onSelect={selectNav}>
      <PocketBillsPanel
        view={view}
        authenticated={authenticated}
        preview={localPreview}
        bills={routedBills}
        baseAddress={localPreview ? '0x6F4bA8c27eDAA611Dfa019a5Bb3E42c92F1A7D10' : wallets.wallets.base?.address ?? ''}
        baseBalance={localPreview ? 125.48 : baseBalance}
        walletBusy={walletBusy}
        onOpenWallet={() => void openBaseWallet()}
        paymentRouting={{
          status: paymentLiquidity.status,
          notice: paymentLiquidity.notice,
          insufficient: paymentLiquidity.insufficient,
        }}
      />
      {wallets.error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{wallets.error}</p>}
    </PocketRouteShell>
  )
}

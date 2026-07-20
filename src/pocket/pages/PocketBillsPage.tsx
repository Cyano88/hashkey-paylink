import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketBillsController from '../controllers/usePocketBillsController'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketBillsPanel from '../features/bills/PocketBillsPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import { pocketPathFor, type PocketBillView } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

export default function PocketBillsPage({ view }: { view: PocketBillView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
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
      ? pocketPathFor({ section: 'home', view: 'smart-wallet' })
      : tab === 'move'
        ? pocketPathFor({ section: 'move', view: 'usdc' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'bills', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const baseBalance = wallets.rows.find(row => row.key === 'base')?.balance ?? 0
  return (
    <PocketRouteShell active="bills" onSelect={selectNav} onRefresh={async () => { await Promise.all([wallets.refreshBalances(), bills.refresh()]) }} refreshing={wallets.balanceBusy}>
      <PocketBillsPanel
        view={view}
        authenticated={authenticated}
        bills={bills}
        baseAddress={wallets.wallets.base?.address ?? ''}
        baseBalance={baseBalance}
        walletBusy={walletBusy}
        onOpenWallet={() => void openBaseWallet()}
      />
      {wallets.error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{wallets.error}</p>}
    </PocketRouteShell>
  )
}

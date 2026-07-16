import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHAIN_META } from '../../lib/chains'
import { copyToClipboard } from '../../lib/utils'
import { LocalCurrencyProfileCard } from '../components/LocalCurrencyProfileCard'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketWalletController from '../controllers/usePocketWalletController'
import usePocketWithdrawalController from '../controllers/usePocketWithdrawalController'
import PocketHomeControls, { PocketHomeSignInCard, type PocketHomeTab } from '../features/home/PocketHomeControls'
import PocketHomeOverview, { POCKET_HOME_NETWORKS, type PocketHomeNetworkKey } from '../features/home/PocketHomeOverview'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import usePocketWallets from '../hooks/usePocketWallets'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

function errorMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error && reason.message) return reason.message
  if (typeof reason === 'string' && reason) return reason
  return fallback
}

export default function PocketHomePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [tab, setTab] = useState<PocketHomeTab>('balance')
  const [network, setNetwork] = useState<PocketHomeNetworkKey>('base')
  const [walletBusy, setWalletBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sessionActivity, setSessionActivity] = useState<string[]>([])

  const recordActivity = useCallback((message: string) => {
    setSessionActivity(current => [message, ...current].slice(0, 5))
  }, [])
  const onWalletReady = useCallback((readyNetwork: PocketHomeNetworkKey, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
    wallets.setWallets(current => ({ ...current, [readyNetwork]: wallet }))
  }, [wallets.setWallets])
  const walletController = usePocketWalletController({
    authenticated,
    email,
    getAccessToken,
    onWalletReady,
  })

  const selectedWallet = wallets.wallets[network]
  const selectedBalance = wallets.rows.find(row => row.key === network)?.balance ?? 0
  const selectedAddress = selectedWallet?.address ?? ''
  const networkLabel = network === 'solana' ? 'Solana' : CHAIN_META[network].label
  const openedWalletCount = useMemo(
    () => Object.values(wallets.wallets).filter(wallet => Boolean(wallet?.address)).length,
    [wallets.wallets],
  )

  const unlockWallet = useCallback(async (selectedNetwork: PocketHomeNetworkKey) => {
    wallets.setError('')
    const wallet = await walletController.ensureWallet(selectedNetwork)
    if (!wallet) throw new Error('Circle wallet setup was cancelled.')
    return wallet
  }, [walletController, wallets.setError])

  const withdrawal = usePocketWithdrawalController({
    network,
    networkLabel,
    wallet: selectedWallet,
    balance: selectedBalance,
    resetKey: `${network}:${tab}`,
    ensureWallet: unlockWallet,
    getAccessToken,
    getEvmSession: walletController.getEvmSession,
    getSolanaSession: walletController.getSolanaSession,
    refreshBalances: wallets.refreshBalances,
    clearExternalError: () => wallets.setError(''),
    onActivity: recordActivity,
  })

  const setupWallet = useCallback(async (selectedNetwork: PocketHomeNetworkKey = network) => {
    setWalletBusy(true)
    wallets.setError('')
    try {
      await unlockWallet(selectedNetwork)
      await wallets.refreshBalances()
      recordActivity(`${selectedNetwork === 'solana' ? 'Solana' : CHAIN_META[selectedNetwork].label} wallet ready`)
    } catch (reason) {
      wallets.setError(errorMessage(reason, 'Circle Pocket setup failed.'))
    } finally {
      setWalletBusy(false)
    }
  }, [network, recordActivity, unlockWallet, wallets.refreshBalances, wallets.setError])

  const copyAddress = useCallback(async () => {
    if (!selectedAddress) return
    await copyToClipboard(selectedAddress)
    setCopied(true)
    recordActivity(`Copied ${networkLabel} funding address`)
    setTimeout(() => setCopied(false), 1800)
  }, [networkLabel, recordActivity, selectedAddress])

  const selectNav = (selectedTab: PocketNavTab) => {
    const path = selectedTab === 'move'
      ? pocketPathFor({ section: 'move', view: 'usdc' })
      : selectedTab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : selectedTab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'home', view: 'smart-wallet' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  return (
    <PocketRouteShell active="home" onSelect={selectNav}>
      <PocketHomeOverview
        globalBalance={wallets.total}
        openedWalletCount={openedWalletCount}
        networks={POCKET_HOME_NETWORKS}
        rows={wallets.rows}
        wallets={wallets.wallets}
        authenticated={authenticated}
        balanceBusy={wallets.balanceBusy}
        walletBusy={walletBusy}
        selectedNetwork={network}
        onRefresh={() => void wallets.refreshBalances()}
        onSelectNetwork={(selectedNetwork, shouldOpen) => {
          setNetwork(selectedNetwork)
          if (shouldOpen) void setupWallet(selectedNetwork)
        }}
      />

      {!authenticated ? (
        <PocketHomeSignInCard />
      ) : (
        <PocketHomeControls
          profileSlot={(
            <LocalCurrencyProfileCard
              profile={profile.profile}
              draft={profile.draft}
              email={email}
              busy={profile.busy}
              error={profile.error}
              editing={profile.editing}
              title="Your Circle Pocket identity"
              body="Your verified email, name, receipts, refunds, and local-currency records stay attached to one Circle Pocket identity."
              savedFallback="Circle Pocket profile"
              saveLabel="Save Circle Pocket profile"
              savedBadgeLabel="Verified"
              identityBadgeLabel="Verified"
              onDraftChange={profile.setDraft}
              onSave={profile.save}
              onEdit={profile.edit}
              onCancel={profile.cancel}
            />
          )}
          tab={tab}
          networks={POCKET_HOME_NETWORKS}
          selectedNetwork={network}
          selectedNetworkLabel={networkLabel}
          selectedAddress={selectedAddress}
          selectedBalance={selectedBalance}
          copied={copied}
          walletBusy={walletBusy}
          withdrawAddress={withdrawal.address}
          withdrawAmount={withdrawal.amount}
          withdrawPending={withdrawal.pending}
          withdrawNotice={withdrawal.notice}
          withdrawTxHash={withdrawal.txHash}
          sessionActivity={sessionActivity}
          error={withdrawal.error || wallets.error}
          onTabChange={setTab}
          onNetworkChange={setNetwork}
          onCopyAddress={() => void copyAddress()}
          onOpenWallet={() => void setupWallet()}
          onWithdrawAddressChange={withdrawal.setAddress}
          onWithdrawAmountChange={withdrawal.setAmount}
          onWithdrawMax={withdrawal.setMax}
          onWithdraw={() => void withdrawal.withdraw()}
        />
      )}
    </PocketRouteShell>
  )
}

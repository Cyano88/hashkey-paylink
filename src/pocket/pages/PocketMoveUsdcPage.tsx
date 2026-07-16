import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import { canUseCircleEvmEmailWallet } from '../../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet } from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META, type ChainKey } from '../../lib/chains'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { useSolana } from '../../lib/SolanaContext'
import { cn, formatAmount } from '../../lib/utils'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketUsdcDraftController from '../controllers/usePocketUsdcDraftController'
import { PocketPayerNetworkPanel } from '../features/move/PocketPayerNetworkPanel'
import {
  PocketFlexibleAmountToggle,
  PocketPaymentAmountField,
  PocketPaymentNoteField,
  PocketPayLinkSubmitPanel,
} from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import { PocketReceiveMethodPanel } from '../features/move/PocketReceiveMethodPanel'
import { PocketRecipientAddressFields } from '../features/move/PocketRecipientAddressFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketRecipient from '../hooks/usePocketRecipient'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'
const POCKET_NETWORKS: ChainKey[] = ['base', 'arc', 'solana', 'arbitrum']
type ReceiveMode = 'paste' | 'email' | 'bank'

export default function PocketMoveUsdcPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, logout, getAccessToken } = usePocketIdentity()
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedSolana, disconnect: disconnectSolana } = useSolana()
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('paste')
  const chainSwitchMounted = useRef(false)
  const draft = usePocketUsdcDraftController(selectedNet)
  const isEvmNetwork = selectedNet !== 'solana'
  const canReceiveWithEmail = !draft.multiChain && PRIVY_AUTH_ENABLED && (
    selectedNet === 'solana'
      ? canUseCircleSolanaEmailWallet()
      : canUseCircleEvmEmailWallet(selectedNet)
  )

  const recipient = usePocketRecipient({
    authenticated,
    email,
    getAccessToken,
    network: selectedNet,
    receiveMode,
    setReceiveMode,
    evmAddress: draft.evmAddress,
    solanaAddress: draft.solanaAddress,
    evmValid: draft.validation.evmValid,
    solanaValid: draft.validation.solanaValid,
    canReceiveWithEmail,
    setEvmAddress: draft.setEvmAddress,
    setSolanaAddress: draft.setSolanaAddress,
    invalidateResult: draft.invalidateResult,
  })

  useEffect(() => {
    if (!POCKET_NETWORKS.includes(selectedNet)) onNetworkSelect('base')
  }, [onNetworkSelect, selectedNet])

  useEffect(() => {
    if (connectedEvm && draft.evmAddress === '' && (isEvmNetwork || draft.multiChain)) {
      draft.setEvmAddress(connectedEvm)
    }
  }, [connectedEvm, draft.evmAddress, draft.multiChain, draft.setEvmAddress, isEvmNetwork])

  useEffect(() => {
    if (connectedSolana && draft.solanaAddress === '' && (selectedNet === 'solana' || draft.multiChain)) {
      draft.setSolanaAddress(connectedSolana)
    }
  }, [connectedSolana, draft.multiChain, draft.setSolanaAddress, draft.solanaAddress, selectedNet])

  useEffect(() => {
    if (selectedNet !== 'solana' && !draft.multiChain && connectedSolana) {
      disconnectSolana()
      draft.setSolanaAddress('')
    }
  }, [connectedSolana, disconnectSolana, draft.multiChain, draft.setSolanaAddress, selectedNet])

  useEffect(() => {
    if (!chainSwitchMounted.current) {
      chainSwitchMounted.current = true
      return
    }
    if (!draft.multiChain) draft.clearAddresses()
  }, [selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMultiChain = useCallback(() => {
    const enabled = !draft.multiChain
    if (enabled) {
      setReceiveMode('paste')
      if (receiveMode === 'email') {
        if (selectedNet === 'solana') draft.setSolanaAddress('')
        else draft.setEvmAddress('')
      }
      if (authenticated) void logout()
    }
    draft.setMultiChain(enabled)
  }, [authenticated, draft, logout, receiveMode, selectedNet])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
      ? pocketPathFor({ section: 'home', view: 'smart-wallet' })
      : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'move', view: 'usdc' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const emailSignInControl = canReceiveWithEmail && !authenticated ? (
    <button
      type="button"
      onClick={recipient.deferEmailSignIn}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
        receiveMode === 'email'
          ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4 text-blue-500" />
        Receive with Circle Pocket
      </span>
      <span className="mt-1 block text-[11px] text-gray-400">Email-backed Circle wallet</span>
    </button>
  ) : undefined

  const amountHelperText = draft.multiChain
    ? 'USDC on Base, Arc Testnet, Solana, or Arbitrum — payer chooses the chain'
    : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`

  return (
    <PocketRouteShell active="move" onSelect={selectNav}>
      <div className="space-y-3.5">
        {!draft.multiChain && (
          <PocketReceiveMethodPanel
            receiveMode={receiveMode}
            canReceiveWithEmail={canReceiveWithEmail}
            selectedNetwork={selectedNet}
            networkLabel={CHAIN_META[selectedNet].label}
            recipientPending={recipient.pending}
            recipientError={recipient.error}
            recipientAddressLabel={recipient.recipientAddressLabel}
            walletBalance={recipient.walletBalance}
            walletReady={recipient.walletReady}
            hideLabel
            emailSignInControl={emailSignInControl}
            onSelectPaste={recipient.selectPaste}
            onSelectEmail={() => void recipient.connect()}
            onDisconnectEmail={() => void recipient.disconnect()}
          />
        )}

        <PocketPayerNetworkPanel
          showSelector
          selectedNetwork={selectedNet}
          selectedNetworkLabel={CHAIN_META[selectedNet].label}
          options={POCKET_NETWORKS.map(network => ({
            value: network,
            label: `${CHAIN_META[network].label}${network === 'arc' ? ' Testnet' : ''}`,
          }))}
          multiChain={draft.multiChain}
          emailReceive={receiveMode === 'email'}
          onNetworkSelect={network => onNetworkSelect(network as ChainKey)}
          onMultiChainToggle={toggleMultiChain}
        />

        <PocketRecipientAddressFields
          showEvm={(isEvmNetwork || draft.multiChain) && (draft.multiChain || receiveMode === 'paste')}
          showSolana={(selectedNet === 'solana' || draft.multiChain) && (draft.multiChain || receiveMode === 'paste')}
          bankSend={false}
          multiChain={draft.multiChain}
          selectedNetwork={selectedNet}
          receiveMode={receiveMode}
          evm={{
            address: draft.evmAddress,
            dirty: draft.validation.evmDirty,
            valid: draft.validation.evmValid,
            connectedAddress: connectedEvm,
            onChange: draft.setEvmAddress,
            onDisconnect: () => {
              disconnectEvm()
              draft.setEvmAddress('')
            },
          }}
          solana={{
            address: draft.solanaAddress,
            dirty: draft.validation.solanaDirty,
            valid: draft.validation.solanaValid,
            connectedAddress: connectedSolana,
            onChange: draft.setSolanaAddress,
            onDisconnect: () => {
              disconnectSolana()
              draft.setSolanaAddress('')
            },
          }}
        />

        <PocketPaymentAmountField
          lane="usdc"
          flexible={draft.flexibleAmount}
          amount={draft.amount}
          dirty={draft.validation.amountDirty}
          valid={draft.validation.amountValid}
          helperText={amountHelperText}
          onAmountChange={draft.setAmount}
        />

        <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} />

        <PocketFlexibleAmountToggle
          lane="usdc"
          enabled={draft.flexibleAmount}
          onToggle={() => draft.setFlexibleAmount(!draft.flexibleAmount)}
        />

        <PocketPayLinkSubmitPanel
          lane="usdc"
          shellActive
          idle={!draft.generatedLink}
          canSubmit={draft.validation.canGenerate}
          submitting={false}
          addressGuidance={draft.validation.addressGuidance}
          onSubmit={draft.generate}
        />

        {receiveMode === 'email' && !authenticated && (
          <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
            <PrivyConnectButton
              debugLabel="create-receive-email"
              loginOptions={{ loginMethods: ['email'] }}
              logoutOnAuthenticated={false}
              onBeforeLogin={recipient.rememberSignInIntent}
              className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]"
            >
              <Mail className="absolute left-5 h-4 w-4" />
              <span>Sign in to Circle Pocket</span>
              <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </PrivyConnectButton>
            <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
              Secure access creates your email-backed Circle wallet and keeps payment receipts connected.
            </p>
          </div>
        )}
      </div>

      {draft.generatedLink && (
        <PocketPayLinkReadyPanel
          url={draft.generatedLink}
          copied={draft.copied}
          flexible={draft.flexibleAmount}
          localCurrency={false}
          amountLabel={formatAmount(draft.amount, 6)}
          networkLabel={draft.multiChain ? 'Base · Arc Testnet · Arbitrum' : CHAIN_META[selectedNet].label}
          evmAddress={draft.validation.evmValid ? draft.evmAddress : undefined}
          solanaAddress={draft.validation.solanaValid ? draft.solanaAddress : undefined}
          memo={draft.memo}
          eventMode={false}
          accessMode={false}
          dashboardUrl={draft.dashboardUrl}
          qrRef={draft.qrRef}
          qrHiResRef={draft.qrHiResRef}
          onReset={draft.reset}
          onDownloadQr={draft.downloadQr}
          onShare={() => void draft.share()}
        />
      )}

      <PayLinkShareSheet
        open={draft.shareOpen}
        url={draft.generatedLink}
        copied={draft.copied}
        shareText={draft.shareText}
        onCopy={draft.copy}
        onClose={draft.closeShare}
      />
    </PocketRouteShell>
  )
}

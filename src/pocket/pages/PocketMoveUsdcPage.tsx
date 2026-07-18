import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, ChevronDown, Mail } from 'lucide-react'
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
import { PocketEmailWalletDetails, PocketReceiveMethodPanel } from '../features/move/PocketReceiveMethodPanel'
import { PocketRecipientAddressFields } from '../features/move/PocketRecipientAddressFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketRecipient from '../hooks/usePocketRecipient'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'
const POCKET_NETWORKS: ChainKey[] = ['base', 'arc', 'solana', 'arbitrum']
type ReceiveMode = 'idle' | 'paste' | 'email' | 'bank'

export default function PocketMoveUsdcPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, logout, getAccessToken } = usePocketIdentity()
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedSolana, disconnect: disconnectSolana } = useSolana()
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('idle')
  const chainSwitchMounted = useRef(false)
  const manualEvmAddress = useRef('')
  const manualSolanaAddress = useRef('')
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
    if (receiveMode !== 'email' && connectedEvm && draft.evmAddress === '' && (isEvmNetwork || draft.multiChain)) {
      manualEvmAddress.current = connectedEvm
      draft.setEvmAddress(connectedEvm)
    }
  }, [connectedEvm, draft.evmAddress, draft.multiChain, draft.setEvmAddress, isEvmNetwork, receiveMode])

  useEffect(() => {
    if (receiveMode !== 'email' && connectedSolana && draft.solanaAddress === '' && (selectedNet === 'solana' || draft.multiChain)) {
      manualSolanaAddress.current = connectedSolana
      draft.setSolanaAddress(connectedSolana)
    }
  }, [connectedSolana, draft.multiChain, draft.setSolanaAddress, draft.solanaAddress, receiveMode, selectedNet])

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
    if (!draft.multiChain) {
      manualEvmAddress.current = ''
      manualSolanaAddress.current = ''
      draft.clearAddresses()
    }
  }, [selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMultiChain = useCallback(() => {
    const enabled = !draft.multiChain
    if (enabled) {
      setReceiveMode('paste')
      if (receiveMode === 'email') {
        draft.setEvmAddress(manualEvmAddress.current)
        draft.setSolanaAddress(manualSolanaAddress.current)
      }
      if (authenticated) void logout()
    }
    draft.setMultiChain(enabled)
  }, [authenticated, draft, logout, receiveMode, selectedNet])

  const collapseReceiveMethod = useCallback(() => {
    setReceiveMode('idle')
    draft.invalidateResult()
  }, [draft.invalidateResult])

  const toggleAddressReceive = useCallback(() => {
    if (receiveMode === 'paste') {
      collapseReceiveMethod()
      return
    }
    draft.setEvmAddress(manualEvmAddress.current)
    draft.setSolanaAddress(manualSolanaAddress.current)
    recipient.selectPaste()
  }, [collapseReceiveMethod, draft.setEvmAddress, draft.setSolanaAddress, receiveMode, recipient.selectPaste])

  const toggleEmailReceive = useCallback(() => {
    if (receiveMode === 'email') {
      collapseReceiveMethod()
      return
    }
    if (selectedNet === 'solana') draft.setSolanaAddress('')
    else draft.setEvmAddress('')
    if (authenticated) void recipient.connect()
    else recipient.deferEmailSignIn()
  }, [authenticated, collapseReceiveMethod, draft.setEvmAddress, draft.setSolanaAddress, receiveMode, recipient.connect, recipient.deferEmailSignIn, selectedNet])

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
      onClick={toggleEmailReceive}
      className={cn(
        'min-h-[54px] rounded-full border px-4 py-2.5 text-left transition-all active:scale-[0.98]',
        receiveMode === 'email'
          ? 'border-gray-950 bg-gray-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-gray-950'
          : 'border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex min-w-0 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="leading-tight">Receive with email</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', receiveMode === 'email' && 'rotate-180')} />
      </span>
      {receiveMode === 'email' && <span className="mt-1 block pl-6 text-[11px] text-white/60 dark:text-gray-500">Sign in to Circle Pocket</span>}
    </button>
  ) : undefined

  const amountHelperText = draft.multiChain
    ? 'USDC on Base, Arc Testnet, Solana, or Arbitrum — payer chooses the chain'
    : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`
  const receiveFlowOpen = draft.multiChain || receiveMode === 'paste' || receiveMode === 'email'

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
            showEmailDetails={false}
            emailSignInControl={emailSignInControl}
            onSelectPaste={toggleAddressReceive}
            onSelectEmail={toggleEmailReceive}
            onDisconnectEmail={() => void recipient.disconnect()}
          />
        )}

        {receiveFlowOpen && (
          <div className="space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Payment request</p>

            {receiveMode === 'email' && (
              <PocketEmailWalletDetails
                selectedNetwork={selectedNet}
                networkLabel={CHAIN_META[selectedNet].label}
                recipientPending={recipient.pending}
                recipientError={recipient.error}
                recipientAddressLabel={recipient.recipientAddressLabel}
                walletBalance={recipient.walletBalance}
                walletReady={recipient.walletReady}
                onDisconnectEmail={() => void recipient.disconnect()}
                embedded
              />
            )}

            {receiveMode === 'email' && !authenticated && (
              <div className="overflow-hidden rounded-[22px] bg-[#F5F5F7]/95 p-2 dark:bg-[#151518]/95">
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

            {(receiveMode !== 'email' || authenticated) && <>
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
              embedded
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
                onChange: address => {
                  manualEvmAddress.current = address
                  draft.setEvmAddress(address)
                },
                onDisconnect: () => {
                  disconnectEvm()
                  manualEvmAddress.current = ''
                  draft.setEvmAddress('')
                },
              }}
              solana={{
                address: draft.solanaAddress,
                dirty: draft.validation.solanaDirty,
                valid: draft.validation.solanaValid,
                connectedAddress: connectedSolana,
                onChange: address => {
                  manualSolanaAddress.current = address
                  draft.setSolanaAddress(address)
                },
                onDisconnect: () => {
                  disconnectSolana()
                  manualSolanaAddress.current = ''
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
            </>}
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

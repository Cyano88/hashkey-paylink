import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Mail } from '../components/PocketIcons'
import { useAccount, useDisconnect } from 'wagmi'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import { canUseCircleEvmEmailWallet } from '../../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet } from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META, type ChainKey } from '../../lib/chains'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { useSolana } from '../../lib/SolanaContext'
import { formatAmount } from '../../lib/utils'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import usePocketUsdcDraftController from '../controllers/usePocketUsdcDraftController'
import { PocketPayerNetworkPanel } from '../features/move/PocketPayerNetworkPanel'
import {
  PocketFlexibleAmountToggle,
  PocketPaymentAmountField,
  PocketPaymentNoteField,
  PocketPayLinkSubmitPanel,
} from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import { PocketRecipientAddressFields } from '../features/move/PocketRecipientAddressFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketRecipient from '../hooks/usePocketRecipient'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import { savePocketCollection } from '../api/pocketPaylinksClient'
import { createPocketUserRequest } from '../api/pocketRequestsClient'

const POCKET_NETWORKS: ChainKey[] = ['base', 'solana', 'arbitrum']
type ReceiveMode = 'idle' | 'paste' | 'email' | 'bank'

export default function PocketMoveUsdcPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, logout, getAccessToken } = usePocketIdentity()
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedSolana, disconnect: disconnectSolana } = useSolana()
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('email')
  const [collectionId, setCollectionId] = useState('')
  const [recipientPocketId, setRecipientPocketId] = useState('')
  const [requestBusy, setRequestBusy] = useState(false)
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

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
        ? pocketPathFor({ section: 'home', view: 'overview' })
        : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'profile', view: 'details' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const createCollection = useCallback(async () => {
    if (!authenticated) {
      window.alert('Sign in to save this Collection in Pocket Activity.')
      return
    }
    if (!draft.memo.trim()) {
      window.alert('Add a Collection name, such as Shy\'s wedding.')
      return
    }
    const accessToken = await getAccessToken()
    if (!accessToken) {
      window.alert('Sign in again to create this Collection.')
      return
    }
    const eventId = window.crypto.randomUUID().replace(/-/g, '')
    const paymentUrl = draft.generate({ eventId })
    if (!paymentUrl) return
    setRequestBusy(true)
    try {
      if (recipientPocketId) {
        await createPocketUserRequest({
          accessToken,
          recipientPocketId,
          eventId,
          title: draft.memo.trim(),
          amount: draft.amount,
          flexibleAmount: draft.flexibleAmount,
          network: draft.multiChain ? 'multi' : selectedNet === 'solana' ? 'solana' : selectedNet === 'arbitrum' ? 'arbitrum' : 'base',
          paymentUrl,
        })
      }
      await savePocketCollection({ accessToken, eventId, title: draft.memo.trim(), paymentUrl })
      setCollectionId(eventId)
    } catch (reason) {
      draft.invalidateResult()
      window.alert(reason instanceof Error ? reason.message : 'Could not save this Collection.')
    } finally {
      setRequestBusy(false)
    }
  }, [authenticated, draft, getAccessToken, recipientPocketId, selectedNet])

  const amountHelperText = draft.multiChain
    ? 'USDC on Base, Solana, or Arbitrum — payer chooses the chain'
    : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`
  const receiveFlowOpen = draft.multiChain || receiveMode === 'paste' || receiveMode === 'email'

  return (
    <PocketRouteShell active="home" onSelect={selectNav}>
      <PocketFlowHeader title="Receive" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.07]">
          <button type="button" className="min-h-10 rounded-full bg-gray-950 px-3 text-xs font-semibold text-white shadow-sm dark:bg-white dark:text-gray-950">Receive USDC</button>
          <button type="button" onClick={() => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.bank}?mode=request`)} className="min-h-10 rounded-full px-3 text-xs font-semibold text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Receive Naira</button>
        </div>
        {receiveFlowOpen && (
          <div className="space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Payment request</p>

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
                  Secure access keeps your requests and payment receipts together.
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

            <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} label="Collection name" placeholder="Wedding, team dues, donations..." optional={false} />

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Pocket ID <span className="text-xs font-normal text-gray-400">(optional)</span></span>
              <input type="text" inputMode="numeric" value={recipientPocketId} onChange={event => setRecipientPocketId(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))} placeholder="Send directly to a Pocket user" className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm tabular-nums outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" />
              <span className="block text-[11px] text-gray-400">{recipientPocketId ? 'This user will receive a request notification.' : 'Leave blank to create a general shareable link.'}</span>
            </label>

            <PocketFlexibleAmountToggle
              lane="usdc"
              enabled={draft.flexibleAmount}
              onToggle={() => draft.setFlexibleAmount(!draft.flexibleAmount)}
            />

            <PocketPayLinkSubmitPanel
              lane="usdc"
              shellActive
              idle={!draft.generatedLink}
              canSubmit={draft.validation.canGenerate && authenticated && Boolean(draft.memo.trim()) && (!recipientPocketId || /^[0-9]{6,12}$/.test(recipientPocketId))}
              submitting={requestBusy}
              addressGuidance={draft.validation.addressGuidance}
              onSubmit={() => { void createCollection() }}
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
          networkLabel={draft.multiChain ? 'Base · Arbitrum · Solana' : CHAIN_META[selectedNet].label}
          evmAddress={draft.validation.evmValid ? draft.evmAddress : undefined}
          solanaAddress={draft.validation.solanaValid ? draft.solanaAddress : undefined}
          memo={draft.memo}
          eventMode={Boolean(collectionId)}
          accessMode={false}
          dashboardUrl={collectionId ? `${POCKET_BASE_PATH}/activity/collections?collection=${encodeURIComponent(collectionId)}` : draft.dashboardUrl}
          qrRef={draft.qrRef}
          qrHiResRef={draft.qrHiResRef}
          onReset={() => { setCollectionId(''); draft.reset() }}
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

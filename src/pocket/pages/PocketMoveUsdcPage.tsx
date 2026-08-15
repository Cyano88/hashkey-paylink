import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Check, Loader2, Mail, Send } from '../components/PocketIcons'
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
import { PocketFlexibleAmountToggle, PocketPaymentAmountField, PocketPaymentNoteField, PocketPayLinkSubmitPanel } from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import { PocketRecipientAddressFields } from '../features/move/PocketRecipientAddressFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketRecipient from '../hooks/usePocketRecipient'
import usePocketWallets from '../hooks/usePocketWallets'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import { savePocketCollection } from '../api/pocketPaylinksClient'
import { createPocketUserRequest, resolvePocketRequestUser, type PocketRequestUser } from '../api/pocketRequestsClient'

const POCKET_NETWORKS: ChainKey[] = ['base', 'solana', 'arbitrum']
type ReceiveMode = 'idle' | 'paste' | 'email' | 'bank'
type ReceiveFlow = 'request' | 'collection'
type CollectionRail = 'usdc' | 'local'

export default function PocketMoveUsdcPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedSolana, disconnect: disconnectSolana } = useSolana()
  const [flow, setFlow] = useState<ReceiveFlow>(() => new URLSearchParams(window.location.search).get('flow') === 'collection' ? 'collection' : 'request')
  const [collectionRail, setCollectionRail] = useState<CollectionRail>('usdc')
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('email')
  const [collectionId, setCollectionId] = useState('')
  const [payerPocketId, setPayerPocketId] = useState('')
  const [resolvedPayer, setResolvedPayer] = useState<PocketRequestUser | null>(null)
  const [resolvingPayer, setResolvingPayer] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [requestNotice, setRequestNotice] = useState('')
  const chainSwitchMounted = useRef(false)
  const manualEvmAddress = useRef('')
  const manualSolanaAddress = useRef('')
  const draft = usePocketUsdcDraftController(selectedNet)
  const isEvmNetwork = selectedNet !== 'solana'
  const canReceiveWithEmail = !draft.multiChain && PRIVY_AUTH_ENABLED && (selectedNet === 'solana' ? canUseCircleSolanaEmailWallet() : canUseCircleEvmEmailWallet(selectedNet))

  const recipient = usePocketRecipient({
    authenticated, email, getAccessToken, network: selectedNet, receiveMode, setReceiveMode,
    evmAddress: draft.evmAddress, solanaAddress: draft.solanaAddress,
    evmValid: draft.validation.evmValid, solanaValid: draft.validation.solanaValid,
    canReceiveWithEmail, setEvmAddress: draft.setEvmAddress, setSolanaAddress: draft.setSolanaAddress,
    invalidateResult: draft.invalidateResult,
  })

  useEffect(() => { if (!POCKET_NETWORKS.includes(selectedNet)) onNetworkSelect('base') }, [onNetworkSelect, selectedNet])
  useEffect(() => {
    if (receiveMode !== 'email' && connectedEvm && !draft.evmAddress && (isEvmNetwork || draft.multiChain)) {
      manualEvmAddress.current = connectedEvm
      draft.setEvmAddress(connectedEvm)
    }
  }, [connectedEvm, draft.evmAddress, draft.multiChain, draft.setEvmAddress, isEvmNetwork, receiveMode])
  useEffect(() => {
    if (receiveMode !== 'email' && connectedSolana && !draft.solanaAddress && (selectedNet === 'solana' || draft.multiChain)) {
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
    if (!chainSwitchMounted.current) { chainSwitchMounted.current = true; return }
    if (!draft.multiChain) {
      manualEvmAddress.current = ''
      manualSolanaAddress.current = ''
      draft.clearAddresses()
    }
  }, [selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResolvedPayer(null)
    setFormError('')
    if (flow !== 'request' || !authenticated || !/^\d{6,12}$/.test(payerPocketId)) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setResolvingPayer(true)
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) throw new Error('Sign in again to find this Pocket user.')
        const user = await resolvePocketRequestUser(accessToken, payerPocketId)
        if (!cancelled) setResolvedPayer(user)
      } catch (reason) {
        if (!cancelled) setFormError(reason instanceof Error ? reason.message : 'Pocket user could not be found.')
      } finally {
        if (!cancelled) setResolvingPayer(false)
      }
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [authenticated, flow, getAccessToken, payerPocketId])

  const toggleMultiChain = useCallback(() => {
    const enabled = !draft.multiChain
    if (enabled) {
      const pocketEvmAddress = wallets.wallets.base?.address || wallets.wallets.arbitrum?.address || draft.evmAddress
      const pocketSolanaAddress = wallets.wallets.solana?.address || draft.solanaAddress
      setReceiveMode('paste')
      draft.setEvmAddress(pocketEvmAddress)
      draft.setSolanaAddress(pocketSolanaAddress)
    } else if (authenticated) {
      const selectedWallet = wallets.wallets[selectedNet]
      setReceiveMode('email')
      if (selectedWallet?.address) {
        if (selectedNet === 'solana') draft.setSolanaAddress(selectedWallet.address)
        else draft.setEvmAddress(selectedWallet.address)
      }
    }
    draft.setMultiChain(enabled)
  }, [authenticated, draft, selectedNet, wallets.wallets])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home' ? pocketPathFor({ section: 'home', view: 'overview' })
      : tab === 'bills' ? pocketPathFor({ section: 'bills', view: 'airtime' })
      : tab === 'activity' ? pocketPathFor({ section: 'activity', view: 'all' })
      : pocketPathFor({ section: 'profile', view: 'details' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const createRequest = useCallback(async () => {
    setFormError('')
    setRequestNotice('')
    if (!authenticated) { setFormError('Sign in to send a Pocket request.'); return }
    if (!resolvedPayer) { setFormError('Enter and confirm the payer Pocket ID.'); return }
    if (!draft.validation.amountValid || draft.flexibleAmount) { setFormError('Enter the exact USDC amount to request.'); return }
    const accessToken = await getAccessToken()
    if (!accessToken) { setFormError('Sign in again to send this request.'); return }
    setRequestBusy(true)
    try {
      await createPocketUserRequest({
        accessToken,
        recipientPocketId: resolvedPayer.pocketId,
        eventId: window.crypto.randomUUID().replace(/-/g, ''),
        title: draft.memo.trim() || 'USDC request',
        amount: draft.amount,
        network: selectedNet === 'solana' ? 'solana' : selectedNet === 'arbitrum' ? 'arbitrum' : 'base',
      })
      setRequestNotice(`Request sent to ${resolvedPayer.displayName}.`)
      setPayerPocketId('')
      setResolvedPayer(null)
      draft.setAmount('')
      draft.setMemo('')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Pocket could not send this request.')
    } finally { setRequestBusy(false) }
  }, [authenticated, draft, getAccessToken, resolvedPayer, selectedNet])

  const createCollection = useCallback(async () => {
    setFormError('')
    if (!authenticated) { setFormError('Sign in to save this collection in Activity.'); return }
    if (!draft.memo.trim()) { setFormError('Enter a collection name, such as Shy\'s wedding.'); return }
    const accessToken = await getAccessToken()
    if (!accessToken) { setFormError('Sign in again to create this collection.'); return }
    const eventId = window.crypto.randomUUID().replace(/-/g, '')
    const paymentUrl = draft.generate({ eventId })
    if (!paymentUrl) return
    setRequestBusy(true)
    try {
      await savePocketCollection({ accessToken, eventId, title: draft.memo.trim(), paymentUrl })
      setCollectionId(eventId)
    } catch (reason) {
      draft.invalidateResult()
      setFormError(reason instanceof Error ? reason.message : 'Pocket could not create this collection.')
    } finally { setRequestBusy(false) }
  }, [authenticated, draft, getAccessToken])

  const amountHelperText = draft.multiChain ? 'Contributors can pay USDC on Base, Arbitrum, or Solana.' : `USDC on ${CHAIN_META[selectedNet].label}`
  const showSignIn = receiveMode === 'email' && !authenticated
  const requestCanSubmit = authenticated && Boolean(resolvedPayer) && draft.validation.amountValid && !draft.flexibleAmount

  return <PocketRouteShell active="home" onSelect={selectNav}>
    <PocketFlowHeader title="Request" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.07]">
        {(['request', 'collection'] as ReceiveFlow[]).map(value => <button key={value} type="button" onClick={() => { setFlow(value); setFormError(''); setRequestNotice(''); if (value === 'request' && draft.multiChain) draft.setMultiChain(false) }} className={`min-h-10 rounded-full px-3 text-xs font-semibold transition ${flow === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}>{value === 'request' ? 'Request' : 'Collection'}</button>)}
      </div>

      <section className="space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.035]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{flow === 'request' ? 'Pocket request' : 'Group collection'}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{flow === 'request' ? 'Request USDC from one Pocket user. Payment stays inside Pocket.' : 'Create one link and QR code for multiple contributors.'}</p>
        </div>

        {showSignIn ? <div className="overflow-hidden rounded-[22px] bg-[#F5F5F7]/95 p-2 dark:bg-[#151518]/95">
          <PrivyConnectButton debugLabel="create-pocket-receive" loginOptions={{ loginMethods: ['email'] }} logoutOnAuthenticated={false} onBeforeLogin={recipient.rememberSignInIntent} className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-sm font-semibold text-white dark:bg-white/[0.12]">
            <Mail className="absolute left-5 h-4 w-4" /><span>Sign in to Pocket</span><span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><ArrowRight className="h-4 w-4" /></span>
          </PrivyConnectButton>
          <p className="px-3 pb-1 pt-2 text-center text-[11px] text-gray-400 dark:text-gray-500">Sign in to keep requests, collections, payments, and receipts together.</p>
        </div> : <>
          {flow === 'collection' && <div className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/[0.06]">
            <button type="button" onClick={() => setCollectionRail('usdc')} className={`min-h-10 rounded-xl text-xs font-bold ${collectionRail === 'usdc' ? 'bg-white text-gray-950 shadow-sm dark:bg-white/[0.1] dark:text-white' : 'text-gray-500'}`}>USDC</button>
            <button type="button" onClick={() => setCollectionRail('local')} className={`min-h-10 rounded-xl text-xs font-bold ${collectionRail === 'local' ? 'bg-white text-gray-950 shadow-sm dark:bg-white/[0.1] dark:text-white' : 'text-gray-500'}`}>Local currency</button>
          </div>}

          {flow === 'collection' && collectionRail === 'local' ? <div className="space-y-2">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Collection country</p>
            <button type="button" onClick={() => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.bank}?mode=request`)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 text-left dark:border-blue-400/20 dark:bg-blue-400/10"><span><span className="block text-sm font-bold">Nigeria</span><span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">NGN local-currency collection</span></span><span className="rounded-full bg-blue-600 px-2.5 py-1 text-[9px] font-black uppercase text-white">Available</span></button>
            {[['Ghana', 'GHS'], ['Kenya', 'KES']].map(([country, currency]) => <button key={country} type="button" disabled className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-gray-200 px-4 text-left opacity-55 dark:border-white/10"><span><span className="block text-sm font-bold">{country}</span><span className="mt-0.5 block text-[11px] text-gray-400">{currency} local-currency collection</span></span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 dark:bg-white/[0.08]">Soon</span></button>)}
            <p className="px-2 pt-1 text-center text-[11px] leading-5 text-gray-400 dark:text-gray-500">Nigeria is available now. Ghana and Kenya will become selectable when their local payment rails are ready.</p>
          </div> : <>
            <PocketPayerNetworkPanel showSelector selectedNetwork={selectedNet} selectedNetworkLabel={CHAIN_META[selectedNet].label} options={POCKET_NETWORKS.map(network => ({ value: network, label: CHAIN_META[network].label }))} multiChain={flow === 'collection' && draft.multiChain} emailReceive={flow !== 'collection' && receiveMode === 'email'} onNetworkSelect={network => onNetworkSelect(network as ChainKey)} onMultiChainToggle={toggleMultiChain} showMultiChainToggle={flow === 'collection'} embedded />

            {flow === 'request' ? <>
              <label className="block space-y-1.5"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">Payer Pocket ID</span><span className="relative block"><input type="text" inputMode="numeric" value={payerPocketId} onChange={event => setPayerPocketId(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter 6 to 12 digits" className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-3 pr-11 text-sm font-semibold tabular-nums outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" />{resolvingPayer ? <span className="absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-gray-400"><Loader2 className="h-4 w-4" /></span> : resolvedPayer ? <Check className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" /> : null}</span><span className="block text-[11px] leading-5 text-gray-400">Only this Pocket user will receive the request. No public link or QR code is created.</span></label>
              {resolvedPayer && <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold dark:bg-blue-400/10"><Check className="h-3.5 w-3.5 text-blue-500" /><span className="truncate">{resolvedPayer.displayName}</span><span className="ml-auto text-[9px] font-black uppercase text-gray-400">{resolvedPayer.verified ? 'Verified' : 'Pocket user'}</span></div>}
              <PocketPaymentAmountField lane="usdc" flexible={false} amount={draft.amount} dirty={draft.validation.amountDirty} valid={draft.validation.amountValid} helperText={`Exact USDC amount on ${CHAIN_META[selectedNet].label}.`} onAmountChange={draft.setAmount} />
              <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} label="Payment note" placeholder="Dinner, tickets, shared expense..." />
              <button type="button" disabled={!requestCanSubmit || requestBusy} onClick={() => void createRequest()} className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white disabled:bg-gray-100 disabled:text-gray-400 dark:bg-white/[0.12] dark:disabled:bg-white/[0.06]"><span className="absolute left-5">{requestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</span>Send request{requestCanSubmit && !requestBusy && <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><ArrowRight className="h-4 w-4" /></span>}</button>
            </> : <>
              <PocketRecipientAddressFields showEvm={(isEvmNetwork || draft.multiChain) && (draft.multiChain || receiveMode === 'paste')} showSolana={(selectedNet === 'solana' || draft.multiChain) && (draft.multiChain || receiveMode === 'paste')} bankSend={false} multiChain={draft.multiChain} selectedNetwork={selectedNet} receiveMode={receiveMode} evm={{ address: draft.evmAddress, dirty: draft.validation.evmDirty, valid: draft.validation.evmValid, connectedAddress: connectedEvm, onChange: address => { manualEvmAddress.current = address; draft.setEvmAddress(address) }, onDisconnect: () => { disconnectEvm(); manualEvmAddress.current = ''; draft.setEvmAddress('') } }} solana={{ address: draft.solanaAddress, dirty: draft.validation.solanaDirty, valid: draft.validation.solanaValid, connectedAddress: connectedSolana, onChange: address => { manualSolanaAddress.current = address; draft.setSolanaAddress(address) }, onDisconnect: () => { disconnectSolana(); manualSolanaAddress.current = ''; draft.setSolanaAddress('') } }} />
              <PocketPaymentAmountField lane="usdc" flexible={draft.flexibleAmount} amount={draft.amount} dirty={draft.validation.amountDirty} valid={draft.validation.amountValid} helperText={amountHelperText} onAmountChange={draft.setAmount} />
              <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} label="Collection name" placeholder="Wedding, team dues, donations..." optional={false} />
              <PocketFlexibleAmountToggle lane="usdc" enabled={draft.flexibleAmount} onToggle={() => draft.setFlexibleAmount(!draft.flexibleAmount)} />
              <PocketPayLinkSubmitPanel lane="usdc" shellActive idle={!draft.generatedLink} canSubmit={draft.validation.canGenerate && authenticated && Boolean(draft.memo.trim())} submitting={requestBusy} addressGuidance={draft.validation.addressGuidance} onSubmit={() => void createCollection()} />
            </>}
          </>}
        </>}
        {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{formError}</p>}
        {requestNotice && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">{requestNotice}</p>}
      </section>
    </div>

    {flow === 'collection' && draft.generatedLink && <PocketPayLinkReadyPanel url={draft.generatedLink} copied={draft.copied} flexible={draft.flexibleAmount} localCurrency={false} amountLabel={formatAmount(draft.amount, 6)} networkLabel={draft.multiChain ? 'Base, Arbitrum, Solana' : CHAIN_META[selectedNet].label} evmAddress={draft.validation.evmValid ? draft.evmAddress : undefined} solanaAddress={draft.validation.solanaValid ? draft.solanaAddress : undefined} memo={draft.memo} eventMode={Boolean(collectionId)} accessMode={false} dashboardUrl={collectionId ? `${POCKET_BASE_PATH}/activity/collections?collection=${encodeURIComponent(collectionId)}` : draft.dashboardUrl} qrRef={draft.qrRef} qrHiResRef={draft.qrHiResRef} onReset={() => { setCollectionId(''); draft.reset() }} onDownloadQr={draft.downloadQr} onShare={() => void draft.share()} />}
    <PayLinkShareSheet open={draft.shareOpen} url={draft.generatedLink} copied={draft.copied} shareText={draft.shareText} onCopy={draft.copy} onClose={draft.closeShare} />
  </PocketRouteShell>
}

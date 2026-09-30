import { InboxArrowDownIcon, RectangleStackIcon } from '@heroicons/react/24/outline'
import { activityScope, refreshPocketActivity } from '../lib/pocketActivityCache'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { Check, Loader2, ChevronRight, RequestMoney, Users, Coins, Landmark } from '../components/PocketIcons'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import { canUseCircleEvmEmailWallet } from '../../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet } from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META, type ChainKey } from '../../lib/chains'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { formatAmount } from '../../lib/utils'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import usePocketUsdcDraftController from '../controllers/usePocketUsdcDraftController'
import { PocketPayerNetworkPanel } from '../features/move/PocketPayerNetworkPanel'
import { PocketFlexibleAmountToggle, PocketPaymentAmountField, PocketPaymentNoteField, PocketPayLinkSubmitPanel } from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketRecipient from '../hooks/usePocketRecipient'
import usePocketWallets from '../hooks/usePocketWallets'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import { savePocketCollection } from '../api/pocketPaylinksClient'
import { createPocketUserRequest, resolvePocketRequestUser, type PocketRequestUser } from '../api/pocketRequestsClient'

const POCKET_NETWORKS: ChainKey[] = ['base', 'arbitrum', 'solana', 'arc', 'ethereum', 'polygon']
type ReceiveMode = 'idle' | 'paste' | 'email' | 'bank'
type ReceiveFlow = 'request' | 'collection' | 'menu'

export default function PocketMoveUsdcPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [params, setParams] = useSearchParams()
  const flow: ReceiveFlow = params.get('flow') === 'request' ? 'request' : params.get('flow') === 'collection' ? 'collection' : 'menu'
  const collectionRail = params.get('rail') === 'usdc' ? 'usdc' : null
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('email')
  const [collectionId, setCollectionId] = useState('')
  const [payerPocketId, setPayerPocketId] = useState('')
  const [resolvedPayer, setResolvedPayer] = useState<PocketRequestUser | null>(null)
  const [resolvingPayer, setResolvingPayer] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [requestNotice, setRequestNotice] = useState('')
  const submittingRef = useRef(false)
  const attemptRef = useRef({ key: '', eventId: '' })
  const attemptId = (key: string) => { if (attemptRef.current.key !== key) attemptRef.current = {key, eventId: window.crypto.randomUUID().replace(/-/g, '')}; return attemptRef.current.eventId }
  const chainSwitchMounted = useRef(false)
  const draft = usePocketUsdcDraftController(selectedNet)
  const canReceiveWithEmail = !draft.multiChain && PRIVY_AUTH_ENABLED && (selectedNet === 'solana' ? canUseCircleSolanaEmailWallet() : canUseCircleEvmEmailWallet(selectedNet))

  const recipient = usePocketRecipient({
    authenticated, email, getAccessToken, network: selectedNet, receiveMode, setReceiveMode,
    evmAddress: draft.evmAddress, solanaAddress: draft.solanaAddress,
    evmValid: draft.validation.evmValid, solanaValid: draft.validation.solanaValid,
    canReceiveWithEmail, setEvmAddress: draft.setEvmAddress, setSolanaAddress: draft.setSolanaAddress,
    invalidateResult: draft.invalidateResult,
  })

  useEffect(() => { if (flow !== 'menu' && (!POCKET_NETWORKS.includes(selectedNet) || (flow === 'collection' && (selectedNet === 'ethereum' || selectedNet === 'polygon')))) onNetworkSelect('base') }, [onNetworkSelect, selectedNet, flow])
  useEffect(() => {
    if (!chainSwitchMounted.current) { chainSwitchMounted.current = true; return }
    if (!draft.multiChain) {
      draft.clearAddresses()
    }
  }, [selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResolvedPayer(null)
    setResolvingPayer(false)
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
      const pocketEvmAddress = wallets.wallets.base?.address || wallets.wallets.arbitrum?.address || ''
      const pocketSolanaAddress = wallets.wallets.solana?.address || ''
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

  useEffect(() => {
    if (flow !== 'collection' || !draft.multiChain || draft.generatedLink) return
    const pocketEvmAddress = wallets.wallets.base?.address || wallets.wallets.arbitrum?.address || ''
    const pocketSolanaAddress = wallets.wallets.solana?.address || ''
    if (pocketEvmAddress && pocketEvmAddress !== draft.evmAddress) draft.setEvmAddress(pocketEvmAddress)
    if (pocketSolanaAddress && pocketSolanaAddress !== draft.solanaAddress) draft.setSolanaAddress(pocketSolanaAddress)
  }, [draft, flow, wallets.wallets])

  useEffect(() => {
    if (flow === 'request') { draft.setFlexibleAmount(false); draft.setMultiChain(false); setReceiveMode('email') }
  }, [flow, draft.setFlexibleAmount, draft.setMultiChain])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home' ? pocketPathFor({ section: 'home', view: 'overview' })
      : tab === 'bills' ? pocketPathFor({ section: 'bills', view: 'overview' })
      : tab === 'activity' ? pocketPathFor({ section: 'activity', view: 'all' })
      : pocketPathFor({ section: 'profile', view: 'details' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  const createRequest = useCallback(async () => {
    if (submittingRef.current) return
    setFormError('')
    setRequestNotice('')
    if (!authenticated) { setFormError('Sign in to send a Pocket request.'); return }
    if (!resolvedPayer || resolvedPayer.pocketId !== payerPocketId) { setFormError('Enter and confirm the payer Pocket ID.'); return }
    if (!draft.validation.amountValid || draft.flexibleAmount) { setFormError('Enter the exact USDC amount to request.'); return }
    submittingRef.current = true
    setRequestBusy(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to send this request.')
      await createPocketUserRequest({
        accessToken,
        recipientPocketId: resolvedPayer.pocketId,
        eventId: attemptId(JSON.stringify(['request', resolvedPayer.pocketId, draft.amount, draft.memo, selectedNet])),
        title: draft.memo.trim() || 'USDC request',
        amount: draft.amount,
        network: selectedNet === 'arc' || selectedNet === 'ethereum' || selectedNet === 'polygon' || selectedNet === 'solana' || selectedNet === 'arbitrum' ? selectedNet : 'base',
      })
      attemptRef.current = {key:'',eventId:''}
      setRequestNotice(`Request sent to ${resolvedPayer.displayName}.`)
      setPayerPocketId('')
      setResolvedPayer(null)
      draft.setAmount('')
      draft.setMemo('')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Pocket could not send this request.')
    } finally { submittingRef.current = false; setRequestBusy(false) }
  }, [authenticated, draft, getAccessToken, resolvedPayer, selectedNet, payerPocketId])

  const createCollection = useCallback(async () => {
    setFormError('')
    if (!authenticated) { setFormError('Sign in to save this collection in Activity.'); return }
    if (!draft.memo.trim()) { setFormError('Enter a collection name, such as Shy\'s wedding.'); return }
    if (submittingRef.current || !draft.validation.canGenerate) return
    submittingRef.current = true
    setRequestBusy(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to create this collection.')
      const eventId = attemptId(JSON.stringify(['collection', draft.memo, draft.amount, draft.flexibleAmount, draft.multiChain, selectedNet, draft.evmAddress, draft.solanaAddress]))
      const paymentUrl = draft.generate({eventId})
      if (!paymentUrl) throw new Error('Check your collection details and try again.')
      await savePocketCollection({ accessToken, eventId, title: draft.memo.trim(), paymentUrl })
      void refreshPocketActivity(activityScope(email), getAccessToken, false, () => true, true).catch(() => undefined)
      setCollectionId(eventId)
      attemptRef.current = {key:'',eventId:''}
    } catch (reason) {
      draft.invalidateResult()
      setFormError(reason instanceof Error ? reason.message : 'Pocket could not create this collection.')
    } finally { submittingRef.current = false; setRequestBusy(false) }
  }, [authenticated, draft, getAccessToken, selectedNet, email])

  const showSignIn = !authenticated
  const requestCanSubmit = authenticated && Boolean(resolvedPayer && resolvedPayer.pocketId === payerPocketId) && draft.validation.amountValid && !draft.flexibleAmount

  const openFlow = (next: 'request' | 'collection') => {
    setFormError(''); setRequestNotice(''); draft.invalidateResult(); setCollectionId('')
    if (next === 'request') { draft.setMultiChain(false); draft.setFlexibleAmount(false); setReceiveMode('email') }
    setParams({flow:next})
  }
  const ready = flow === 'collection' && Boolean(collectionId && draft.generatedLink) && !requestBusy
  const listRow = (title: string, detail: string, Icon: typeof Coins, onClick: () => void) => <button key={title} type="button" onClick={onClick} className="flex min-h-20 w-full items-center gap-4 py-4 text-left">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><Icon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">{detail}</span></span><ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
  </button>
  return <PocketRouteShell active="home" onSelect={selectNav} refreshEnabled={false} scrollKey={flow + ':' + collectionRail}>
    <PocketFlowHeader centered rightAction={flow !== 'menu' ? <button type="button" disabled={requestBusy} aria-label={flow === 'request' ? 'View requests' : 'View collections'} className="flex h-10 w-10 items-center justify-center" onClick={() => navigate(POCKET_BASE_PATH + '/activity/collections?kind=' + (flow === 'request' ? 'requests' : 'collections'))}>{flow === 'request' ? <InboxArrowDownIcon className="h-5 w-5" /> : <RectangleStackIcon className="h-5 w-5" />}</button> : undefined} title={flow === 'menu' ? 'Request' : flow === 'request' ? 'Request USDC' : 'Create collection'} onBack={() => { if (requestBusy) return; if (flow === 'menu') navigate(POCKET_BASE_PATH + POCKET_ROUTES.receive); else if (collectionRail) setParams({flow:'collection'}); else setParams({}) }} />
    {flow === 'menu' ? <section aria-label="Request options" className="divide-y divide-gray-100 dark:divide-[#262626]">
      {listRow('Request USDC', 'Request from a Pocket user', RequestMoney, () => openFlow('request'))}
      {listRow('Create collection', 'One link for multiple contributors', Users, () => openFlow('collection'))}
    </section> : flow === 'collection' && !collectionRail ? <section aria-label="Collection options" className="divide-y divide-gray-100 dark:divide-[#262626]">
      {listRow('Receive USDC', 'Collect into your Pocket wallet', Coins, () => setParams({flow:'collection',rail:'usdc'}))}
      {listRow('Receive in a bank account', 'Collect NGN in Nigeria', Landmark, () => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.bank}?mode=request`))}
    </section> : <>
      {!ready && <fieldset disabled={requestBusy} aria-busy={requestBusy} className="space-y-5">
        {showSignIn ? <PrivyConnectButton debugLabel="create-pocket-receive" loginOptions={{ loginMethods: ['email'] }} logoutOnAuthenticated={false} onBeforeLogin={recipient.rememberSignInIntent} className="pocket-cta-primary w-full">Sign in to Pocket</PrivyConnectButton> : <>
          <PocketPayerNetworkPanel showSelector selectedNetwork={selectedNet} selectedNetworkLabel={CHAIN_META[selectedNet].label} options={POCKET_NETWORKS.filter(network => flow === 'request' || (network !== 'ethereum' && network !== 'polygon')).map(network => ({ value: network, label: CHAIN_META[network].label }))} multiChain={flow === 'collection' && draft.multiChain} emailReceive={flow === 'request'} onNetworkSelect={network => onNetworkSelect(network as ChainKey)} onMultiChainToggle={toggleMultiChain} showMultiChainToggle={flow === 'collection'} managedNetworkRouting embedded />
          {flow === 'request' ? <>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Pocket ID</span><span className="relative block"><input type="text" inputMode="numeric" value={payerPocketId} onChange={event => setPayerPocketId(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter Pocket ID" className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 pr-11 text-sm tabular-nums outline-none focus:border-gray-400 dark:border-[#262626] dark:bg-[#121212]" />{resolvingPayer && <Loader2 aria-label="Finding Pocket user" className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500" />}</span></label>
            {resolvedPayer && <p className="flex items-center gap-2 text-xs font-medium"><Check className="h-4 w-4 text-emerald-500" />{resolvedPayer.displayName}</p>}
            <PocketPaymentAmountField lane="usdc" flexible={false} amount={draft.amount} dirty={draft.validation.amountDirty} valid={draft.validation.amountValid} helperText="" onAmountChange={draft.setAmount} />
            <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} label="Note" placeholder="What is this for?" />
            <button type="button" disabled={!requestCanSubmit || requestBusy} onClick={() => void createRequest()} className="pocket-cta-primary w-full">{requestBusy && <Loader2 className="h-4 w-4 animate-spin" />}Send request</button>
          </> : <>
            <PocketPaymentNoteField value={draft.memo} onChange={draft.setMemo} label="Collection name" placeholder="Wedding, team dues, donations" optional={false} />
            <PocketPaymentAmountField lane="usdc" flexible={draft.flexibleAmount} amount={draft.amount} dirty={draft.validation.amountDirty} valid={draft.validation.amountValid} helperText="" onAmountChange={draft.setAmount} />
            <PocketFlexibleAmountToggle lane="usdc" enabled={draft.flexibleAmount} onToggle={() => draft.setFlexibleAmount(!draft.flexibleAmount)} />
            <PocketPayLinkSubmitPanel lane="usdc" shellActive idle canSubmit={draft.validation.canGenerate && authenticated && Boolean(draft.memo.trim())} submitting={requestBusy} addressGuidance={draft.validation.addressGuidance ? (wallets.resolved ? 'Your receiving wallet is unavailable. Try again.' : 'Preparing your receiving wallet.') : undefined} onSubmit={() => void createCollection()} />
          </>}
        </>}
        {formError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{formError}</p>}
        {requestNotice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{requestNotice}</p>}
      </fieldset>}
      {ready && <PocketPayLinkReadyPanel url={draft.generatedLink} copied={draft.copied} flexible={draft.flexibleAmount} localCurrency={false} amountLabel={formatAmount(draft.amount, 6)} networkLabel={draft.multiChain ? 'Base, Arbitrum, Solana' : CHAIN_META[selectedNet].label} memo={draft.memo} eventMode accessMode={false} dashboardUrl={`${POCKET_BASE_PATH}/activity/collections?kind=collections&collection=${encodeURIComponent(collectionId)}`} qrRef={draft.qrRef} qrHiResRef={draft.qrHiResRef} onReset={() => { setCollectionId(''); draft.reset(); setReceiveMode('email') }} onDownloadQr={draft.downloadQr} onShare={() => void draft.share()} />}
    </>}
    <PayLinkShareSheet pocket open={draft.shareOpen && ready} url={draft.generatedLink} copied={draft.copied} shareText={draft.shareText} onCopy={draft.copy} onClose={draft.closeShare} />
  </PocketRouteShell>
}

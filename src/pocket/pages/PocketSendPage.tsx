import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Loader2 } from '../components/PocketIcons'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketSelect from '../components/PocketSelect'
import PocketSlideAction from '../components/PocketSlideAction'
import type { PocketNavTab } from '../components/PocketBottomNav'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketWalletController from '../controllers/usePocketWalletController'
import usePocketWithdrawalController from '../controllers/usePocketWithdrawalController'
import usePocketPaymentLiquidityController, { type PocketPaymentLiquidityPersistence } from '../controllers/usePocketPaymentLiquidityController'
import { completePocketRequest, readPocketRequestRoute, readPocketRequests, resolvePocketRecipient, startPocketRequestRoute, updatePocketRequestRoute, type PocketRequestItem, type PocketResolvedRecipient } from '../api/pocketRequestsClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import type { PocketNetwork } from '../lib/pocketSchemas'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

type SendNetwork = 'base' | 'arbitrum' | 'solana'
type RecipientMode = 'pocket' | 'address'
const networkLabel = (network: SendNetwork) => network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'
function navPath(tab: PocketNavTab) { if (tab === 'profile') return POCKET_ROUTES.profile; if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' }); if (tab === 'activity') return POCKET_ROUTES.activity; return POCKET_ROUTES.home }

export default function PocketSendPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestId = searchParams.get('request')?.trim() ?? ''
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: false, getAccessToken })
  const [network, setNetworkState] = useState<SendNetwork>(() => { const saved = window.localStorage.getItem('pocket.home.network'); return saved === 'arbitrum' || saved === 'solana' ? saved : 'base' })
  const [mode, setMode] = useState<RecipientMode>('pocket')
  const [pocketId, setPocketId] = useState('')
  const [resolved, setResolved] = useState<PocketResolvedRecipient | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [paymentRequest, setPaymentRequest] = useState<PocketRequestItem | null>(null)
  const [requestLoading, setRequestLoading] = useState(Boolean(requestId))
  const [requestError, setRequestError] = useState('')
  const [requestConfirmed, setRequestConfirmed] = useState(false)
  const [requestAccepted, setRequestAccepted] = useState(() => requestId ? window.localStorage.getItem(`pocket.request.accepted.${requestId}`) === 'true' : false)
  const [paymentTxHash, setPaymentTxHash] = useState(() => requestId ? window.localStorage.getItem(`pocket.request.payment.${requestId}`) ?? '' : '')
  const onWalletReady = useCallback((key: PocketNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [key]: wallet })), [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const balance = wallets.rows.find(row => row.key === network)?.balance ?? 0
  const send = usePocketWithdrawalController({ network, networkLabel: networkLabel(network), wallet: wallets.wallets[network], balance, resetKey: `${network}:${mode}:${requestId || 'direct'}`, restoreOperations: Boolean(requestId) || mode === 'address', operationContext: requestId ? `request:${requestId}` : 'send', allowLegacyOperation: Boolean(requestId && requestAccepted), ensureWallet: walletController.ensureWallet, getEvmSession: walletController.getEvmSession, getSolanaSession: walletController.getSolanaSession, getAccessToken, refreshBalances: wallets.refreshBalances, clearExternalError: () => { wallets.setError(''); setResolveError('') }, onActivity: () => void activity.refresh() })
  const routePersistence = useMemo<PocketPaymentLiquidityPersistence | undefined>(() => requestId ? ({
    read: accessToken => readPocketRequestRoute(accessToken, requestId),
    start: (accessToken, route) => startPocketRequestRoute(accessToken, requestId, route),
    update: (accessToken, route) => updatePocketRequestRoute(accessToken, requestId, { phase: route.phase, txHash: route.txHash }),
  }) : undefined, [requestId])
  const requestLiquidity = usePocketPaymentLiquidityController({
    enabled: Boolean(paymentRequest?.status === 'accepted' && resolved && !requestConfirmed && !paymentTxHash),
    amount: paymentRequest?.amount ?? '',
    destination: network,
    getAccessToken,
    ensureWallet: walletController.ensureWallet,
    getEvmSession: walletController.getEvmSession,
    getSolanaSession: walletController.getSolanaSession,
    refreshBalances: wallets.refreshBalances,
    persistence: routePersistence,
  })
  const setNetwork = (next: SendNetwork) => { window.localStorage.setItem('pocket.home.network', next); setNetworkState(next); setResolved(null); setResolveError('') }

  useEffect(() => {
    if (!requestId || !authenticated) { setRequestLoading(false); return }
    let cancelled = false
    ;(async () => {
      setRequestLoading(true); setRequestError('')
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Sign in again to open this request.')
        const item = (await readPocketRequests(token)).find(candidate => candidate.id === requestId && candidate.direction === 'incoming')
        if (!item) throw new Error('This payment request is no longer available.')
        if (item.status === 'declined') throw new Error('You declined this request.')
        if (item.status === 'pending') throw new Error('Accept this request from Notifications before paying.')
        if (item.status === 'paid') { setPaymentRequest(item); setRequestConfirmed(true); setRequestAccepted(true); return }
        setPaymentRequest(item)
        setNetwork(item.network === 'multi' ? 'base' : item.network)
        setMode('pocket')
        setPocketId(item.senderPocketId)
      } catch (reason) { if (!cancelled) setRequestError(reason instanceof Error ? reason.message : 'This payment request could not load.') }
      finally { if (!cancelled) setRequestLoading(false) }
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken, requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'pocket' || !/^\d{6,12}$/.test(pocketId)) { setResolved(null); if (mode === 'pocket') send.setAddress(''); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setResolving(true); setResolveError(''); setResolved(null); send.setAddress('')
      try { const token = await getAccessToken(); if (!token) throw new Error('Sign in again to resolve this Pocket ID.'); const recipient = await resolvePocketRecipient(token, pocketId, network); if (!cancelled) { setResolved(recipient); send.setAddress(recipient.address) } }
      catch (reason) { if (!cancelled) setResolveError(reason instanceof Error ? reason.message : 'Pocket user could not be resolved.') }
      finally { if (!cancelled) setResolving(false) }
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [getAccessToken, mode, network, pocketId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!paymentRequest || paymentRequest.status !== 'accepted') return
    if (send.amount !== paymentRequest.amount) send.setAmount(paymentRequest.amount)
  }, [paymentRequest, send.amount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!requestId || !send.txHash) return
    setPaymentTxHash(send.txHash)
    window.localStorage.setItem(`pocket.request.payment.${requestId}`, send.txHash)
  }, [requestId, send.txHash])

  useEffect(() => {
    if (!paymentRequest || requestConfirmed || !paymentTxHash) return
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        try {
          const token = await getAccessToken()
          if (!token) throw new Error('Sign in again to confirm this payment.')
          const completed = await completePocketRequest(token, paymentRequest.id, paymentTxHash)
          if (!cancelled) { setPaymentRequest(completed); setRequestConfirmed(true); setRequestAccepted(true); setRequestError(''); window.localStorage.removeItem(`pocket.request.payment.${paymentRequest.id}`); window.localStorage.removeItem(`pocket.request.accepted.${paymentRequest.id}`) }
          return
        } catch (reason) {
          if (attempt === 9 && !cancelled) setRequestError(reason instanceof Error ? reason.message : 'Payment was sent, but confirmation is still pending.')
          if (attempt < 9) await new Promise(resolve => window.setTimeout(resolve, 1800))
        }
      }
    })()
    return () => { cancelled = true }
  }, [getAccessToken, paymentRequest, paymentTxHash, requestConfirmed])

  const submitPayment = useCallback(async () => {
    if (!paymentRequest) {
      await send.withdraw()
      return
    }
    try {
      const destinationWallet = await requestLiquidity.ensureLiquidity()
      const accepted = await send.withdraw({ balanceOverride: Number(paymentRequest.amount), walletOverride: destinationWallet, preserveForm: true })
      if (accepted) {
        setRequestAccepted(true)
        window.localStorage.setItem(`pocket.request.accepted.${paymentRequest.id}`, 'true')
      }
    } catch {
      // The liquidity controller owns the durable progress and user-facing
      // error. A confirmed bridge is resumed rather than submitted twice.
    }
  }, [paymentRequest, requestLiquidity.ensureLiquidity, send.withdraw])

  const requestPaid = requestConfirmed || requestAccepted

  if (authenticated && (!wallets.resolved || requestLoading)) return <PocketLoadingState active="home" />
  const recipientReady = mode === 'pocket' ? Boolean(resolved) : Boolean(send.address.trim())
  return <PocketRouteShell active="home" onSelect={tab => navigate(POCKET_BASE_PATH + navPath(tab))}>
    <PocketFlowHeader title={paymentRequest ? 'Pay request' : 'Send USDC'} onBack={() => navigate(requestId ? POCKET_BASE_PATH + POCKET_ROUTES.notifications : POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    {requestError && !paymentRequest ? <section className="rounded-[26px] border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><p className="text-sm font-bold">Request unavailable</p><p className="mt-2 text-xs leading-5 text-gray-400">{requestError}</p><button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.notifications)} className="mt-5 min-h-11 rounded-full bg-gray-950 px-6 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Back to notifications</button></section> :
    <section className="space-y-4 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      {paymentRequest && <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Request from {paymentRequest.senderName}</p><p className="mt-1 text-sm font-bold">{paymentRequest.title}</p><p className="mt-1 text-[10px] font-medium text-gray-400">Sent {new Date(paymentRequest.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(paymentRequest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>}
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Network</p><PocketSelect value={network} options={(['base','arbitrum','solana'] as SendNetwork[]).map(value => ({ value, label: networkLabel(value) }))} onChange={value => setNetwork(value as SendNetwork)} disabled={Boolean(paymentRequest)} ariaLabel="Select send network" /></div>
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span className="text-xs font-semibold text-gray-500">Available</span><span className="text-sm font-black tabular-nums">{formatPocketDisplayAmount(balance)} USDC</span></div>
      {!paymentRequest && <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">{(['pocket','address'] as RecipientMode[]).map(value => <button key={value} type="button" onClick={() => { setMode(value); setResolved(null); setResolveError(''); send.setAddress('') }} className={`min-h-10 rounded-full px-3 text-xs font-bold transition ${mode === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>{value === 'pocket' ? 'Pocket ID' : 'Wallet address'}</button>)}</div>}
      {mode === 'pocket' ? <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient Pocket ID</span><span className="relative mt-2 block"><input type="text" inputMode="numeric" value={pocketId} readOnly={Boolean(paymentRequest)} onChange={event => setPocketId(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter 6 to 12 digits" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-11 text-base font-bold tabular-nums outline-none focus:border-blue-400 read-only:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:read-only:bg-white/[0.025]" />{resolving ? <span className="absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></span> : resolved ? <Check className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" /> : null}</span></label> : <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient wallet address</span><input type="text" value={send.address} onChange={event => send.setAddress(event.target.value.trim())} placeholder={network === 'solana' ? 'Solana wallet address' : '0x... wallet address'} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" /></label>}
      {resolved && <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-900 dark:bg-blue-400/10 dark:text-white"><Check className="h-3.5 w-3.5 text-blue-500" /><span className="truncate">{resolved.name}</span><span className="ml-auto text-[10px] text-gray-400">Pocket {resolved.pocketId}</span></div>}
      {resolveError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{resolveError}</p>}
      <label className="block"><span className="flex items-center justify-between text-[11px] font-bold text-gray-500"><span>Amount</span>{!paymentRequest && <button type="button" onClick={send.setMax} className="text-blue-500">Max</button>}</span><span className="mt-2 flex items-center rounded-2xl border border-gray-200 px-4 dark:border-white/10"><input type="text" inputMode="decimal" value={send.amount} readOnly={Boolean(paymentRequest)} onChange={event => send.setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-4 text-base font-bold outline-none" /><b className="text-xs text-gray-400">USDC</b></span></label>
      {requestPaid ? <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-center dark:bg-emerald-400/10"><Check className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-bold">Request paid</p><p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{requestConfirmed ? 'The sender has been notified and this transfer will appear in Activity.' : 'Your payment was sent successfully. It will appear in Activity shortly.'}</p></div> : <PocketSlideAction status={paymentRequest && (requestLiquidity.status === 'waiting' || requestLiquidity.status === 'reconciling') ? 'submitted' : paymentRequest && requestLiquidity.status === 'moving' ? 'pending' : send.status} disabled={!recipientReady || !send.amount || resolving || Boolean(paymentTxHash) || Boolean(paymentRequest && (requestLiquidity.checking || requestLiquidity.insufficient))} onConfirm={submitPayment} labels={{ disabled: paymentTxHash ? 'Confirming payment' : paymentRequest && requestLiquidity.checking ? 'Checking balance' : paymentRequest && requestLiquidity.insufficient ? 'Insufficient USDC' : recipientReady ? 'Enter amount' : 'Choose recipient', idle: paymentRequest ? 'Confirm payment' : 'Confirm send', pending: requestLiquidity.status === 'moving' ? 'Moving USDC' : 'Preparing payment', submitted: requestLiquidity.status === 'waiting' || requestLiquidity.status === 'reconciling' ? 'USDC moving' : 'Transfer submitted', successful: paymentRequest ? 'Request paid' : 'Sent' }} />}
      {paymentRequest && !requestLiquidity.error && requestLiquidity.notice && (requestLiquidity.route?.kind === 'bridge' || requestLiquidity.busy || requestLiquidity.insufficient) && <p className="rounded-xl bg-blue-50 px-3 py-2 text-center text-xs font-semibold leading-5 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">{requestLiquidity.notice}</p>}
      {send.notice && <p className="text-center text-xs font-semibold text-emerald-600">{send.notice}</p>}
      {(requestError || send.error || wallets.error || requestLiquidity.error) && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{requestError || send.error || wallets.error || requestLiquidity.error}</p>}
      <p className="text-center text-[10px] leading-4 text-gray-400">{paymentRequest ? 'The recipient, network, and amount are fixed by the accepted request. Network fees may apply.' : 'Pocket resolves the recipient on the selected network before sending. Network fees may apply.'}</p>
    </section>}
  </PocketRouteShell>
}

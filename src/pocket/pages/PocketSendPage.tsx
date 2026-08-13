import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { resolvePocketRecipient, type PocketResolvedRecipient } from '../api/pocketRequestsClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import type { PocketNetwork } from '../lib/pocketSchemas'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

type SendNetwork = 'base' | 'arbitrum' | 'solana'
type RecipientMode = 'pocket' | 'address'
const networkLabel = (network: SendNetwork) => network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'
function navPath(tab: PocketNavTab) { if (tab === 'profile') return POCKET_ROUTES.profile; if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' }); if (tab === 'activity') return POCKET_ROUTES.activity; return POCKET_ROUTES.home }

export default function PocketSendPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: false, getAccessToken })
  const [network, setNetworkState] = useState<SendNetwork>(() => { const saved = window.localStorage.getItem('pocket.home.network'); return saved === 'arbitrum' || saved === 'solana' ? saved : 'base' })
  const [mode, setMode] = useState<RecipientMode>('pocket')
  const [pocketId, setPocketId] = useState('')
  const [resolved, setResolved] = useState<PocketResolvedRecipient | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const onWalletReady = useCallback((key: PocketNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [key]: wallet })), [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const balance = wallets.rows.find(row => row.key === network)?.balance ?? 0
  const send = usePocketWithdrawalController({ network, networkLabel: networkLabel(network), wallet: wallets.wallets[network], balance, resetKey: `${network}:${mode}`, ensureWallet: walletController.ensureWallet, getEvmSession: walletController.getEvmSession, getSolanaSession: walletController.getSolanaSession, refreshBalances: wallets.refreshBalances, clearExternalError: () => { wallets.setError(''); setResolveError('') }, onActivity: () => void activity.refresh() })
  const setNetwork = (next: SendNetwork) => { window.localStorage.setItem('pocket.home.network', next); setNetworkState(next); setResolved(null); setResolveError('') }

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

  if (authenticated && !wallets.resolved) return <PocketLoadingState active="home" />
  const recipientReady = mode === 'pocket' ? Boolean(resolved) : Boolean(send.address.trim())
  return <PocketRouteShell active="home" onSelect={tab => navigate(POCKET_BASE_PATH + navPath(tab))}>
    <PocketFlowHeader title="Send USDC" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    <section className="space-y-4 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Network</p><PocketSelect value={network} options={(['base','arbitrum','solana'] as SendNetwork[]).map(value => ({ value, label: networkLabel(value) }))} onChange={value => setNetwork(value as SendNetwork)} ariaLabel="Select send network" /></div>
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span className="text-xs font-semibold text-gray-500">Available</span><span className="text-sm font-black tabular-nums">{formatPocketDisplayAmount(balance)} USDC</span></div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">{(['pocket','address'] as RecipientMode[]).map(value => <button key={value} type="button" onClick={() => { setMode(value); setResolved(null); setResolveError(''); send.setAddress('') }} className={`min-h-10 rounded-full px-3 text-xs font-bold transition ${mode === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>{value === 'pocket' ? 'Pocket ID' : 'Wallet address'}</button>)}</div>
      {mode === 'pocket' ? <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient Pocket ID</span><span className="relative mt-2 block"><input type="text" inputMode="numeric" value={pocketId} onChange={event => setPocketId(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter 6 to 12 digits" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-11 text-base font-bold tabular-nums outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" />{resolving ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /> : resolved ? <Check className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" /> : null}</span></label> : <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient wallet address</span><input type="text" value={send.address} onChange={event => send.setAddress(event.target.value.trim())} placeholder={network === 'solana' ? 'Solana wallet address' : '0x... wallet address'} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" /></label>}
      {resolved && <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-900 dark:bg-blue-400/10 dark:text-white"><Check className="h-3.5 w-3.5 text-blue-500" /><span className="truncate">{resolved.name}</span><span className="ml-auto text-[10px] text-gray-400">Pocket {resolved.pocketId}</span></div>}
      {resolveError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{resolveError}</p>}
      <label className="block"><span className="flex items-center justify-between text-[11px] font-bold text-gray-500"><span>Amount</span><button type="button" onClick={send.setMax} className="text-blue-500">Max</button></span><span className="mt-2 flex items-center rounded-2xl border border-gray-200 px-4 dark:border-white/10"><input type="text" inputMode="decimal" value={send.amount} onChange={event => send.setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-4 text-base font-bold outline-none" /><b className="text-xs text-gray-400">USDC</b></span></label>
      <PocketSlideAction status={send.status} disabled={!recipientReady || !send.amount || resolving} onConfirm={() => void send.withdraw()} labels={{ disabled: recipientReady ? 'Enter amount' : 'Choose recipient', idle: 'Slide to send', pending: 'Confirm in Circle', submitted: 'Sending', successful: 'Sent' }} />
      {send.notice && <p className="text-center text-xs font-semibold text-emerald-600">{send.notice}</p>}
      {(send.error || wallets.error) && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{send.error || wallets.error}</p>}
      <p className="text-center text-[10px] leading-4 text-gray-400">Pocket ID is resolved securely for the selected network before sending. Network fees may apply.</p>
    </section>
  </PocketRouteShell>
}

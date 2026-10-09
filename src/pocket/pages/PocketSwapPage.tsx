import PocketFundingAction from '../components/PocketFundingAction'
import {fundingShortfall,amountExceedsBalance} from '../lib/pocketFundingShortfall'
import usePocketBridgeActivity from '../hooks/usePocketBridgeActivity'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'
import PocketArcSwapPanel from '../components/PocketArcSwapPanel'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketSelect from '../components/PocketSelect'
import PocketUsdtBridgePanel from '../components/PocketUsdtBridgePanel'
import PocketSlideAction from '../components/PocketSlideAction'
import { Loader2, ChevronRight, ArrowLeftRight } from '../components/PocketIcons'
import type { PocketNavTab } from '../components/PocketBottomNav'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import usePocketBridgeController from '../controllers/usePocketBridgeController'
import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'overview' })
  if (tab === 'activity') return POCKET_ROUTES.activity
  return POCKET_ROUTES.home
}
import { POCKET_BRIDGE_NETWORKS, pocketBridgeNetworkLabel as label, savedPocketBridgeNetwork } from '../lib/pocketBridgeNetworks'

export default function PocketSwapPage() {
  const navigate = useNavigate()
  const [bridgeApprovalBusy, setBridgeApprovalBusy] = useState(false)
  const [swapBusy, setSwapBusy] = useState(false)
  const [mode, setMode] = useState<'bridge' | 'swap' | null>(null)
  const [bridgeAsset, setBridgeAsset] = useState<'USDC'|'USDT'>('USDC')
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const activity = usePocketActivity({ authenticated, email, enabled: false, getAccessToken })
  const [source, setSource] = useState<PocketBridgeNetwork>(() => {
    const saved = window.localStorage.getItem('pocket.home.network')
    return savedPocketBridgeNetwork(saved)
  })
  const onWalletReady = useCallback((network: PocketBridgeNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [network]: wallet })), [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const sourceBalance = wallets.rows.find(row => row.key === source)?.balance ?? 0
  const swap = usePocketBridgeController({ owner: email, source, sourceBalance, wallets: wallets.wallets, ensureWallet: walletController.ensureWallet, getEvmSession: (network, address) => walletController.getEvmSession(network, address), getSolanaSession: walletController.getSolanaSession, getAccessToken, refresh: wallets.refreshBalances, onActivity: () => void activity.refresh() })
  usePocketBridgeActivity({owner:email,authenticated,rows:activity.rows,getAccessToken,getEvmSession:walletController.getEvmSession})
  const setSourceNetwork = (value: PocketBridgeNetwork) => { if (bridgeApprovalBusy || swap.submitting || swap.status === 'confirming') return; window.localStorage.setItem('pocket.home.network', value); setSource(value) }
  const signing = swapBusy || bridgeApprovalBusy || swap.submitting || swap.status === 'confirming'
  useEffect(() => {
    if (!signing) return
    const blockBack = (event: Event) => event.preventDefault()
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, blockBack)
    return () => window.removeEventListener(POCKET_NATIVE_BACK_EVENT, blockBack)
  }, [signing])
  if (authenticated && !wallets.resolved) return <PocketLoadingState active="home" />
  return <PocketRouteShell active="home" navigationDisabled={signing} refreshEnabled={!signing} scrollKey={mode || 'menu'} onSelect={tab => navigate(POCKET_BASE_PATH + navPath(tab))}>
    <PocketFlowHeader title={mode === 'bridge' ? 'Bridge stablecoins' : mode === 'swap' ? 'Swap on Arc' : 'Bridge & swap'} onBack={() => { if (!signing) { if (mode) setMode(null); else navigate(POCKET_BASE_PATH + POCKET_ROUTES.home) } }} />
    {!mode && <div className="divide-y divide-gray-100 dark:divide-[#262626]">{([['bridge','Bridge stablecoins','Move USDC or USDT between your wallets'],['swap','Swap on Arc','Exchange assets on Arc']] as const).map(([value,title,description])=><button key={value} type="button" onClick={()=>setMode(value)} className="flex w-full items-center gap-3 py-5 text-left"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#171717]"><ArrowLeftRight className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{description}</span></span><ChevronRight className="h-4 w-4 text-gray-400"/></button>)}</div>}
    {mode==='bridge'&&<PocketSelect value={bridgeAsset} options={[{value:'USDC',label:'USDC'},{value:'USDT',label:'USDT'}]} disabled={signing} ariaLabel="Bridge asset" onChange={value=>{swap.setAmount('');setBridgeAsset(value as 'USDC'|'USDT')}}/>}
    {mode==='bridge'&&bridgeAsset==='USDT'&&<PocketUsdtBridgePanel key={email} owner={email} getAccessToken={getAccessToken} getSession={walletController.getEvmSession} balances={wallets.displayRows} refresh={wallets.refreshBalances} onActivity={()=>void activity.refresh()} onBusyChange={setBridgeApprovalBusy}/>}
    <div hidden={mode !== "swap"}><PocketArcSwapPanel key={email} enabled={mode === "swap"} onBusyChange={setSwapBusy} email={email} getAccessToken={getAccessToken} ensureWallet={() => walletController.ensureWallet("arc")} getSession={address => walletController.getEvmSession("arc", address)} refresh={wallets.refreshBalances} /></div><section hidden={mode !== "bridge" || bridgeAsset !== 'USDC'} className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-[#262626] dark:bg-[#0D0D0D] dark:shadow-none">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">From</p><PocketSelect disabled={signing} value={source} options={POCKET_BRIDGE_NETWORKS.map(value => ({ value, label: label(value) }))} onChange={value => setSourceNetwork(value as PocketBridgeNetwork)} ariaLabel="Select source network" /></div>
        <div><p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">To</p><PocketSelect disabled={signing} value={swap.destination} options={swap.destinations.map(value => ({ value, label: label(value) }))} onChange={value => swap.setDestination(value as PocketBridgeNetwork)} ariaLabel="Select destination network" /></div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#121212]"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Available</span><span className="text-sm font-semibold tabular-nums">{formatPocketDisplayAmount(sourceBalance)} USDC</span></div>
      <label className="block"><span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Amount</span><span className="mt-2 flex gap-2"><input type="text" inputMode="decimal" disabled={signing} value={swap.amount} onChange={event => swap.setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-semibold outline-none dark:border-[#262626] dark:bg-[#121212]" /><button type="button" disabled={signing} onClick={() => swap.setAmount(Math.max(0, sourceBalance - Number(swap.quote?.fee || 0.25)).toFixed(6).replace(/\.?0+$/, ''))} className="rounded-2xl border border-gray-200 px-4 text-xs font-semibold dark:border-[#262626]">Max</button></span></label>
      {swap.status === 'quoting' ? <p className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Getting live quote</p> : swap.quote ? <div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-xs dark:bg-[#121212]"><div className="flex justify-between"><span className="text-gray-500">You receive</span><b>{formatPocketDisplayAmount(swap.quote.receive)} USDC</b></div><div className="flex justify-between"><span className="text-gray-500">Network fee</span><b>{formatPocketDisplayAmount(swap.quote.fee)} USDC</b></div></div> : null}
      <PocketFundingAction asset={fundingShortfall(swap.error)||(amountExceedsBalance(swap.quote?.total||swap.amount,sourceBalance,Boolean(wallets.displayRows?.find(r=>r.key===source)?.known&&!wallets.displayRows?.find(r=>r.key===source)?.stale))?'USDC':null)} network={source} locked={signing||swap.submitting} onReturn={async()=>{await wallets.refreshBalances();await swap.refreshQuote()}} onCancel={()=>swap.setAmount('')}><PocketSlideAction approvalRequired={false} onApprovalBusyChange={setBridgeApprovalBusy} status={swap.status === 'confirming' ? 'pending' : 'idle'} disabled={signing || !swap.quote || Number(swap.quote.total) > sourceBalance || swap.status === 'quoting'} onConfirm={() => void swap.bridge()} labels={{ disabled: swap.status === 'quoting' ? 'Getting live quote' : 'Enter bridge amount', idle: 'Confirm bridge', pending: 'Preparing bridge', submitted: 'Bridging...', successful: 'Bridged' }} /></PocketFundingAction>
      {swap.notice && <p role="status" className="text-center text-xs font-medium text-gray-500 dark:text-gray-400">{swap.notice} <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.activity)} className="font-semibold text-blue-600">View Activity</button></p>}
      {!fundingShortfall(swap.error) && swap.error && <p className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{swap.error}</p>}
    </section>
  </PocketRouteShell>
}

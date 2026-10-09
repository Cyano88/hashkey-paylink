import { savePocketDisplayCurrency } from '../lib/pocketDisplayCurrency'
import PocketDisplayCurrencyPicker from '../components/PocketDisplayCurrencyPicker'
import { POCKET_USDT_NETWORKS } from '../lib/pocketUsdtAssets'
import {pocketUsdtEnabled} from '../lib/pocketBaseUsdt'
import PocketAssetsSheet from '../components/PocketAssetsSheet'
import usePocketDisplayCurrency from '../hooks/usePocketDisplayCurrency'
import PocketLocalEquivalent from '../components/PocketLocalEquivalent'
import PocketActivityStatusIcon from '../components/PocketActivityStatusIcon'
import { pocketActivityIcon, pocketActivityShortDate } from '../components/pocketActivityIcon'
import PocketHomeAction from '../components/PocketHomeAction'
import { pocketActivityAmount, currentPocketActivityRow } from '../lib/pocketActivityPresentation'
import PocketActivityReceipt from '../components/PocketActivityReceipt'
import type { PocketActivityRow } from '../models/pocketActivity'
import { isIncomingPosPayment, pocketBankRecipientLabel } from '../lib/pocketPurchaseKind'
import PocketWalletUpdateCard from '../components/PocketWalletUpdateCard'
import { pocketWalletPreparationNotice } from '../lib/pocketWalletPreparationNotice'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ChevronRight, Eye, EyeOff, QrCode, Send, Receipt, Deposit } from '../components/PocketIcons'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import usePocketProfile from '../hooks/usePocketProfile'
import { formatPocketDollarAmount } from '../lib/pocketMoney'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'

const BALANCE_VISIBLE_KEY = 'pocket.balanceVisible'
const NETWORKS = [
  { key: 'base', label: 'Base', logo: '/brand/base-logo.jpeg', dark: false },
  { key: 'arbitrum', label: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg', dark: false },
  { key: 'solana', label: 'Solana', logo: '/brand/solana-logo.jpeg', dark: true },
  { key: 'arc', label: 'Arc', logo: '/brand/arc-logo.jpeg', dark: true },
  { key: 'polygon', label: 'Polygon', logo: '/brand/polygon-logo.png', dark: false },
  { key: 'ethereum', label: 'Ethereum', logo: '/brand/ethereum-logo.png', dark: false },
] as const

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'overview' })
  if (tab === 'activity') return pocketPathFor({ section: 'activity', view: 'all' })
  return POCKET_ROUTES.home
}

export default function PocketHomePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  usePocketProfile({ authenticated, email, getAccessToken })
  const usdtRows = POCKET_USDT_NETWORKS.map(network => {
    const row = wallets.displayRows.find(item => item.key === network)
    return {network, balance: row?.usdt ?? 0, known: !authenticated || row?.usdt !== undefined, stale: row?.usdtStale ?? false}
  })
  const usdt = {rows: usdtRows, known: !pocketUsdtEnabled || usdtRows.every(row => row.known), balance: pocketUsdtEnabled ? usdtRows.reduce((sum, row) => sum + row.balance, 0) : 0}
  const activity = usePocketActivity({ authenticated, email, enabled: true, recent: true, getAccessToken })
  const currency = usePocketDisplayCurrency()
  const showNgn = currency !== 'USDC'
  const fx = usePocketFxQuote(1, showNgn, currency === 'UGX' ? 'UGX' : 'NGN', true)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<PocketActivityRow | null>(null)
  const [balanceVisible, setBalanceVisible] = useState(() => window.localStorage.getItem(BALANCE_VISIBLE_KEY) !== 'false')
  const selectedActivityRow = currentPocketActivityRow(selectedActivity, activity.rows)
  const recent = activity.rows.filter(row => !isIncomingPosPayment(row)).slice(0, 4)
  const balancesVisible = !authenticated || (wallets.displayComplete && usdt.known)
  const displayTotal = wallets.displayTotal + usdt.balance
  const activityReady = !authenticated || activity.resolved

  const open = (path: string) => navigate(POCKET_BASE_PATH + path, path===POCKET_ROUTES.xpay?{state:{xpayOrigin:'stablecoins'}}:undefined)
  const toggleBalance = () => setBalanceVisible(current => { window.localStorage.setItem(BALANCE_VISIBLE_KEY, String(!current)); return !current })
  const hidden = '****'

  return <PocketRouteShell active="home" onSelect={tab => open(navPath(tab))}>
    <PocketWalletUpdateCard key={email} notice={pocketWalletPreparationNotice(wallets.walletUpdate, wallets.wallets)} onReview={() => open(POCKET_ROUTES.profile + "?feature=wallet-setup")} />
    <section data-pocket-balance-card className="flex min-h-[272px] flex-col overflow-hidden rounded-[26px] bg-gray-950 px-5 pb-3 pt-4 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
      <div className="relative flex flex-1 items-center justify-center">
        <div className="min-w-0 w-full pt-6 text-center">
          <div className="flex items-center justify-center px-12"><div className="relative">
            <p className="text-sm font-medium text-white/60 dark:text-gray-500">Total balance</p>
            <button type="button" onClick={toggleBalance} className="absolute left-full top-1/2 ml-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-white/65 hover:bg-white/10 dark:text-gray-500 dark:hover:bg-gray-950/[0.06]" aria-label={balanceVisible ? 'Hide balances' : 'Show balances'}>
              {balanceVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div></div>
          <div className="mt-1.5">
            {!balanceVisible || balancesVisible ? <p className="min-w-0 text-[clamp(2rem,10vw,2.75rem)] font-semibold tabular-nums tracking-tight"><span className="relative inline-block"><span data-pocket-total-amount>{balanceVisible ? formatPocketDollarAmount(displayTotal) : hidden}</span>{balanceVisible && <span className="ml-2 text-xs font-medium tracking-normal opacity-60">USD</span>}</span></p> : <span role="status" aria-label="Loading balances" className="mx-auto block h-10 w-44 animate-pulse rounded-xl bg-white/15 dark:bg-gray-950/10" />}
          </div>
          <div className="mt-2 flex h-8 items-center justify-center">
            {balanceVisible && <button type="button" aria-label="Change display currency" aria-haspopup="dialog" aria-expanded={currencyOpen} onClick={() => setCurrencyOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-4 text-xs font-medium tabular-nums transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-gray-950/[0.07] dark:hover:bg-gray-950/10">
              {!showNgn ? 'USD' : balancesVisible && fx.quote ? '~ ' + new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(displayTotal * fx.quote.rate) + ' ' + currency : currency}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>}
          </div>
        </div>
        <div className="absolute right-0 top-0 flex items-center gap-1">
          <button type="button" onClick={() => open(POCKET_ROUTES.scan)} className="flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white dark:text-gray-500 dark:hover:bg-gray-950/[0.06] dark:hover:text-gray-950"><QrCode className="h-5 w-5" /><span className="text-[11px] font-medium">Scan</span></button>
        </div>
      </div>
      <div className="mt-2 flex justify-center">
        <button type="button" aria-haspopup="dialog" aria-expanded={assetsOpen} onClick={() => setAssetsOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-4 text-xs font-medium transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-gray-950/[0.07] dark:hover:bg-gray-950/10">Assets<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </section>


    <section className="grid grid-cols-4 gap-2">
      {[
        { label: 'Send', icon: Send, path: POCKET_ROUTES.transfer },
        { label: 'Bills', icon: Receipt, path: POCKET_ROUTES.bills },
        { label: 'Swap', icon: ArrowLeftRight, path: POCKET_ROUTES.swap },
        { label: 'Receive', icon: Deposit, path: POCKET_ROUTES.receive },
      ].map(item => <PocketHomeAction key={item.label} label={item.label} icon={<item.icon className="h-6 w-6" />} onClick={() => open(item.path)} />)}
    </section>

    <section className="pt-2">
      <div className="flex items-center justify-between"><div><p className="text-base font-semibold text-gray-950 dark:text-white">Recent activity</p></div><button type="button" onClick={() => open(POCKET_ROUTES.activity)} className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">View all<ChevronRight className="h-3.5 w-3.5" /></button></div>
      <div className="mt-3">{!activityReady ? <PocketRecentActivitySkeleton /> : recent.length ? recent.map(row => { const Icon = pocketActivityIcon(row); return <button key={row.eventId + ':' + row.txHash} type="button" onClick={() => setSelectedActivity(row)} className="relative flex w-full items-center gap-3 py-4 text-left after:absolute after:bottom-0 after:left-12 after:right-0 after:h-px after:bg-gray-200/70 last:after:hidden dark:after:bg-white/[0.07]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-900 dark:bg-white/[0.07] dark:text-white"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{pocketBankRecipientLabel(row) || row.activityLabel || row.memo || 'Payment'}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><PocketActivityStatusIcon row={row} />{pocketActivityShortDate(row.ts)}</span></span><span className="shrink-0 whitespace-nowrap text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">{row.direction === 'in' || ['refunded', 'reversed'].includes(String(row.paycrestStatus ?? '').toLowerCase()) || row.refundTxHash ? '+' : '-'}{pocketActivityAmount(row)}{(!row.assetSymbol || row.assetSymbol === 'USDC') && row.source !== 'wallet-swap' && <PocketLocalEquivalent recordedAmount={row.amountNgn} recordedCurrency={row.fiatCurrency} amount={Number(row.amount)} className="mt-1 block text-right text-xs font-normal text-gray-500 dark:text-gray-400" />}</span></button>}) : <p className="py-8 text-center text-xs font-medium text-gray-500 dark:text-gray-400">{activity.error || 'Your completed payments will appear here.'}</p>}</div>
    </section>
    {currencyOpen && <PocketDisplayCurrencyPicker current={currency} busy={false} error="" onBack={() => setCurrencyOpen(false)} onSelect={async next => { savePocketDisplayCurrency(email, next); return true }} />}
    {assetsOpen && <PocketAssetsSheet total={displayTotal} complete={balancesVisible} visible={balanceVisible} onClose={() => setAssetsOpen(false)} holdings={[...NETWORKS.map(network => {
      const row = wallets.displayRows.find(item => item.key === network.key)
      return {id:'USDC:'+network.key,symbol:'USDC',icon:'/brand/usdc-circle-logo.png',network:network.label,networkIcon:network.logo,quantity:row?.balance ?? 0,valueUsd:row?.balance ?? 0,known:!authenticated || Boolean(row?.known),stale:row?.stale}
    }), ...(pocketUsdtEnabled ? usdt.rows.map(row => {const network=NETWORKS.find(item=>item.key===row.network)!;return {id:'USDT:'+row.network,symbol:'USDT',icon:'/brand/usdt.svg',network:network.label,networkIcon:network.logo,quantity:row.balance,valueUsd:row.balance,known:row.known,stale:row.stale}}) : [])]} />}
    {selectedActivityRow && <PocketActivityReceipt row={selectedActivityRow} onClose={() => setSelectedActivity(null)} />}
  </PocketRouteShell>
}

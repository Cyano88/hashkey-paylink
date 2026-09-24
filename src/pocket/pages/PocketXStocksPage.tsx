import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, ChevronRight, Deposit, Eye, EyeOff, History, RequestMoney, Search, Send, UserRound, Wallet } from '../components/PocketIcons'
import { PocketSkeletonBar } from '../components/PocketContentSkeletons'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'
import PocketStockActivity from '../components/PocketStockActivity'
import PocketStockTransferMenu from '../components/PocketStockTransferMenu'
import PocketXPay from '../components/PocketXPay'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { QrCode } from '../components/PocketIcons'
import PocketStockTrade from '../components/PocketStockTrade'
import PocketStockWalletActions from '../components/PocketStockWalletActions'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import { stockQuantity, stockUsdc, stockGasAsset } from '../lib/pocketXStocksWallet'
import PocketStockNotifications from '../components/PocketStockNotifications'
import PocketFlowHeader from '../components/PocketFlowHeader'
import usePocketStockCurrency from '../hooks/usePocketStockCurrency'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import PocketRouteShell from '../components/PocketRouteShell'
import type { PocketNavTab } from '../components/PocketBottomNav'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import usePocketStockQuotes, { type StockQuote } from '../hooks/usePocketStockQuotes'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import ranking from '../lib/pocketXStocksRanking.json'
import catalogue from '../lib/pocketXStocksCatalog.json'
import { xStockNavPath, xStockPath, type XStockView } from '../lib/pocketRail'

type Asset = Pick<typeof catalogue.assets[number], 'symbol' | 'name' | 'address' | 'icon'>
const card = 'rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none'
const featuredSymbols = ['NVDAx', 'AAPLx', 'TSLAx', 'MSFTx', 'GOOGLx', 'AMZNx', 'METAx', 'SPYx']
const featured = featuredSymbols.flatMap(symbol => catalogue.assets.filter(asset => asset.symbol === symbol))
const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

function AssetRow({ asset, quote, busy, quantity, quantityLoading, onOpen, formatValue = dollars, usdcRate }: { usdcRate?: number; formatValue?: (value: number) => string; quantity?: string | null; quantityLoading?: boolean; asset: Asset; quote?: StockQuote; busy: boolean; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  return <button type="button" onClick={onOpen} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[10px] font-black dark:bg-white/10">{!imageFailed ? <img src={asset.icon} onError={() => setImageFailed(true)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : asset.symbol.slice(0, 3)}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{asset.name}</span><span className="mt-1 block text-[10px] text-gray-400">{asset.symbol}</span></span>
    <span className="shrink-0 text-right"><span className="block text-xs font-bold tabular-nums">{quantity !== undefined ? quantityLoading ? <PocketSkeletonBar className="h-3 w-16" /> : quantity == null ? 'Unavailable' : formatStockQuantity(quantity) : quote ? formatValue(quote.usd) : busy ? <PocketSkeletonBar className="h-3 w-16" /> : '—'}</span>{quantity !== undefined && !quantityLoading && quantity != null && <span className="mt-1 block text-[10px] text-gray-400">{Number(quantity) === 0 ? '0 USDC' : quote && usdcRate ? '≈ ' + formatStockQuantity(Number(quantity) * quote.usd / usdcRate) + ' USDC' : busy ? <PocketSkeletonBar className="ml-auto h-2 w-14" /> : ''}</span>}{quantity === undefined && <span className={`mt-1 block text-[10px] tabular-nums ${quote?.change != null ? quote.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' : 'text-gray-400'}`}>{quote?.change != null ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%` : busy ? <PocketSkeletonBar className="ml-auto mt-2 h-2 w-10" /> : ''}</span>}</span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
  </button>
}

export default function PocketXStocksPage({ view }: { view: Exclude<XStockView, 'account' | 'verify-name'> }) {
  const navigate = useNavigate()
  const wallet = usePocketStockWallet()
  const [params, setParams] = useSearchParams()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const stockCurrency = usePocketStockCurrency(email)
  const fx = usePocketFxQuote(1, stockCurrency.currency === 'NGN')
  const freshFx = fx.quote && !fx.quote.stale && fx.quote.expiresAt > Date.now() ? fx.quote.rate : null
  const formatValue = (value: number) => stockCurrency.currency === 'NGN' ? freshFx ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value * freshFx) : '—' : dollars(value)
  const [holdingQuery, setHoldingQuery] = useState('')
  const [holdingLimit, setHoldingLimit] = useState(8)
  const snapshot = wallet.displaySnapshot || wallet.snapshot
  const held = (snapshot?.holdings || []).filter(h => (h.asset.name + ' ' + h.asset.symbol + ' ' + h.asset.address).toLowerCase().includes(holdingQuery.trim().toLowerCase()))
  const [query, setQuery] = useState('')
  const [balanceVisible, setBalanceVisible] = useState(() => localStorage.getItem('pocket.balanceVisible') !== 'false')
  const selected = catalogue.assets.find(a => a.symbol === params.get('asset'))
  const filtered = useMemo(() => catalogue.assets.filter(a => (a.name + ' ' + a.symbol + ' ' + a.address).toLowerCase().includes(query.trim().toLowerCase())), [query])
  useEffect(() => { setQuery('') }, [view])
  const list = view === 'home' ? featured : query.trim() ? filtered : ranking.symbols.flatMap(symbol => catalogue.assets.filter(a => a.symbol === symbol))
  const quoteAssets = selected ? [selected] : view === 'portfolio' || view === 'home' ? snapshot?.holdings.map(h => h.asset) || [] : view === 'market' ? list : []
  const quotes = usePocketStockQuotes([...new Set([...quoteAssets.map(a => a.address), ...((view === 'home' || view === 'portfolio') && snapshot?.holdings.length ? [stockUsdc.address] : [])])])
  const displayQuotes = !selected && (view === 'home' || view === 'portfolio') ? quotes.displayQuotes : quotes.quotes
  const usdcRate = displayQuotes[stockUsdc.address.toLowerCase()]?.usd
  const displayStale = wallet.balanceStale || quotes.stale
  const lastObserved = Math.min(snapshot?.observedAt || Date.now(), ...Object.values(quotes.displayQuotes).map(q => q.fetchedAt))
  const showLastUpdated = displayStale && Date.now() - lastObserved >= 120_000
  const lastUpdated = 'Last updated ' + new Date(lastObserved).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  const stockTotal = snapshot?.complete && snapshot.holdings.every(h => !!displayQuotes[h.asset.address.toLowerCase()]) ? snapshot.holdings.reduce((sum, h) => sum + Number(stockQuantity(h.units, h.decimals)) * displayQuotes[h.asset.address.toLowerCase()].usd, 0) : null
  const active: PocketNavTab = view === 'market' || view === 'trade' ? 'bills' : view === 'portfolio' ? 'profile' : view === 'activity' ? 'activity' : 'home'
  const openAsset = (asset: Asset) => navigate(xStockPath('market') + '?asset=' + encodeURIComponent(asset.symbol))
  const isAction = ['send', 'receive', 'request'].includes(view)
  const actionLabel = view === 'send' ? 'Send stocks' : view === 'receive' ? 'Receive stocks' : 'Request stocks'
  const balance = <section data-pocket-balance-card className="overflow-hidden rounded-[26px] bg-gray-950 px-5 py-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
    <div className="flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Total stock value</p><button type="button" aria-label={balanceVisible ? 'Hide balances' : 'Show balances'} onClick={() => setBalanceVisible(current => { localStorage.setItem('pocket.balanceVisible', String(!current)); return !current })} className="flex h-8 w-8 items-center justify-center rounded-full">{balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button aria-label="Scan to pay" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.scan + '?rail=xstocks')} className="ml-auto flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2"><QrCode className="h-5 w-5" /><span className="text-[9px] font-semibold">Scan to pay</span></button></div>
    {balanceVisible && stockTotal === null && ((!wallet.ready && !wallet.error) || (wallet.address && ((!snapshot && !wallet.error) || quotes.busy))) ? <span role="status" aria-label="Loading balances" className="mt-1 block h-10 w-44 animate-pulse rounded-xl bg-white/15 motion-reduce:animate-none dark:bg-gray-950/10" /> : balanceVisible && stockTotal === null ? <p className="mt-3 text-sm font-medium opacity-60">{wallet.ready && !wallet.address ? 'Open your XStocks wallet' : 'Balance unavailable'}</p>: <p className="mt-1 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tracking-tight">{balanceVisible ? stockTotal === null ? '—' : formatValue(stockTotal) : '....'} <span className="text-xs font-medium tracking-normal opacity-50">{stockCurrency.currency === 'NGN' ? 'NGN' : 'USD'}</span></p>}
    <p className="mt-3 text-[11px] opacity-55">{wallet.address ? showLastUpdated ? lastUpdated : 'X Layer' : 'Open your XStocks wallet'}</p>
  </section>
  const market = <section className={card}>
    {view === 'home' && <div className="flex items-center justify-between"><h2 className="text-sm font-black">Stocks</h2><button type="button" onClick={() => navigate(xStockPath('market'))} className="flex min-h-11 items-center gap-1 text-[11px] font-bold text-gray-500">View all<ChevronRight className="h-3.5 w-3.5" /></button></div>}
    {view !== 'home' && <label className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 dark:bg-white/[0.06]"><Search className="h-4 w-4 text-gray-400" /><input aria-label="Search stocks" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, symbol or contract" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>}
    <div className="mt-3 divide-y divide-gray-100 dark:divide-white/[0.05]">{list.map(asset => <AssetRow usdcRate={usdcRate} formatValue={formatValue} key={asset.symbol} asset={asset} quote={displayQuotes[asset.address.toLowerCase()]} busy={quotes.busy} quantity={view === 'home' ? (() => { const h = snapshot?.holdings.find(h => h.asset.address === asset.address); return h ? stockQuantity(h.units, h.decimals) : snapshot?.complete || (wallet.ready && !wallet.address) ? '0' : null })() : undefined} quantityLoading={view === 'home' && ((!wallet.ready && !wallet.error) || (!!wallet.address && !snapshot && !wallet.error))} onOpen={() => openAsset(asset)} />)}</div>
    {!list.length && <p role="status" className="py-10 text-center text-xs text-gray-400">No stocks match your search.</p>}
  </section>
  return <PocketRouteShell active={active} onSelect={tab => navigate(xStockNavPath(tab))}>
    <div className="pocket-stock-page space-y-5 text-gray-950 dark:text-white">
      {selected ? <>
        <PocketFlowHeader title="Stock" onBack={() => setParams({})} />
        <section className={card}><p className="text-xs text-gray-400">{selected.symbol} · X Layer</p><h1 className="mt-2 text-2xl font-bold">{selected.name}</h1><p className="mt-5 text-3xl font-bold">{displayQuotes[selected.address.toLowerCase()] ? formatValue(displayQuotes[selected.address.toLowerCase()].usd) : quotes.busy ? <PocketSkeletonBar className="h-9 w-32" /> : '—'}</p><p className="mt-2 text-xs text-gray-400">{quotes.busy ? '' : displayQuotes[selected.address.toLowerCase()] ? 'Indicative price · OKX' : 'Price unavailable'}</p>
<div className="mt-6 grid grid-cols-2 gap-3">{(['buy', 'sell'] as const).map(mode => <button key={mode} type="button" onClick={() => navigate(xStockPath('trade') + '?' + mode + '=' + encodeURIComponent(selected.symbol))} className="min-h-12 rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">{mode === 'buy' ? 'Buy' : 'Sell'}</button>)}</div></section>
        <section className={card}><h2 className="text-sm font-bold">Asset details</h2><p className="mt-4 text-[10px] text-gray-400">X Layer contract</p><p className="mt-1 break-all font-mono text-[11px]">{selected.address}</p><a href={'https://www.oklink.com/x-layer/evm/token/' + selected.address} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-gray-500">View on explorer<ChevronRight className="ml-1 h-3.5 w-3.5" /></a></section>
      </> : view === 'home' ? <>
        {balance}
        <section className="grid grid-cols-4 gap-2">{([{ label: 'Send', icon: Send, view: 'send' }, { label: 'Receive', icon: Deposit, view: 'receive' }, { label: 'Trade', icon: ArrowLeftRight, view: 'trade' }, { label: 'XPay', icon: RequestMoney, view: 'xpay' }] as const).map(action => <button key={action.view} type="button" onClick={() => navigate(xStockPath(action.view))} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-1 text-[10px] font-bold shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none"><action.icon className="h-5 w-5" />{action.label}</button>)}</section>
        {market}
      </> : view === 'xpay' ? <PocketXPay wallet={wallet} /> : view === 'trade' ? <><PocketFlowHeader title="Trade" onBack={()=>navigate(xStockPath('home'))}/><PocketStockTrade key={params.toString()} wallet={wallet} initialAsset={params.get('buy') || params.get('sell') || undefined} initialMode={params.has('sell') ? 'sell' : 'buy'} /></> : view === 'market' ? <>
        {market}
      </> : view === 'portfolio' ? <>
        <section className={card}>
          <div className="flex items-center justify-between"><h2 className="text-sm font-black">Your holdings</h2>{snapshot && <span className="text-[11px] text-gray-400">{snapshot.holdings.length}</span>}</div>
          {showLastUpdated && snapshot && <p className="mt-2 text-[10px] text-gray-400">{lastUpdated}</p>}
          {!!snapshot && snapshot.holdings.length > 8 && <label className="mt-3 flex items-center gap-2 rounded-xl bg-gray-100 px-3 dark:bg-white/[0.06]"><Search className="h-4 w-4 text-gray-400" /><input aria-label="Search holdings" value={holdingQuery} onChange={e => {setHoldingQuery(e.target.value);setHoldingLimit(8)}} placeholder="Search your holdings" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>}
          {!wallet.address ? <button type="button" disabled={!wallet.ready || wallet.busy} onClick={wallet.connect} className="mt-5 min-h-12 w-full rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">{wallet.busy ? 'Opening...' : 'Open wallet'}</button> : !snapshot ? <div role="status" aria-label="Loading holdings" className="mt-4">{wallet.error ? <p className="text-xs text-gray-400">Holdings unavailable</p> : <PocketRecentActivitySkeleton />}</div> : held.length ? <div className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.05]">{held.slice(0,holdingLimit).map(h => <AssetRow key={h.asset.address} asset={h.asset} quantity={stockQuantity(h.units,h.decimals)} quote={displayQuotes[h.asset.address.toLowerCase()]} usdcRate={usdcRate} busy={quotes.busy} onOpen={() => openAsset(h.asset)} />)}</div> : <p className="py-8 text-center text-xs text-gray-400">{holdingQuery ? 'No holdings match your search.' : 'No stock holdings yet.'}</p>}
          {held.length > holdingLimit && <button type="button" onClick={() => setHoldingLimit(n => n + 8)} className="mt-2 min-h-11 w-full text-xs font-bold">Show more ({held.length - holdingLimit})</button>}
          {holdingLimit > 8 && <button type="button" onClick={() => setHoldingLimit(8)} className="min-h-11 w-full text-xs text-gray-400">Show less</button>}
        </section>
        <section className={card}><div className="flex items-center justify-between"><h2 className="text-sm font-black">Cash &amp; gas</h2><button type="button" onClick={() => navigate(xStockPath('receive'))} className="min-h-11 text-xs font-bold">Deposit</button></div>
          {[stockUsdc,stockGasAsset].map(asset => <div key={asset.symbol} className="flex min-h-16 items-center gap-3 py-2"><img src={asset.icon || '/brand/usdc-circle-logo.png'} alt="" className="h-9 w-9 rounded-full" /><span className="flex-1"><span className="block text-xs font-bold">{asset.symbol}</span><span className="mt-1 block text-[10px] text-gray-400">{asset.symbol === 'USDC' ? 'Available to trade' : 'Network fees'}</span></span><span className="text-xs font-bold tabular-nums">{snapshot ? asset.symbol === 'USDC' ? snapshot.cash == null ? 'Unavailable' : formatStockQuantity(stockQuantity(snapshot.cash,6)) : formatStockQuantity(stockQuantity(snapshot.gas,18)) : wallet.error ? 'Unavailable' : <PocketSkeletonBar className="h-3 w-16" />}</span></div>)}
          {showLastUpdated && snapshot && <p className="mt-2 text-[10px] text-gray-400">{lastUpdated}</p>}
        </section>
        <section className={card}><h2 className="text-sm font-black">Pocket account</h2><button type="button" onClick={() => navigate(xStockPath('account'))} className="mt-3 flex min-h-14 w-full items-center gap-3 text-left"><UserRound className="h-5 w-5 text-gray-400" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">ID:{profile.profile?.pocketId || '—'}</span><span className="mt-1 block text-[11px] text-gray-400">Profile, security and settings</span></span><ChevronRight className="h-4 w-4 text-gray-400" /></button></section>
      </> : view === 'notifications' ? <><PocketFlowHeader title="Notifications" onBack={() => navigate(xStockPath('home'))} /><PocketStockNotifications /></> : view === 'activity' ? <PocketStockActivity wallet={wallet}/> : isAction ? ((view==='send'||view==='receive')&&!params.has('mode')&&!params.has('recipient') ? <PocketStockTransferMenu kind={view}/> : <><PocketFlowHeader title={actionLabel} onBack={()=>navigate(xStockPath(view==='request'?'receive':view as 'send'|'receive'))}/>{view==='send'&&params.get('mode')==='pocket'?<p className="py-8 text-center text-sm text-gray-500">Free Pocket ID transfers are not available yet.</p>:<PocketStockWalletActions key={view+params.toString()} wallet={wallet} view={view as 'send' | 'receive' | 'request'}/>}</>) : null}
    </div>
  </PocketRouteShell>
}

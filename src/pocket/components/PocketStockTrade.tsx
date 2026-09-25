import { useEffect, useRef, useState } from 'react'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { stockSwapRequest } from '../api/pocketStockSwapClient'
import { swapAssets, stockUsdc, type StockSwapQuote } from '../lib/pocketXStocksSwap'
import PocketArcTokenPicker, { type ArcPickerToken } from './PocketArcTokenPicker'
import { stockPickerTokens } from '../lib/pocketStockPickerTokens'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { stockQuantity, stockAssets } from '../lib/pocketXStocksWallet'
import { PocketSkeletonBar } from './PocketContentSkeletons'
import PocketStockTradeProgress, { type StockTradeProgress } from './PocketStockTradeProgress'
import { stockSubmissionError, type StockTradeStage } from '../lib/pocketStockSubmission'
import PocketStockWalletActions from './PocketStockWalletActions'

const card = 'rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212]'
const field = 'mt-2 min-h-12 w-full rounded-xl bg-gray-100 px-3 text-xs outline-none dark:bg-white/10'
const button = 'min-h-12 w-full rounded-xl bg-black px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-black dark:text-white'
export default function PocketStockTrade({ wallet, initialAsset, initialMode = 'buy', swapRequest = stockSwapRequest }: { swapRequest?:typeof stockSwapRequest; wallet: ReturnType<typeof usePocketStockWallet>; initialAsset?: string; initialMode?: 'buy' | 'sell' | 'swap' }) {
  const { getAccessToken } = usePocketIdentity()
  const [mode, setMode] = useState(initialMode)
  const [stock, setStock] = useState(stockAssets.some(a => a.symbol === initialAsset) ? initialAsset! : 'NVDAx')
  const [from, setFrom] = useState(stockUsdc.address)
  const [to, setTo] = useState(stockAssets.find(a => a.symbol === 'NVDAx')!.address)
  const [amount, setAmount] = useState('')
  const [review, setReview] = useState<{ key: string; quote: StockSwapQuote; quoteToken: string } | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const watchingTrade = useRef(false)
  const [reconnectWallet, setReconnectWallet] = useState(false)
  const [progress, setProgress] = useState<StockTradeProgress>({stage:'idle',prepared:false,submitted:false})
  const [now, setNow] = useState(Date.now())
  const chosen = stockAssets.find(a => a.symbol === stock)!
  const tokenIn = mode === 'buy' ? stockUsdc : mode === 'sell' ? chosen : swapAssets.find(a => a.address === from)!
  const tokenOut = mode === 'buy' ? chosen : mode === 'sell' ? stockUsdc : swapAssets.find(a => a.address === to)!
  const requestKey = [wallet.address, tokenIn.address, tokenOut.address, amount.trim()].join(':')
  const current = review?.key === requestKey && (busy || review.quote.expiresAt > now) ? review : null
  const validAmount = /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount.trim()) && Number(amount) > 0 && amount.length <= 80
  useEffect(() => { if (!busy && !reconnectWallet) setError('') }, [requestKey])
  useEffect(() => {
    if (watchingTrade.current && wallet.pending?.kind === 'trade' && wallet.pending.status === 'confirmed') {
      watchingTrade.current = false
      setProgress({stage:'completed',prepared:true,submitted:true});setReview(null);setAmount('');setError('')
    } else if (watchingTrade.current && wallet.pending?.kind === 'trade' && wallet.pending.status === 'failed') {
      watchingTrade.current = false
      setProgress(previous=>({...previous,stage:'failed'}));setError('The transaction reverted. Your trade did not complete.')
    }
  }, [wallet.pending?.hash,wallet.pending?.status])
  useEffect(() => {
    let cancelled = false
    setQuoting(false)
    if (!wallet.address || !validAmount || tokenIn.address === tokenOut.address || busy || wallet.uncertain || wallet.pending?.status === 'pending') return
    setQuoting(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await swapRequest(getAccessToken, { action: 'quote', wallet: wallet.address!, tokenIn: tokenIn.address, tokenOut: tokenOut.address, amount: amount.trim() })
        if (!cancelled) { setNow(Date.now()); setReview({ ...response, key: requestKey }) }
      } catch (e) { if (!cancelled) { setReview(null); setError(e instanceof Error ? e.message : 'Quote unavailable.') } }
      finally { if (!cancelled) setQuoting(false) }
    }, 650)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [requestKey, revision, busy, wallet.uncertain, wallet.pending?.status])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const refresh = window.setInterval(() => { if (document.visibilityState === 'visible') setRevision(n => n + 1) }, 30_000)
    return () => { window.clearInterval(timer); window.clearInterval(refresh) }
  }, [])
  const tokens = stockPickerTokens(wallet.displaySnapshot || wallet.snapshot)
  const picker = (label: string, value: string, excluded: string, stocksOnly: boolean, change: (token: ArcPickerToken) => void) => <PocketArcTokenPicker label={label} value={value} excluded={excluded} tokens={stocksOnly ? tokens.filter(t => stockAssets.some(a => a.address === t.address)) : tokens} disabled={busy || wallet.busy} networkLabel="X Layer" clean initialLimit={100} balancesLoading={!wallet.displaySnapshot && !wallet.snapshot && !wallet.error} onChange={change} discover={async () => { throw Error('This contract is not in the supported XStocks list.') }} />
  const confirm = async () => {
    if (!current || busy || quoting || current.quote.expiresAt <= Date.now()) return
    setBusy(true); setError(''); setReconnectWallet(false); watchingTrade.current = true
    const onProgress = (stage: StockTradeStage) => {
      setProgress(previous => ({stage,prepared:stage==='preparing'?false:previous.prepared || ['processing','confirming','completed'].includes(stage),submitted:stage==='preparing'?false:previous.submitted || ['confirming','completed'].includes(stage)}))
      if(stage==='completed'){setReview(null);setAmount('')}
    }
    try { await wallet.trade(current.quote, current.quoteToken, onProgress) }
    catch (e) { const failure=stockSubmissionError(e);setReconnectWallet(!!failure.reconnectWallet || !!(e as {reconnectWallet?:boolean})?.reconnectWallet);setError((e as {transactionPending?:boolean})?.transactionPending ? '' : failure.message);setReview(null);setProgress(previous=>({...previous,stage:(e as {transactionPending?:boolean})?.transactionPending?'confirming':'failed'})) }
    finally { setBusy(false) }
  }
  if (!wallet.address) return <PocketStockWalletActions wallet={wallet} view="receive" />
  return <section className={card}>
    <div className="mb-5 grid grid-cols-3 gap-2">{(['buy', 'sell', 'swap'] as const).map(value => <button key={value} type="button" disabled={busy || wallet.pending?.status==='pending'} aria-pressed={mode === value} onClick={() => setMode(value)} className={'min-h-10 rounded-full text-xs font-bold ' + (mode === value ? 'bg-gray-950 text-white dark:bg-black dark:text-white' : 'text-gray-400')}>{value === 'buy' ? 'Buy' : value === 'sell' ? 'Sell' : 'Swap'}</button>)}</div>
      {mode !== 'swap' ? <div className="mb-4"><p className="mb-2 text-xs text-gray-500">Stock</p>{picker('Select stock', chosen.address, '', true, t => setStock(t.symbol))}</div> : <div className="mb-4 grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-xs text-gray-500">From</p>{picker('From asset', from, to, false, t => setFrom(t.address))}</div>
        <div><p className="mb-2 text-xs text-gray-500">To</p>{picker('To asset', to, from, false, t => setTo(t.address))}</div>
      </div>}
      <p className="mb-2 text-[11px] text-gray-400">{wallet.balanceStale ? 'Last known' : 'Available'} · {tokens.find(t => t.address === tokenIn.address)?.balance == null ? '\u2014' : formatStockQuantity(tokens.find(t => t.address === tokenIn.address)!.balance!)} {tokenIn.symbol}</p>
      <label className="mb-2 block text-[11px] text-gray-400">Amount in {tokenIn.symbol}<input className={field} disabled={busy} inputMode="decimal" value={amount} onChange={e => {setAmount(e.target.value);if(!busy)setProgress({stage:'idle',prepared:false,submitted:false})}} placeholder="0.00" /></label>
      <div aria-live="polite" className={(current || quoting ? "mb-3 " : "") + "space-y-1 text-[11px] leading-5 text-gray-400"}>
        {current ? <>
          <p className="text-sm font-semibold leading-6 text-gray-700 dark:text-gray-200">Est. {formatStockQuantity(current.quote.expectedOut)} {tokenOut.symbol}</p>
          <details><summary className="cursor-pointer">Fees · ≈ {formatStockQuantity(current.quote.gasFee)} OKB network</summary>
            <p>Minimum {current.quote.minimumOut} {tokenOut.symbol} · 0.5% slippage</p>
            {current.quote.positiveSlippageFee && <p>OKX retains price improvement above the quote, capped at {current.quote.positiveSlippageFee.capPercent}% of output.</p>}
          </details>
        </> : quoting ? <div role="status" aria-label="Getting estimate" className="space-y-2 py-1"><PocketSkeletonBar className="h-3 w-36" /><PocketSkeletonBar className="h-2.5 w-24" /></div> : null}
      </div>
      <PocketStockTradeProgress progress={progress} />
      <button type="button" className={button} disabled={reconnectWallet || busy || quoting || !current || wallet.busy || wallet.uncertain || wallet.pending?.status === 'pending'} onClick={confirm}>{progress.stage === 'completed' ? 'Completed' : progress.stage === 'processing' || progress.stage === 'confirming' ? 'Processing…' : wallet.pending?.status === 'pending' ? 'Confirming…' : mode === 'buy' ? 'Buy ' + tokenOut.symbol : mode === 'sell' ? 'Sell ' + tokenIn.symbol : 'Swap ' + tokenIn.symbol + ' for ' + tokenOut.symbol}</button>
    {wallet.uncertain && !busy && !wallet.busy && <p role="alert" className="mt-4 text-xs text-amber-600">A submission needs review. Check Activity before another trade.</p>}
    {reconnectWallet && <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 w-full text-xs font-bold">Reload Pocket</button>}
    {error && <p role="alert" className="mt-4 text-xs leading-5 text-red-500">{error}</p>}
  </section>
}

import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketSlideAction from './PocketSlideAction'
import PocketBottomSheet from './PocketBottomSheet'
import PocketTransactionSheet from './PocketTransactionSheet'
import { pocketActivityReceipt } from '../lib/pocketReceipt'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { stockNotificationsRequest } from '../api/pocketStockNotificationsClient'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import { stockPickerTokens } from '../lib/pocketStockPickerTokens'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { Copy } from './PocketIcons'
import { prepareStockTransfer, stockAssets, stockGasAsset, stockUsdc, stockQuantity, type StockTransfer } from '../lib/pocketXStocksWallet'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'

type Wallet = ReturnType<typeof usePocketStockWallet>
const panel = 'rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212]'
const button = 'min-h-12 w-full rounded-xl bg-black px-5 text-xs font-bold text-white disabled:opacity-40 dark:bg-black dark:text-white'
const field = 'min-h-12 w-full rounded-xl bg-gray-100 px-3 text-xs outline-none dark:bg-white/10'
export default function PocketStockWalletActions({ wallet, view }: { wallet: Wallet; view: 'send' | 'receive' | 'request' }) {
  const [params] = useSearchParams()
  const { getAccessToken } = usePocketIdentity()
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [requestSent, setRequestSent] = useState(false)
  const [symbol, setSymbol] = useState(() => [stockUsdc, stockGasAsset, ...stockAssets].some(a => a.symbol === params.get('asset')) ? params.get('asset')! : 'USDC')
  const [recipient, setRecipient] = useState(params.get('recipient') || '')
  const [amount, setAmount] = useState(params.get('amount') || '')
  const [result, setResult] = useState<{amount:string;symbol:string;recipient:string;hash:string;at:number;failed:boolean}|null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [review, setReview] = useState<StockTransfer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reconnectWallet, setReconnectWallet] = useState(false)
  const [copied, setCopied] = useState(false)
  const asset = symbol === 'OKB' ? stockGasAsset : [stockUsdc, ...stockAssets].find(a => a.symbol === symbol)!
  useEffect(() => { setReview(null); setReviewOpen(false); setError('') }, [symbol, recipient, amount, wallet.address, view])
  const tokens = stockPickerTokens(wallet.displaySnapshot || wallet.snapshot)
  const assetPicker = <PocketArcTokenPicker label="Asset to send" value={asset.address} excluded="" tokens={tokens} disabled={busy || wallet.busy} networkLabel="X Layer" clean initialLimit={100} balancesLoading={!wallet.displaySnapshot && !wallet.snapshot && !wallet.error} onChange={t => {setSymbol(t.symbol);setRequestSent(false)}} discover={async () => {throw Error('This contract is not in the supported XStocks list.')}} />
  const pending = wallet.uncertain
  const prepare = async () => {
    if (!wallet.address || busy) return
    setReviewOpen(true); setBusy(true); setError('')
    try { setReview(await prepareStockTransfer(wallet.address, asset, recipient.trim(), amount.trim())) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare this transfer.') }
    finally { setBusy(false) }
  }
  const send = async () => {
    if (!review || busy) return
    setBusy(true); setError('')
    setResult({amount:review.amount,symbol:review.asset.symbol,recipient:review.recipient,hash:'',at:Date.now(),failed:false}); setResultOpen(false)
    try { const hash = await wallet.send(review, {onSubmitted:hash=>setResult(previous=>previous?{...previous,hash}:previous)}); setResult(previous=>previous?{...previous,hash}:previous); setReview(null); setAmount(''); setResultOpen(true) }
    catch (e) { setResult(previous=>previous?{...previous,failed:!(e as {transactionPending?:boolean})?.transactionPending}:previous); setResultOpen(true); setReconnectWallet(!!(e as {reconnectWallet?:boolean})?.reconnectWallet);setError(e instanceof Error ? e.message : 'Could not send. Check Activity before retrying.') }
    finally { setBusy(false) }
  }
  if (!wallet.address) return <section className={panel}><h2 className="text-sm font-bold">Your XStocks wallet</h2><p className="my-4 text-xs leading-5 text-gray-400">Open your Pocket wallet on X Layer to deposit or send assets.</p><button type="button" className={button} disabled={!wallet.ready || wallet.busy} onClick={wallet.connect}>{wallet.busy ? 'Opening...' : 'Open wallet'}</button>{wallet.error && <p role="alert" className="mt-3 text-xs text-red-500">{wallet.error}</p>}</section>
  const createRequest = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await stockNotificationsRequest(getAccessToken, { action: 'create-request', eventId: requestId, pocketId: recipient, token: asset.address, amount }); setRequestSent(true); setRequestId(crypto.randomUUID()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Request could not be sent.') }
    finally { setBusy(false) }
  }
  const matchingPending = result?.hash && wallet.pending?.hash === result.hash ? wallet.pending : null
  const resultState = matchingPending?.status === 'confirmed' ? 'successful' : matchingPending?.status === 'failed' ? 'failed' : result?.failed ? 'failed' : result?.hash || wallet.uncertain || busy ? 'pending' : 'pending'
  const resultReceipt = result?.hash ? pocketActivityReceipt({eventId:result.hash,txHash:result.hash,chain:'xlayer',payer:wallet.address,recipient:result.recipient,amount:result.amount,assetSymbol:result.symbol,memo:'Sent',ts:result.at,source:'wallet-withdrawal',settlementType:'wallet_transfer',direction:'out',paycrestStatus:resultState === 'successful' ? 'confirmed' : resultState === 'failed' ? 'failed' : 'submitted'}, {allowPending:true}) : null
  return <section className={panel}>
    {resultOpen && result && <PocketTransactionSheet title="Outgoing" state={resultState} amount={formatStockQuantity(result.amount)+' '+result.symbol} receipt={resultReceipt} detail={resultState==='failed'?error:resultState==='pending'?'Waiting for confirmation. You can check Activity for updates.':undefined} onDone={()=>{setResultOpen(false);setReviewOpen(false);setReview(null);setAmount('');setRecipient('');setError('')}}/>}
    {view === 'request' ? <><h2 className="text-sm font-bold">Request assets</h2><label className="mt-5 block text-xs text-gray-400">Pocket ID<input aria-label="Request from Pocket ID" className={field + ' mt-2 w-full'} inputMode="numeric" value={recipient} onChange={e => {setRecipient(e.target.value.replace(/\D/g, '').slice(0,12)); setRequestSent(false)}} /></label><div className="mt-4"><p className="mb-2 text-xs text-gray-400">Asset</p>{assetPicker}</div><label className="mt-4 block text-xs text-gray-400">Amount<input className={field + ' mt-2 w-full'} inputMode="decimal" value={amount} onChange={e => {setAmount(e.target.value);setRequestSent(false)}} /></label><button className={button + ' mt-5'} disabled={busy || requestSent || !recipient || !amount} onClick={() => void createRequest()}>{requestSent ? 'Request sent' : busy ? 'Sending request...' : 'Send request'}</button></> : view !== 'send' ? <>
      <h2 className="text-sm font-bold">Deposit on X Layer</h2>
      <p className="mt-3 text-xs leading-5 text-gray-400">Send native USDC, supported stock tokens or OKB to your Pocket address using X Layer only.</p>
      <p className="my-5 break-all rounded-2xl bg-gray-100 p-4 font-mono text-xs dark:bg-white/5">{wallet.address}</p>
      <button type="button" className={button} onClick={async () => { try { await navigator.clipboard.writeText(wallet.address!); setCopied(true) } catch { setError('Could not copy. Select the address above.') } }}><Copy className="mr-2 inline h-4 w-4" />{copied ? 'Copied' : 'Copy deposit address'}</button>
      <p className="mt-4 text-xs leading-5 text-gray-400">Keep a small amount of OKB for X Layer network fees.</p>
    </> : <>
      <h2 className="mb-5 text-sm font-bold">Send on X Layer</h2>
      <div className="mb-4"><p className="mb-2 text-[11px] text-gray-400">Asset</p>{assetPicker}<p className="mt-2 text-[11px] text-gray-400">{wallet.balanceStale ? 'Last known' : 'Available'} - {tokens.find(t => t.address === asset.address)?.balance == null ? '\u2014' : formatStockQuantity(tokens.find(t => t.address === asset.address)!.balance!)} {asset.symbol}</p></div>
      <label className="mb-4 block text-[11px] text-gray-400">Recipient<input className={field + ' mt-2'} autoComplete="off" spellCheck={false} placeholder="0x..." value={recipient} onChange={e => setRecipient(e.target.value)} /></label>
      <label className="mb-5 block text-[11px] text-gray-400">Amount<input className={field + ' mt-2'} inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <button type="button" className={button} disabled={busy || wallet.busy || pending || !recipient || !amount || reviewOpen || resultOpen} onClick={()=>void prepare()}>Review send</button>
    </>}
    {reviewOpen && !resultOpen && <PocketBottomSheet title="Review send" showCloseButton dismissOnBackdrop={false} dismissible={!busy && !wallet.busy} onClose={()=>{setReviewOpen(false);setReview(null)}}>
      <PocketConfirmationDetails amount={(review?.amount || amount) + ' ' + (review?.asset.symbol || asset.symbol)} rows={[
        ['Wallet address', <span className="break-all">{review?.recipient || recipient}</span>], ['Network', 'X Layer'], ...(review ? [['Network estimate', stockQuantity(review.fee, 18) + ' OKB'] as [string,string]] : []),
      ]} />
      <PocketSlideAction approvalRequired={false} onPrepare={async()=>{}} status={busy || wallet.busy ? 'pending' : 'idle'} disabled={pending || !review} onConfirm={()=>void send()} labels={{idle:'Confirm send',disabled:'Transaction pending',pending:review?'Confirm send':'Checking fees'}} />
      {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
    </PocketBottomSheet>}
    {wallet.uncertain && !busy && !wallet.busy && <p role="alert" className="mt-4 text-xs leading-5 text-amber-600">Submission needs review. Check your X Layer wallet activity before another send.</p>}
    {wallet.pending?.status === 'pending' && <a className="mt-5 block break-all text-xs text-gray-500" href={'https://www.oklink.com/x-layer/tx/' + wallet.pending.hash} target="_blank" rel="noreferrer">Transfer pending - View transaction</a>}
    {reconnectWallet && <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 w-full text-xs font-bold">Reload Pocket</button>}
    {!reviewOpen && !resultOpen && (error || wallet.actionError) && <p role="alert" className="mt-4 text-xs leading-5 text-red-500">{error || wallet.actionError}</p>}
    {wallet.balanceError && <p role="status" className="mt-3 text-xs text-gray-500">Balance refresh unavailable. <button type="button" className="underline" disabled={busy || wallet.busy} onClick={()=>void wallet.refresh()}>Retry</button></p>}
  </section>
}

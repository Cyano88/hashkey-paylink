import {formatPocketPaymentAmount} from '../lib/pocketMoney'
import PocketAmountShimmer from './PocketAmountShimmer'
import {isPocketApprovalCancelled} from '../lib/pocketApprovalCancelled'
import PocketAmountKeypad, {pocketAmountKeyDown} from './PocketAmountKeypad'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'
import PocketFundingAction from './PocketFundingAction'
import {fundingShortfall,amountExceedsBalance} from '../lib/pocketFundingShortfall'
import { pocketIdInput } from '../lib/pocketId'
import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketSlideAction from './PocketSlideAction'
import PocketBottomSheet from './PocketBottomSheet'
import PocketTransactionSheet from './PocketTransactionSheet'
import { pocketActivityReceipt } from '../lib/pocketReceipt'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { stockNotificationsRequest } from '../api/pocketStockNotificationsClient'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import { stockPickerTokens } from '../lib/pocketStockPickerTokens'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { Copy } from './PocketIcons'
import { stockAssets, stockGasAsset, stockUsdc, stockUsdt, stockQuantity, type StockTransfer } from '../lib/pocketXStocksWallet'
import { stockTransferGasLabel, xLayerTransferSponsorshipEnabled } from '../lib/pocketXLayerSponsorship'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import {matchStockSendResult} from '../lib/pocketStockSendResult'

type Wallet = ReturnType<typeof usePocketStockWallet>
const panel = 'rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212]'
const button = 'min-h-12 w-full rounded-xl bg-black px-5 text-xs font-bold text-white disabled:opacity-40 dark:bg-black dark:text-white'
const field = 'min-h-12 w-full rounded-xl bg-gray-100 px-3 text-xs outline-none dark:bg-white/10'
export default function PocketStockWalletActions({ wallet, view, stablecoinsOnly = false }: { wallet: Wallet; view: 'send' | 'receive' | 'request'; stablecoinsOnly?: boolean }) {
  const [params] = useSearchParams()
  const { getAccessToken } = usePocketIdentity()
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [requestSent, setRequestSent] = useState(false)
  const [symbol, setSymbol] = useState(() => [stockUsdc, ...(view==='send'?[stockUsdt]:[]), stockGasAsset, ...stockAssets].filter(a=>!stablecoinsOnly || ['USDC','USDT'].includes(a.symbol)).some(a => a.symbol === params.get('asset')) ? params.get('asset')! : 'USDC')
  const [recipient, setRecipient] = useState(params.get('recipient') || '')
  const [amount, setAmount] = useState(params.get('amount') || '')
  const [result, setResult] = useState<{amount:string;symbol:string;recipient:string;hash:string;attemptId?:string;at:number;failed:boolean}|null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [review, setReview] = useState<StockTransfer | null>(null)
  const reviewGeneration=useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reconnectWallet, setReconnectWallet] = useState(false)
  const [copied, setCopied] = useState(false)
  const asset = symbol === 'OKB' ? stockGasAsset : [stockUsdc, stockUsdt, ...stockAssets].find(a => a.symbol === symbol)!
  useEffect(() => { reviewGeneration.current++;setReview(null); setReviewOpen(false); setError('') }, [symbol, recipient, amount, wallet.address, view])
  const tokens = stockPickerTokens(wallet.displaySnapshot || wallet.snapshot,{includeUsdt:view==='send'}).filter(token => !stablecoinsOnly || ['USDC','USDT'].includes(token.symbol))
  const assetPicker = <PocketArcTokenPicker label="Asset to send" value={asset.address} excluded="" tokens={tokens} disabled={busy || wallet.busy} networkLabel="X Layer" clean initialLimit={100} balancesLoading={!wallet.displaySnapshot && !wallet.snapshot && !wallet.error} onChange={t => {setSymbol(t.symbol);setRequestSent(false)}} discover={async () => {throw Error('This contract is not in the supported XStocks list.')}} />
  const fundingAsset = fundingShortfall(error||wallet.actionError,asset.symbol) || (amountExceedsBalance(amount,tokens.find(t=>t.address===asset.address)?.balance,!wallet.balanceStale&&!wallet.balanceError) ? asset.symbol : null)
  const fundingProps={asset:fundingAsset,network:'xlayer' as const,address:wallet.address,locked:busy||wallet.busy||wallet.uncertain||wallet.pending?.status==='pending',onReturn:async()=>{await wallet.refresh();setError('');setReview(null);setReviewOpen(false)},onCancel:()=>{setAmount('');setRecipient('');setReview(null);setReviewOpen(false);setError('')}}
  const pending = wallet.uncertain
  const prepare = async () => {
    if (!wallet.address || busy) return
    setReview(null); setResult(null); setReviewOpen(true); setBusy(true); setError('')
    const generation=reviewGeneration.current
    try { const next=await wallet.prepareTransfer(asset, recipient.trim(), amount.trim());if(generation===reviewGeneration.current)setReview(next) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare this transfer.') }
    finally { setBusy(false) }
  }
  const send = async () => {
    if (!review || busy) return
    setBusy(true); setError('')
    setResult({amount:review.amount,symbol:review.asset.symbol,recipient:review.recipient,hash:'',at:Date.now(),failed:false}); setResultOpen(false)
    try { const hash = await wallet.send(review, {onSubmitted:hash=>setResult(previous=>previous?{...previous,hash}:previous)}); setResult(previous=>previous?{...previous,hash}:previous); setResultOpen(true) }
    catch (e) {
      if ((e as {pocketApprovalNotSubmitted?:boolean})?.pocketApprovalNotSubmitted && isPocketApprovalCancelled(e)) {
        setResult(null); setResultOpen(false); setError(''); return
      }
      setResult(previous=>previous?{...previous,attemptId:(e as {attemptId?:string})?.attemptId,failed:!(e as {transactionPending?:boolean})?.transactionPending}:previous); setResultOpen(true); setReconnectWallet(!!(e as {reconnectWallet?:boolean})?.reconnectWallet);setError(e instanceof Error ? e.message : 'Could not send. Check Activity before retrying.') }
    finally { setBusy(false) }
  }
  if (!wallet.address) return <section className={stablecoinsOnly ? 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain' : panel}><h2 className="text-sm font-bold">Your XStocks wallet</h2><p className="my-4 text-xs leading-5 text-gray-400">Open your XStocks wallet to send or receive.</p><button type="button" className={button} disabled={!wallet.ready || wallet.busy} onClick={wallet.connect}>{wallet.busy ? 'Opening...' : 'Open wallet'}</button>{wallet.error && <p role="alert" className="mt-3 text-xs text-red-500">{wallet.error}</p>}</section>
  const createRequest = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await stockNotificationsRequest(getAccessToken, { action: 'create-request', eventId: requestId, pocketId: recipient, token: asset.address, amount }); setRequestSent(true); setRequestId(crypto.randomUUID()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Request could not be sent.') }
    finally { setBusy(false) }
  }
  const matchingPending = matchStockSendResult(result,wallet.attempts,wallet.pending)
  const resultHash = matchingPending?.hash || result?.hash
  const resultState = matchingPending?.status === 'confirmed' ? 'successful' : matchingPending?.status === 'failed' ? 'failed' : result?.failed ? 'failed' : result?.hash || wallet.uncertain || busy ? 'pending' : 'pending'
  const awaitingResult = !!result && resultState === 'pending'
  const showResult = resultOpen && !awaitingResult
  const resultReceipt = result && resultHash ? pocketActivityReceipt({eventId:resultHash,txHash:resultHash,chain:'xlayer',payer:wallet.address,recipient:result.recipient,amount:result.amount,assetSymbol:result.symbol,memo:'Sent',ts:result.at,source:'wallet-withdrawal',settlementType:'wallet_transfer',direction:'out',paycrestStatus:resultState === 'successful' ? 'confirmed' : resultState === 'failed' ? 'failed' : 'submitted'}, {allowPending:true}) : null
  return <section className={stablecoinsOnly ? 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain' : panel}>
    {showResult && result && <PocketTransactionSheet title="Outgoing" state={resultState} amount={formatStockQuantity(result.amount)+' '+result.symbol} receipt={resultReceipt} detail={resultState==='failed'?error:resultState==='pending'?'Waiting for confirmation. You can check Activity for updates.':undefined} onDone={()=>{setResult(null);setResultOpen(false);setReviewOpen(false);setReview(null);setAmount('');setRecipient('');setError('')}}/>}
    {view === 'request' ? <><h2 className="text-sm font-bold">Request assets</h2><label className="mt-5 block text-xs text-gray-400">Pocket ID<input aria-label="Request from Pocket ID" className={field + ' mt-2 w-full'} inputMode="text" autoCapitalize="none" autoCorrect="off" value={recipient} onChange={e => {setRecipient(pocketIdInput(e.target.value)); setRequestSent(false)}} /></label><div className="mt-4"><p className="mb-2 text-xs text-gray-400">Asset</p>{assetPicker}</div><label className="mt-4 block text-xs text-gray-400">Amount<input className={field + ' mt-2 w-full'} inputMode="decimal" value={amount} onChange={e => {setAmount(e.target.value);setRequestSent(false)}} /></label><button className={button + ' mt-5'} disabled={busy || requestSent || !recipient || !amount} onClick={() => void createRequest()}>{requestSent ? 'Request sent' : busy ? 'Sending request...' : 'Send request'}</button></> : view !== 'send' ? <>
      <h2 className="text-sm font-bold">Deposit on X Layer</h2>
      <p className="mt-3 text-xs leading-5 text-gray-400">Receive USDC, supported stocks or OKB on X Layer only.</p>
      <p className="my-5 break-all rounded-2xl bg-gray-100 p-4 font-mono text-xs dark:bg-white/5">{wallet.address}</p>
      <button type="button" className={button} onClick={async () => { try { await navigator.clipboard.writeText(wallet.address!); setCopied(true) } catch { setError('Could not copy. Select the address above.') } }}><Copy className="mr-2 inline h-4 w-4" />{copied ? 'Copied' : 'Copy deposit address'}</button>
      <p className="mt-4 text-xs leading-5 text-gray-400">{xLayerTransferSponsorshipEnabled ? 'Pocket covers gas for supported USDC and stock transfers. Other actions may require OKB.' : 'Keep some OKB to pay gas.'}</p>
    </> : <>
      {!stablecoinsOnly && <h2 className="mb-5 text-sm font-bold">Send on X Layer</h2>}
      <div className="mb-4"><p className="mb-2 text-[11px] text-gray-400">Asset</p>{assetPicker}<p className="mt-2 text-[11px] text-gray-400">{wallet.balanceStale ? 'Last known' : 'Available'} - {tokens.find(t => t.address === asset.address)?.balance == null ? '\u2014' : (stablecoinsOnly ? formatPocketDisplayAmount(tokens.find(t => t.address === asset.address)!.balance!) : formatStockQuantity(tokens.find(t => t.address === asset.address)!.balance!))} {asset.symbol}</p></div>
      <label className="mb-4 block text-[11px] text-gray-400">Recipient<input className={field + ' mt-2'} autoComplete="off" spellCheck={false} placeholder="0x..." value={recipient} onChange={e => setRecipient(e.target.value)} /></label>
      <label className="mb-5 block text-[11px] text-gray-400">Amount<input className={field + ' mt-2 w-full'} readOnly inputMode="none" onKeyDown={e=>pocketAmountKeyDown(e,amount,setAmount,tokens.find(t=>t.address===asset.address)?.decimals ?? 6)} placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <div style={{visibility:reviewOpen || resultOpen ? 'hidden' : undefined}}><PocketFundingAction flow="transfer" {...fundingProps}><button type="button" className="pocket-cta-primary w-full" disabled={busy || wallet.busy || pending || !recipient || !amount || reviewOpen || resultOpen} onClick={()=>void prepare()}>{stablecoinsOnly?'Continue':'Review send'}</button></PocketFundingAction><PocketAmountKeypad value={amount} onChange={setAmount} decimals={tokens.find(t=>t.address===asset.address)?.decimals ?? 6} disabled={busy || wallet.busy || pending || reviewOpen || resultOpen}/></div>
    </>}
    {reviewOpen && !showResult && <PocketBottomSheet title="Confirm send" showCloseButton dismissOnBackdrop={false} dismissible={!busy && !wallet.busy && !awaitingResult} onClose={()=>{setReviewOpen(false);setReview(null);setError('')}}>
      <PocketConfirmationDetails amount={(['USDC','USDT','USDe','USDG'].includes(review?.asset.symbol || asset.symbol)?formatPocketPaymentAmount(review?.amount || amount):(review?.amount || amount)) + ' ' + (review?.asset.symbol || asset.symbol)} rows={[
        ['Wallet address', <span className="break-all">{review?.recipient || recipient}</span>], ['Network', 'X Layer'], ...(busy && !review ? [['Fee', <PocketAmountShimmer label="Updating fee" />], ['Total', <PocketAmountShimmer label="Updating total" />]] as Array<[string, import('react').ReactNode]> : review?.reimbursement ? [['Fee',(['USDC','USDT','USDe','USDG'].includes(review.asset.symbol)?formatPocketPaymentAmount(stockQuantity(BigInt(review.reimbursement.feeUnits),review.decimals)):stockQuantity(BigInt(review.reimbursement.feeUnits),review.decimals))+' '+review.asset.symbol],['Total',(['USDC','USDT','USDe','USDG'].includes(review.asset.symbol)?formatPocketPaymentAmount(stockQuantity(BigInt(review.reimbursement.totalUnits),review.decimals)):stockQuantity(BigInt(review.reimbursement.totalUnits),review.decimals))+' '+review.asset.symbol]] as [string,string][] : review ? [['Fee', stockTransferGasLabel(review, fee => stockQuantity(fee, 18))] as [string,string]] : [['Fee', 'Unavailable'] as [string,string]]),
      ]} />
      <div className="mt-5"><PocketFundingAction flow="transfer" {...fundingProps}><PocketSlideAction plain approvalRequired={false} loadingContent={busy && !review} onPrepare={async()=>{}} status={busy && !review ? 'idle' : busy || wallet.busy || awaitingResult ? 'pending' : 'idle'} disabled={pending || awaitingResult || busy && !review} onConfirm={()=>void (!review || review.expiresAt<=Date.now() ? prepare() : send())} labels={{idle:!review?'Retry fee quote':'Confirm send',disabled:pending?'Transaction pending':'Confirm send',pending:'Sending'}} /></PocketFundingAction></div>
      {!awaitingResult && !fundingAsset && error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
    </PocketBottomSheet>}
    {!reviewOpen && wallet.uncertain && !busy && !wallet.busy && <p role="alert" className="mt-4 text-xs leading-5 text-amber-600">Check this transfer in Activity before sending again.</p>}
    {!reviewOpen && wallet.pending?.status === 'pending' && <a className="mt-5 block break-all text-xs text-gray-500" href={'https://www.oklink.com/x-layer/tx/' + wallet.pending.hash} target="_blank" rel="noreferrer">Transfer pending - View transaction</a>}
    {reconnectWallet && <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 w-full text-xs font-bold">Reload Pocket</button>}
    {!fundingAsset && !reviewOpen && !resultOpen && (error || wallet.actionError) && <p role="alert" className="mt-4 text-xs leading-5 text-red-500">{error || wallet.actionError}</p>}
    {!reviewOpen && !resultOpen && wallet.balanceError && <p role="status" className="mt-3 text-xs text-gray-500">Could not update your balance. <button type="button" className="underline" disabled={busy || wallet.busy} onClick={()=>void wallet.refresh()}>Retry</button></p>}
  </section>
}

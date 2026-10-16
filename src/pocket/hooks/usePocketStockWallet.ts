import {executeStockGiftFunding} from '../api/pocketStockGiftExecution'
import {stockGiftFundingReview,prepareStockGiftSettlement} from '../api/pocketStockGiftSettlement'
import type {StockGiftIntent} from '../api/pocketStockGiftIntent'
import {validateXPayBankCall,type XPayBankPayment,type XPayBankResponse} from '../lib/pocketXPayBankClient'
import usePocketEmbeddedWallet from './usePocketEmbeddedWallet'
import {sendOutboundBridge,validateOutboundBridge,outboundTokens,type OutboundBridgeReview} from '../api/pocketOutboundBridge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthorizationSignature, useSendTransaction, useWallets } from '@privy-io/react-auth'
import {sendSponsoredTransfer,sponsoredTransferRequest} from '../api/pocketSponsoredTransfer'
import {quoteSponsoredStablecoin,sendSponsoredStablecoin,validateSponsoredStablecoinQuote} from '../api/pocketSponsoredStablecoin'
import {isXLayerSendStablecoin} from '../lib/pocketStockSendMinimum'
import {SponsoredTransferNotSubmitted} from '../lib/pocketSponsoredRequest'
import {reconcileSponsoredStockAttempt} from '../lib/pocketStockSubmission'
import { getAddress, encodeFunctionData, parseAbi, parseUnits, type Address, type Hex } from 'viem'
import { stockSwapRequest } from '../api/pocketStockSwapClient'
import { validateStockSwap, type StockSwapQuote } from '../lib/pocketXStocksSwap'
import { settleStockGiftProof, settleXPaySourceProof, hasStockSubmission, readStockAttempts, STOCK_ATTEMPTS_UPDATED, readStockLast, readStockPending, runStockSubmission, settleStockPending, type StockPending, type StockTradeStage } from '../lib/pocketStockSubmission'
import { ensurePocketXLayerWallet } from '../lib/pocketStockWalletNetwork'
import { registerStockNotifications } from '../api/pocketStockNotificationsClient'
import usePocketStockBalances from './usePocketStockBalances'
import usePocketIdentity from './usePocketIdentity'
import { readStockHoldings, stockClient, stockTokenAbi, prepareStockTransfer, type StockTransfer, type StockHolding } from '../lib/pocketXStocksWallet'
import { requestPocketPaymentApproval, takePocketPaymentApproval } from '../lib/pocketPaymentApproval'

const stockApprovalAbi = parseAbi(['function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'])

export default function usePocketStockWallet(options: {swapRequest?:typeof stockSwapRequest} = {}) {
  const requestSwap=options.swapRequest || stockSwapRequest
  const { authenticated, user, getAccessToken } = usePocketIdentity()
  const { ready, wallets } = useWallets()
  const [walletWaitExpired, setWalletWaitExpired] = useState(false)
  const hasEmbedded=wallets.some(w=>w.walletClientType==='privy')
  useEffect(() => { setWalletWaitExpired(false); if (ready || hasEmbedded) return; const timer = window.setTimeout(() => setWalletWaitExpired(true), 15_000); return () => window.clearTimeout(timer) }, [ready, hasEmbedded])
  const setup=usePocketEmbeddedWallet()
  const { sendTransaction } = useSendTransaction()
  const {generateAuthorizationSignature}=useAuthorizationSignature()
  const embedded = wallets.filter(w => w.walletClientType === 'privy')
  const wallet = authenticated && embedded.length === 1 && setup.address?.toLowerCase()===embedded[0].address.toLowerCase() ? embedded[0] : undefined
  const walletRef = useRef(wallet); walletRef.current = wallet
  const address = authenticated && setup.address ? getAddress(setup.address) : undefined
  useEffect(() => { if (!address || !user?.id) return; const register = () => { void registerStockNotifications(user.id, address, getAccessToken).catch(() => undefined) }; register(); const timer = window.setInterval(register, 60_000); return () => clearInterval(timer) }, [address, user?.id, getAccessToken])
  const ownerKey = user?.id + ':' + (address || '')
  const scope = useRef(ownerKey); scope.current = ownerKey
  const { snapshot, displaySnapshot, balanceStale, balanceError, refresh } = usePocketStockBalances(ownerKey, address, getAccessToken)
  const [uncertain, setUncertain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempts,setAttempts]=useState<StockPending[]>([])
  useEffect(()=>{const reload=()=>setAttempts(readStockAttempts(ownerKey));reload();window.addEventListener(STOCK_ATTEMPTS_UPDATED,reload);return()=>window.removeEventListener(STOCK_ATTEMPTS_UPDATED,reload)},[ownerKey])
  useEffect(()=>{
    if(!address||!authenticated)return
    let stopped=false,running=false
    const recover=async()=>{
      if(stopped||running||inFlight.current||document.visibilityState==='hidden')return
      running=true
      try{for(const r of readStockAttempts(ownerKey).filter(r=>r.relay==='privy'&&r.status==='pending'&&!r.hash)){
        try{const result=await sponsoredTransferRequest({action:'status',wallet:address,attemptId:r.id},getAccessToken);if(!stopped&&result.hash)reconcileSponsoredStockAttempt(r,{hash:result.hash})}
        catch(error){if(!stopped&&error instanceof SponsoredTransferNotSubmitted)reconcileSponsoredStockAttempt(r,{notSubmitted:true})}
      }}finally{running=false;if(!stopped){setUncertain(!!localStorage.getItem('pocket.xstocks.signing:'+ownerKey));setPending(readStockPending(ownerKey)||readStockLast(ownerKey))}}
    }
    void recover();const timer=window.setInterval(()=>void recover(),8000)
    return()=>{stopped=true;window.clearInterval(timer)}
  },[ownerKey,address,authenticated,getAccessToken])
  const [pending, setPending] = useState<StockPending | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    setError('')
    setUncertain(!!localStorage.getItem('pocket.xstocks.signing:' + ownerKey))
    setPending(readStockPending(ownerKey) || readStockLast(ownerKey))
  }, [ownerKey])
  useEffect(() => {
    const outstanding=readStockAttempts(ownerKey).filter(r=>r.status==='pending'&&r.hash)
    if(pending?.status==='pending'&&!outstanding.some(r=>r.hash===pending.hash))outstanding.push(pending)
    if(!outstanding.length)return
    let cancelled = false, checking = false
    const check = async () => {
      if (cancelled || inFlight.current || checking || document.visibilityState === 'hidden' || navigator.onLine === false) return
      checking = true
      try {
        for(const record of outstanding){try{const receipt=await stockClient.getTransactionReceipt({hash:record.hash});if(cancelled)return;const settled=settleStockPending(record,receipt.status==='success');setPending(current=>current?.hash===record.hash?settled:current);void refresh().catch(() => undefined)}catch{/* Retain unknown outcome. */}}
      } catch { /* Missing receipt is pending, never success. */ } finally { checking = false }
    }
    void check()
    const timer = window.setInterval(check, 15000)
    window.addEventListener('focus', check); window.addEventListener('online', check); document.addEventListener('visibilitychange', check)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check) }
  }, [pending?.hash, pending?.status, ownerKey, refresh,attempts])
  const connect = async () => {
    if(!authenticated||busy||setup.busy)return
    if(embedded.length>1){setError('Multiple embedded wallets found. Wallet selection needs review.');return}
    setError('');setup.retry()
  }
  const prepareTransfer=async(asset:StockTransfer['asset'],recipient:string,amount:string):Promise<StockTransfer>=>{
    if(!address)throw Error('Your Pocket wallet is reconnecting.')
    const key=ownerKey,current=()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}
    const review=await prepareStockTransfer(address,asset,recipient,amount)
    current()
    if(!review.sponsored||!isXLayerSendStablecoin(review.to))return review
    const reimbursement=await quoteSponsoredStablecoin(address,{asset:asset.symbol as 'USDC'|'USDT',recipient:review.recipient,amountUnits:review.units.toString()},{getAccessToken,assertCurrent:current})
    const balance=await stockClient.readContract({address:review.to,abi:stockTokenAbi,functionName:'balanceOf',args:[address]})
    current()
    if(balance<BigInt(reimbursement.totalUnits))throw Error('Insufficient '+asset.symbol+' balance including the network fee.')
    return {...review,reimbursement,expiresAt:Math.min(review.expiresAt,reimbursement.expiresAt)}
  }
  const bridgeOutbound=async(review:OutboundBridgeReview,beforeDispatch:()=>void)=>{
    const approved=structuredClone(review),key=ownerKey
    const current=()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}
    if(!wallet||!address||inFlight.current||hasStockSubmission(key))throw new SponsoredTransferNotSubmitted('Wait for your wallet to finish reconnecting or submitting.')
    let dispatched=false
    inFlight.current=true;setBusy(true)
    try{
      validateOutboundBridge(approved,address,approved.quote.destinationAddress,approved.quote.asset,approved.quote.amount)
      await requestPocketPaymentApproval();if(!takePocketPaymentApproval())throw Error('Payment approval expired.')
      current();await ensurePocketXLayerWallet(()=>walletRef.current,address,current);current()
      const balance=await stockClient.readContract({address:outboundTokens[approved.quote.asset],abi:stockTokenAbi,functionName:'balanceOf',args:[address]})
      current();if(balance<parseUnits(approved.quote.total,6))throw Error('Insufficient balance including the network fee.')
      return await sendOutboundBridge(approved,{getAccessToken,assertCurrent:current,sign:generateAuthorizationSignature,beforeDispatch:()=>{current();beforeDispatch();dispatched=true}})
    }catch(error){if(!dispatched&&!(error instanceof SponsoredTransferNotSubmitted))throw new SponsoredTransferNotSubmitted(error instanceof Error?error.message:'Bridge was not sent.');throw error}
    finally{inFlight.current=false;if(scope.current===key)setBusy(false)}
  }
  const send = async (review: StockTransfer, hooks?: {beforeSubmit?:()=>Promise<void>;onSubmitted?:(hash:Hex)=>void}) => {
    if(!wallet)throw Error('Your XStocks wallet is reconnecting. Try again in a moment.')
    if (!address || inFlight.current || !!localStorage.getItem('pocket.xstocks.signing:'+ownerKey)) throw Error('A wallet submission is still being checked in Activity.')
    const key = ownerKey
    if (review.owner !== address || review.expiresAt <= Date.now()) throw Error('This review expired. Review the transfer again.')
    inFlight.current = true; setBusy(true); setError('')
    try {
      await requestPocketPaymentApproval()
      const approval = takePocketPaymentApproval()
      if (!approval) throw Error('Payment approval expired. Please try again.')
      if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed.')
      const fresh = await prepareStockTransfer(address, review.asset, review.recipient, review.amount)
      if (!!fresh.sponsored !== !!review.sponsored) throw Error('Gas payment changed. Review this transfer again.')
      if(fresh.sponsored&&isXLayerSendStablecoin(fresh.to)){
        const q=review.reimbursement
        if(!q||q.owner!==address||q.intent.recipient!==review.recipient||q.intent.amountUnits!==review.units.toString()||q.intent.asset!==review.asset.symbol)throw Error('Review the transfer fee before sending.')
        validateSponsoredStablecoinQuote(q)
        const balance=await stockClient.readContract({address:fresh.to,abi:stockTokenAbi,functionName:'balanceOf',args:[address]})
        if(balance<BigInt(q.totalUnits))throw Error('Insufficient '+review.asset.symbol+' balance including the network fee.')
      }
      if (fresh.fee > review.fee * 120n / 100n) throw Error('Network fee changed. Review this transfer again.')
      await ensurePocketXLayerWallet(() => walletRef.current, address, () => { if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed.') })
      await hooks?.beforeSubmit?.()
      if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed.')
      // Pocket owns review and approval. Privy provides signing without a second transaction modal.
      return await runStockSubmission({key, kind:'send',sponsored:!!fresh.sponsored,attemptId:review.reimbursement?.attemptId,
        details:{recipient:review.recipient,amount:review.amount,symbol:review.asset.symbol,at:Date.now()},
        wait:hash=>stockClient.waitForTransactionReceipt({hash,timeout:30_000}),
        send: attemptId => review.reimbursement ? sendSponsoredStablecoin(review.reimbursement,{getAccessToken,sign:generateAuthorizationSignature,assertCurrent:()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}}) : fresh.sponsored&&fresh.data ? sendSponsoredTransfer({owner:address,to:fresh.to,data:fresh.data,attemptId},{getAccessToken,sign:generateAuthorizationSignature,assertCurrent:()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}}) : sendTransaction({chainId:196,from:address,to:fresh.to,data:fresh.data,value:fresh.value},{address,uiOptions:{showWalletUIs:false}}),
        onPending: next => { if(scope.current===key) {setPending(next);hooks?.onSubmitted?.(next.hash)} },
        onUncertain: value => { if(scope.current===key) setUncertain(value) },
      })
    } finally { inFlight.current = false; setBusy(false) }
  }

  const trade = async (review: StockSwapQuote, quoteToken: string, onProgress: (stage: StockTradeStage) => void = () => {}) => {
    if(!wallet)throw Error('Your XStocks wallet is reconnecting. Try again in a moment.')
    if (!address || inFlight.current || hasStockSubmission(ownerKey) || pending?.status === 'pending') throw Error('Wait for the current transaction to finish.')
    validateStockSwap(review, address)
    const key = ownerKey
    const stillCurrent = () => { if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed. Review the trade again.') }
    inFlight.current = true; setBusy(true); setError('')
    onProgress('preparing')
    const submit = async (to: Address, data: Hex, value = 0n, swapQuote?: StockSwapQuote) => {
      stillCurrent()
      if (await stockClient.getChainId() !== 196) throw Error('X Layer connection could not be verified.')
      await ensurePocketXLayerWallet(() => walletRef.current, address, stillCurrent)
      await stockClient.call({ account: address, to, data, value })
      const gas = await stockClient.estimateGas({ account: address, to, data, value })
      const fee = gas * await stockClient.getGasPrice() * 120n / 100n
      if (await stockClient.getBalance({ address }) < value + fee) throw Error('Add OKB on X Layer for network fees.')
      stillCurrent()
      if (swapQuote) { validateStockSwap(swapQuote, address); if (fee > parseUnits(review.gasFee, 18) * 120n / 100n) throw Error('Network fee changed. Review the updated amount.') }
      return runStockSubmission({key,kind:swapQuote?'trade':'approval',
        send: () => sendTransaction({chainId:196,from:address,to,data,value},{address,uiOptions:{showWalletUIs:false}}),
        wait: hash => stockClient.waitForTransactionReceipt({hash,timeout:120_000}),
        onPending: next => { if(scope.current===key) setPending(next) },
        onUncertain: value => { if(scope.current===key) setUncertain(value) },
        onSubmitted: () => { if(swapQuote) onProgress('confirming') },
      })
    }
    try {
      await requestPocketPaymentApproval()
      if (!takePocketPaymentApproval()) throw Error('Payment approval expired.')
      stillCurrent()
      const verified = await requestSwap(getAccessToken, { action: 'verify', wallet: address, quoteToken })
      validateStockSwap(verified.quote, address)
      if (JSON.stringify(verified.quote) !== JSON.stringify(review)) throw Error('The amount changed. Review it again.')
      const units = BigInt(review.amountUnits)
      if (review.tokenIn.address !== 'native') {
        const token = getAddress(review.tokenIn.address)
        const balance = await stockClient.readContract({ address: token, abi: stockTokenAbi, functionName: 'balanceOf', args: [address] })
        if (balance < units) throw Error('Insufficient ' + review.tokenIn.symbol + ' balance.')
        const allowance = await stockClient.readContract({ address: token, abi: stockApprovalAbi, functionName: 'allowance', args: [address, review.spender] })
        if (allowance < units) {
          if (allowance > 0n) await submit(token, encodeFunctionData({ abi: stockApprovalAbi, functionName: 'approve', args: [review.spender, 0n] }))
          await submit(token, encodeFunctionData({ abi: stockApprovalAbi, functionName: 'approve', args: [review.spender, units] }))
        }
      }
      stillCurrent()
      // Approval can consume quote lifetime. Refresh, but never lower the minimum the user accepted.
      const fresh = await requestSwap(getAccessToken, { action: 'quote', wallet: address, tokenIn: review.tokenIn.address, tokenOut: review.tokenOut.address, amount: review.amount })
      validateStockSwap(fresh.quote, address)
      if (JSON.stringify(fresh.quote.positiveSlippageFee) !== JSON.stringify(review.positiveSlippageFee) || fresh.quote.amountUnits !== review.amountUnits || fresh.quote.tokenIn.address !== review.tokenIn.address || fresh.quote.tokenOut.address !== review.tokenOut.address
        || BigInt(fresh.quote.minimumOutUnits) < BigInt(review.minimumOutUnits) || Number(fresh.quote.gasFee) > Number(review.gasFee) * 1.2) throw Error('Price or network fee changed. Review the updated amount. Any completed approval is limited to your trade amount.')
      onProgress('processing')
      const hash = await submit(fresh.quote.tx.to, fresh.quote.tx.data, BigInt(fresh.quote.tx.value), fresh.quote)
      stillCurrent()
      onProgress('completed')
      void refresh().catch(() => undefined)
      return hash
    } catch (reason) {
      onProgress((reason as {transactionPending?:boolean})?.transactionPending ? 'confirming' : 'failed')
      throw reason
    } finally { inFlight.current = false; setBusy(false) }
  }
  const reconcileXPay=(p:XPayBankPayment)=>{
    if(p.source.toLowerCase()!==address?.toLowerCase())return
    if(p.swapHash&&p.progress.swap==='confirmed')settleXPaySourceProof(ownerKey,p.id,p.swapHash as Hex)
    if(p.bridge?.burnHash&&['attested','mint_requested','mint_submitted','mint_failed','completed'].includes(p.bridge.state))settleXPaySourceProof(ownerKey,p.id,p.bridge.burnHash as Hex)
    setPending(readStockPending(ownerKey));setUncertain(!!localStorage.getItem('pocket.xstocks.signing:'+ownerKey))
  }
  // PIN approval has already been consumed by the owner-bound XPay coordinator.
  // This signer accepts only the exact server-bound swap/allowance/CCTP call.
  const signXPay = async(review:XPayBankPayment,response:XPayBankResponse,onHash:(hash:Hex)=>void) => {
    if(!wallet||!address||inFlight.current||hasStockSubmission(ownerKey))throw Error('Wait for your current wallet submission to be checked.')
    if(review.source.toLowerCase()!==address.toLowerCase()||response.payment.state==='quoted')throw Error('Review and approve this XPay payment first.')
    const tx=validateXPayBankCall(review,response),key=ownerKey
    const current=()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}
    inFlight.current=true;setBusy(true)
    try{
      await ensurePocketXLayerWallet(()=>walletRef.current,address,current)
      current();validateXPayBankCall(review,response)
      if(await stockClient.getChainId()!==196)throw Error('X Layer could not be verified.')
      const call={account:address,to:tx.to,data:tx.data,value:BigInt(tx.value)}
      const [gas,price,balance]=await Promise.all([stockClient.estimateGas(call),stockClient.getGasPrice(),stockClient.getBalance({address})])
      if(gas*price>BigInt(tx.gas)*BigInt(tx.gasPrice)*120n/100n)throw Error('The network fee changed. Check your payment before continuing.')
      if(balance<(gas*price*120n+99n)/100n)throw Error('Not enough OKB for the network fee. Add OKB in Pocket, then retry.')
      current()
      return await runStockSubmission({key,xpayPaymentId:review.id,kind:tx.kind==='approval'?'approval':'trade',
        send:()=>sendTransaction({chainId:196,from:address,to:tx.to,data:tx.data,value:BigInt(tx.value)},{address,uiOptions:{showWalletUIs:false}}),
        ...(tx.kind==='approval'?{wait:(hash:Hex)=>stockClient.waitForTransactionReceipt({hash,timeout:45000})}:{}),
        onPending:next=>{if(scope.current===key){setPending(next);if(next.hash)onHash(next.hash)}},
        onUncertain:value=>{if(scope.current===key)setUncertain(value)},
      })
    }finally{inFlight.current=false;if(mounted.current)setBusy(false)}
  }
  const signGift=async(intent:StockGiftIntent)=>{
    if(!wallet||!address||inFlight.current||hasStockSubmission(ownerKey))throw Error('Wait for your current wallet submission to be checked.')
    const review=stockGiftFundingReview(intent,address),key=ownerKey
    const prior=readStockAttempts(key).filter(r=>r.gift?.id===intent.id&&r.gift.operation===intent.kind)
    if(prior.some(r=>r.status==='pending'))throw Error('This gift transaction is still being checked.')
    const confirmed=prior.find(r=>r.status==='confirmed'&&r.gift?.attemptId===intent.attemptId)
    if(confirmed)return confirmed.hash
    const current=()=>{if(!mounted.current||scope.current!==key)throw Error('Your Pocket account changed.')}
    const submit=async(call:{to:Address;data:Hex;value:0n},operation:'approval'|'funding'|'claim'|'refund')=>{
      current();await ensurePocketXLayerWallet(()=>walletRef.current,address,current);current();if(hasStockSubmission(key))throw Error('A wallet submission is still being checked.');submitted=true
      return runStockSubmission({key,kind:operation==='approval'?'approval':'gift',gift:{id:intent.id,attemptId:intent.attemptId,operation},
        send:()=>sendTransaction({chainId:196,from:address,to:call.to,data:call.data,value:0n},{address,uiOptions:{showWalletUIs:false}}),
        ...(operation==='approval'?{wait:(hash:Hex)=>stockClient.waitForTransactionReceipt({hash,timeout:45000})}:{}),
        onPending:next=>{if(scope.current===key)setPending(next)},onUncertain:value=>{if(scope.current===key)setUncertain(value)}})
    }
    let submitted=false
    inFlight.current=true;setBusy(true)
    try{
      if(!takePocketPaymentApproval()){await requestPocketPaymentApproval();if(!takePocketPaymentApproval())throw Error('Payment approval expired.')}
      current()
      if(intent.kind==='funding')return await executeStockGiftFunding(review,{client:stockClient,assertCurrent:current,now:()=>BigInt(Math.floor(Date.now()/1000)),approve:async()=>{},submit})
      const call=await prepareStockGiftSettlement(intent,address,stockClient);current();return await submit(call,intent.kind)
    }catch(reason){
      if(!submitted)throw Object.assign(reason instanceof Error?reason:new Error('Gift approval did not finish.'),{giftDefinitelyNotSubmitted:true})
      throw reason
    }finally{inFlight.current=false;if(mounted.current)setBusy(false)}
  }
  const recoverGiftFunding=async(id:string)=>{
    if(hasStockSubmission(ownerKey))return {retryAllowed:false}
    const records=readStockAttempts(ownerKey).filter(r=>r.gift?.id===id)
    if(!records.length||records.some(r=>r.status==='pending'))return {retryAllowed:false}
    const funding=records.filter(r=>r.gift?.operation==='funding')
    return {retryAllowed:funding.length?funding.every(r=>r.status==='failed'):records.some(r=>r.gift?.operation==='approval')}
  }
  const reconcileGift=(id:string,operation:'funding'|'claim'|'refund',hash:Hex)=>{
    settleStockGiftProof(ownerKey,id,operation,hash);setPending(readStockPending(ownerKey));setUncertain(!!localStorage.getItem('pocket.xstocks.signing:'+ownerKey))
  }
  return { bridgeOutbound, prepareTransfer, signGift, recoverGiftFunding, reconcileGift, attempts:attempts.filter(r=>r.key===ownerKey), address, ready: ready || !!address || !!setup.error, busy: busy || setup.busy, uncertain, balanceError, actionError: error || setup.error, error: error || setup.error || balanceError || (!ready && !address && !wallet && walletWaitExpired ? 'Wallet connection is taking longer. Reopen Pocket to try again.' : ''), connect, refresh, send, trade, signXPay, reconcileXPay, balanceStale, displaySnapshot: displaySnapshot?.key === ownerKey ? displaySnapshot : null, snapshot: snapshot?.key === ownerKey ? snapshot : null, pending: pending?.key === ownerKey ? pending : null }
}

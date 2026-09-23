import { useCallback, useEffect, useRef, useState } from 'react'
import { useCreateWallet, useSendTransaction, useWallets } from '@privy-io/react-auth'
import { getAddress, encodeFunctionData, parseAbi, parseUnits, type Address, type Hex } from 'viem'
import { stockSwapRequest } from '../api/pocketStockSwapClient'
import { validateStockSwap, type StockSwapQuote } from '../lib/pocketXStocksSwap'
import { hasStockSubmission, readStockLast, readStockPending, runStockSubmission, settleStockPending, type StockPending, type StockTradeStage } from '../lib/pocketStockSubmission'
import { ensurePocketXLayerWallet } from '../lib/pocketStockWalletNetwork'
import { registerStockNotifications } from '../api/pocketStockNotificationsClient'
import usePocketStockBalances from './usePocketStockBalances'
import usePocketIdentity from './usePocketIdentity'
import { readStockHoldings, stockClient, stockTokenAbi, prepareStockTransfer, type StockTransfer, type StockHolding } from '../lib/pocketXStocksWallet'
import { requestPocketPaymentApproval, takePocketPaymentApproval } from '../lib/pocketPaymentApproval'

const stockApprovalAbi = parseAbi(['function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'])

export default function usePocketStockWallet() {
  const { authenticated, user, getAccessToken } = usePocketIdentity()
  const { ready, wallets } = useWallets()
  const [walletWaitExpired, setWalletWaitExpired] = useState(false)
  useEffect(() => { setWalletWaitExpired(false); if (ready || wallets.some(w => w.walletClientType === 'privy')) return; const timer = window.setTimeout(() => setWalletWaitExpired(true), 15_000); return () => window.clearTimeout(timer) }, [ready, wallets])
  const { createWallet } = useCreateWallet()
  const { sendTransaction } = useSendTransaction()
  const embedded = wallets.filter(w => w.walletClientType === 'privy')
  const wallet = authenticated && embedded.length === 1 ? embedded[0] : undefined
  const walletRef = useRef(wallet); walletRef.current = wallet
  const address = wallet ? getAddress(wallet.address) : undefined
  useEffect(() => { if (!address || !user?.id) return; const register = () => { void registerStockNotifications(user.id, address, getAccessToken).catch(() => undefined) }; register(); const timer = window.setInterval(register, 60_000); return () => clearInterval(timer) }, [address, user?.id, getAccessToken])
  const ownerKey = user?.id + ':' + (address || '')
  const scope = useRef(ownerKey); scope.current = ownerKey
  const { snapshot, displaySnapshot, balanceStale, balanceError, refresh } = usePocketStockBalances(ownerKey, address, getAccessToken)
  const [uncertain, setUncertain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    if (!pending || pending.key !== ownerKey || pending.status !== 'pending') return
    let cancelled = false
    const check = async () => {
      if (inFlight.current) return
      try {
        const receipt = await stockClient.getTransactionReceipt({ hash: pending.hash })
        if (cancelled) return
        setPending(settleStockPending(pending, receipt.status === 'success'))
        refresh()
      } catch { /* Missing receipt is pending, never success. */ }
    }
    void check()
    const timer = window.setInterval(check, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [pending?.hash, pending?.status, ownerKey, refresh])
  const connect = async () => {
    if (!authenticated || !ready || busy) return
    if (embedded.length > 1) { setError('Multiple embedded wallets found. Wallet selection needs review.'); return }
    if (wallet) return
    setBusy(true); setError('')
    try { await createWallet() } catch { setError('Could not open your embedded wallet. Please try again.') } finally { setBusy(false) }
  }
  const send = async (review: StockTransfer, hooks?: {beforeSubmit?:()=>Promise<void>;onSubmitted?:(hash:Hex)=>void}) => {
    if (!wallet || !address || inFlight.current || hasStockSubmission(ownerKey) || pending?.status === 'pending') throw Error('Wait for your current transaction to finish.')
    const key = ownerKey
    if (review.owner !== address || review.expiresAt <= Date.now()) throw Error('This review expired. Review the transfer again.')
    inFlight.current = true; setBusy(true); setError('')
    try {
      await requestPocketPaymentApproval()
      const approval = takePocketPaymentApproval()
      if (!approval) throw Error('Payment approval expired. Please try again.')
      if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed.')
      const fresh = await prepareStockTransfer(address, review.asset, review.recipient, review.amount)
      if (fresh.fee > review.fee * 120n / 100n) throw Error('Network fee changed. Review this transfer again.')
      await ensurePocketXLayerWallet(() => walletRef.current, address, () => { if (!mounted.current || scope.current !== key) throw Error('Your Pocket account changed.') })
      await hooks?.beforeSubmit?.()
      // Pocket owns review and approval. Privy provides signing without a second transaction modal.
      return await runStockSubmission({key, kind:'send',
        send: () => sendTransaction({chainId:196,from:address,to:fresh.to,data:fresh.data,value:fresh.value},{address,uiOptions:{showWalletUIs:false}}),
        onPending: next => { if(scope.current===key) {setPending(next);hooks?.onSubmitted?.(next.hash)} },
        onUncertain: value => { if(scope.current===key) setUncertain(value) },
      })
    } finally { inFlight.current = false; setBusy(false) }
  }

  const trade = async (review: StockSwapQuote, quoteToken: string, onProgress: (stage: StockTradeStage) => void = () => {}) => {
    if (!wallet || !address || inFlight.current || hasStockSubmission(ownerKey) || pending?.status === 'pending') throw Error('Wait for the current transaction to finish.')
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
      if (swapQuote) { validateStockSwap(swapQuote, address); if (fee > parseUnits(review.gasFee, 18) * 120n / 100n) throw Error('Network fee changed. Review a new quote.') }
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
      const verified = await stockSwapRequest(getAccessToken, { action: 'verify', wallet: address, quoteToken })
      validateStockSwap(verified.quote, address)
      if (JSON.stringify(verified.quote) !== JSON.stringify(review)) throw Error('The quote changed. Review it again.')
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
      const fresh = await stockSwapRequest(getAccessToken, { action: 'quote', wallet: address, tokenIn: review.tokenIn.address, tokenOut: review.tokenOut.address, amount: review.amount })
      validateStockSwap(fresh.quote, address)
      if (JSON.stringify(fresh.quote.positiveSlippageFee) !== JSON.stringify(review.positiveSlippageFee) || fresh.quote.amountUnits !== review.amountUnits || fresh.quote.tokenIn.address !== review.tokenIn.address || fresh.quote.tokenOut.address !== review.tokenOut.address
        || BigInt(fresh.quote.minimumOutUnits) < BigInt(review.minimumOutUnits) || Number(fresh.quote.gasFee) > Number(review.gasFee) * 1.2) throw Error('Price or network fee changed. Review a new quote. Any completed approval is limited to your trade amount.')
      onProgress('processing')
      const hash = await submit(fresh.quote.tx.to, fresh.quote.tx.data, BigInt(fresh.quote.tx.value), fresh.quote)
      stillCurrent()
      onProgress('completed')
      await refresh()
      return hash
    } catch (reason) {
      onProgress((reason as {transactionPending?:boolean})?.transactionPending ? 'confirming' : 'failed')
      throw reason
    } finally { inFlight.current = false; setBusy(false) }
  }
  return { address, ready: ready || !!wallet, busy, uncertain, error: error || balanceError || (!ready && !wallet && walletWaitExpired ? 'Wallet connection is taking longer. Reopen Pocket to try again.' : ''), connect, refresh, send, trade, balanceStale, displaySnapshot: displaySnapshot?.key === ownerKey ? displaySnapshot : null, snapshot: snapshot?.key === ownerKey ? snapshot : null, pending: pending?.key === ownerKey ? pending : null }
}

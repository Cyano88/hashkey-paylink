import { useCallback, useEffect, useRef, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import { readCirclePaymentFeeQuote, type CirclePaymentFeeQuote } from '../../lib/circleEvmEmailWallet'
import { readSolanaPaymentQuote, sendQuotedSolanaPayment } from '../../lib/solanaPaymentFees'
import { reconcileCircleSolanaTransfer, sendCircleSolanaTransfer } from '../../lib/circleSolanaEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { claimSendAttempt, releaseSendAttempt, readSendAttempts, saveSendAttempt, updateSendAttempt, migrateLegacySends, POCKET_SENDS_UPDATED, sendOwner, type PocketSendAttempt } from '../lib/pocketSendAttempts'
import { registerPocketPaymentPreparer } from '../lib/pocketPaymentApproval'
import type { PocketNetwork } from '../lib/pocketSchemas'
import type { CirclePocketWallet } from '../models/pocketWallet'
import type { PocketSolanaEmailSession } from './usePocketWalletController'
import { reconcileCircleEvmEmailWithdraw, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { validatePocketWithdrawal } from './pocketWithdrawalValidation'

function sendError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Could not prepare this transfer.'
  return /transfer amount exceeds balance|insufficient.*funds|insufficient usdc/i.test(message)
    ? 'Insufficient USDC to cover the amount and fees. Try a lower amount.' : message
}

export default function usePocketWithdrawalController({
  owner,
  network,
  networkLabel,
  wallet,
  balance,
  resetKey,
  operationContext = 'send',
  chargeFees = false,
  allowLegacyOperation = false,
  ensureWallet,
  getEvmSession,
  getSolanaSession,
  getAccessToken,
  refreshBalances,
  clearExternalError,
  onActivity,
}: {
  owner: string
  network: PocketNetwork
  networkLabel: string
  wallet?: CirclePocketWallet
  balance: number
  resetKey: string
  restoreOperations?: boolean
  operationContext?: string
  chargeFees?: boolean
  allowLegacyOperation?: boolean
  ensureWallet: (network: PocketNetwork) => Promise<CirclePocketWallet | null>
  getEvmSession: (network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) => Promise<CircleEvmEmailSession>
  getSolanaSession: (walletAddress: string) => Promise<PocketSolanaEmailSession>
  getAccessToken: () => Promise<string | null>
  refreshBalances: () => Promise<void>
  clearExternalError: () => void
  onActivity: (message: string) => void
}) {
  const [feeQuote, setFeeQuote] = useState<CirclePaymentFeeQuote | null>(null)
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'submitted' | 'successful'>('idle')
  const [submissionReference, setSubmissionReference] = useState('')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { setFeeQuote(null) }, [network, address, amount, chargeFees])
  const feePreview = feeQuote ? { platform: formatUnits(BigInt(feeQuote.quote.platformFeeUnits), 6), network: formatUnits(BigInt(feeQuote.quote.networkFeeUnits), 6), total: formatUnits(BigInt(feeQuote.quote.totalUnits), 6) } : null
  const acceptedFeeToken = () => {
    if (!chargeFees) return undefined
    const q = feeQuote?.quote
    const normalize = (value: string) => network === 'solana' ? value : value.toLowerCase()
    if (!q || q.chain !== network || q.amountUnits !== parseUnits(amount, 6).toString() || normalize(q.recipient) !== normalize(address) || !wallet?.address || normalize(q.walletAddress) !== normalize(wallet.address) || q.expiresAt <= Date.now() + 15000) throw new Error('Review the refreshed fees before confirming.')
    if (BigInt(Math.floor(balance * 1e6)) < BigInt(q.totalUnits)) throw new Error('Insufficient USDC to cover the amount and fees. Try a lower amount.')
    return feeQuote!.token
  }
  const currentScope = useRef(''); currentScope.current = sendOwner(owner) + ':' + resetKey
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const operationId = useRef('')
  const running = useRef(false)
  const reset = useCallback(() => { operationId.current=''; setAmount('');setAddress('');setError('');setNotice('');setTxHash('');setSubmissionReference('');setStatus('idle');setPending(false) }, [])
  useEffect(() => { reset() }, [resetKey, owner, reset])
  useEffect(() => {
    if (!owner || !wallet?.address) return
    try { migrateLegacySends(owner,{[network]:wallet}) } catch (e) { setError(sendError(e)) }
  }, [owner,network,wallet?.address])
  useEffect(() => {
    const sync = () => {
      if(!operationId.current)return
      const saved=readSendAttempts(owner).find(r=>r.idempotencyKey===operationId.current)
      if(saved?.state==='confirmed'){setTxHash(saved.txHash);setStatus('successful');setPending(false);setError('')}
      else if(saved?.state==='failed'){setTxHash(saved.txHash);setStatus('idle');setPending(false);setError(saved.error||'Transfer failed.')}
    }
    window.addEventListener(POCKET_SENDS_UPDATED,sync)
    return()=>window.removeEventListener(POCKET_SENDS_UPDATED,sync)
  },[owner])

  const setMax = useCallback(() => {
    if (balance > 0) {
      operationId.current=''
      setAmount(String(balance))
      setNotice('')
      setTxHash('')
      setStatus('idle')
    }
  }, [balance])

  const updateAddress = useCallback((value: string) => {
    setAddress(value)
    if (!pending) {
      operationId.current=''
      setNotice('')
      setTxHash('')
      setStatus('idle')
    }
  }, [pending])

  const updateAmount = useCallback((value: string) => {
    setAmount(value)
    if (!pending) {
      operationId.current=''
      setNotice('')
      setTxHash('')
      setStatus('idle')
    }
  }, [pending])

  const prepare = useCallback(async (options?: { walletOverride?: CirclePocketWallet }) => {
    clearExternalError()
    setError('')
    try {
      validatePocketWithdrawal({ network, address, amount, balance })
      const selectedWallet = options?.walletOverride ?? wallet ?? await ensureWallet(network)
      if (!selectedWallet) throw new Error('Circle wallet setup was cancelled.')
      if (network === 'solana') await getSolanaSession(selectedWallet.address)
      else await getEvmSession(network, selectedWallet.address)
      if (chargeFees) {
        if (!feeQuote || feeQuote.quote.expiresAt <= Date.now() + 15000) {
          const next = network === 'solana'
            ? await readSolanaPaymentQuote(selectedWallet.address, address, amount)
            : await readCirclePaymentFeeQuote({ session: await getEvmSession(network, selectedWallet.address), recipient: address, amount, feeMode: 'gross' })
          setFeeQuote(next)
          if (BigInt(Math.floor(balance * 1e6)) < BigInt(next.quote.totalUnits)) throw new Error('Insufficient USDC to cover the amount and fees. Try a lower amount.')
          throw new Error('FEE_REVIEW_REQUIRED')
        }
        acceptedFeeToken()
      }
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'FEE_REVIEW_REQUIRED' ? '' : sendError(reason))
      throw reason
    }
  }, [address, amount, balance, chargeFees, feeQuote, clearExternalError, ensureWallet, getEvmSession, getSolanaSession, network, wallet])

  useEffect(() => registerPocketPaymentPreparer(prepare), [prepare])

  const withdraw = useCallback(async (options?: { balanceOverride?: number; walletOverride?: CirclePocketWallet; preserveForm?: boolean }) => {
    if(running.current)return false
    running.current=true
    const scope=currentScope.current
    const visible=()=>mounted.current&&currentScope.current===scope&&(!operation||operationId.current===operation.idempotencyKey)
    let operation:PocketSendAttempt|undefined
    let submissionStarted=false
    let claimed=false
    let recoveredAttempt=false
    const publish=(patch:Partial<PocketSendAttempt>)=>{
      if(!operation)return
      operation=updateSendAttempt(owner,operation.idempotencyKey,patch)||operation
    }
    try {
      clearExternalError();setError('');setNotice('');setTxHash('');setSubmissionReference('');setStatus('pending');setPending(true)
      const recipient=validatePocketWithdrawal({network,address,amount,balance:options?.balanceOverride??balance}).recipient
      const selectedWallet=options?.walletOverride??wallet??await ensureWallet(network)
      if(!selectedWallet)throw Error('Circle wallet setup was cancelled.')
      if(!visible())return false
      migrateLegacySends(owner,{[network]:selectedWallet})
      const normalize=(value:string)=>network==='solana'?value:value.toLowerCase()
      const fingerprint=[network,normalize(selectedWallet.address),normalize(recipient),parseUnits(amount,6).toString()].join(':')
      const existing=readSendAttempts(owner).find(r=>!['confirmed','failed'].includes(r.state)&&r.network===network&&normalize(r.sourceAddress)===normalize(selectedWallet.address)&&normalize(r.recipient)===normalize(recipient)&&parseUnits(r.amount,6)===parseUnits(amount,6)&&(r.context===operationContext||(allowLegacyOperation&&r.context==='send')))
      recoveredAttempt=Boolean(existing)
      operation=existing??{owner:sendOwner(owner),idempotencyKey:crypto.randomUUID(),fingerprint,context:operationContext,network,sourceAddress:selectedWallet.address,recipient,amount:amount.trim(),state:'preparing',challengeId:'',transactionId:'',txHash:'',createdAt:Date.now(),updatedAt:Date.now()}
      operationId.current=operation.idempotencyKey
      claimed=claimSendAttempt(owner,operation.idempotencyKey)
      if(!claimed){setStatus('submitted');setSubmissionReference(operation.challengeId||operation.idempotencyKey);return false}
      saveSendAttempt(operation)
      const accessToken=await getAccessToken()
      if(!visible())return false
      if(!accessToken)throw Error('Sign in again to continue.')
      const onChallenge=(ids:{challengeId:string;transactionId:string})=>{publish({...ids,state:'submitted'});if(visible())setSubmissionReference(ids.challengeId)}
      const onAccepted=(ids:{challengeId:string;transactionId:string})=>publish({...ids,state:'accepted'})
      let result:{state:'confirmed'|'submitted';txHash:string|null}
      if(network==='solana'){
        const session=await getSolanaSession(selectedWallet.address)
        if(!visible())return false
        if(existing?.challengeId)result=await reconcileCircleSolanaTransfer({accessToken,session,challengeId:existing.challengeId,transactionId:existing.transactionId,timeoutMs:30_000})
        else {
          const feeQuoteToken=acceptedFeeToken();saveSendAttempt(operation);submissionStarted=true
          result=chargeFees?await sendQuotedSolanaPayment({session,recipient,amount:amount.trim(),feeQuoteToken:feeQuoteToken!,accessToken,onChallenge}):await sendCircleSolanaTransfer({session,recipient,amount:amount.trim(),idempotencyKey:operation.idempotencyKey,onChallenge,onAccepted})
        }
      }else{
        const session=await getEvmSession(network,selectedWallet.address)
        if(!visible())return false
        if(existing?.challengeId)result=await reconcileCircleEvmEmailWithdraw({session,challengeId:existing.challengeId,transactionId:existing.transactionId,timeoutMs:30_000})
        else{
          const feeQuoteToken=acceptedFeeToken();saveSendAttempt(operation);submissionStarted=true
          const transfer=await executePocketEvmTransfer({session,linkedWalletAddress:selectedWallet.address,feeQuoteToken,recipient:recipient as Address,amount,idempotencyKey:operation.idempotencyKey,onChallenge,onAccepted,confirm:true})
          result={state:transfer.status,txHash:transfer.txHash||''}
        }
      }
      publish({state:result.state==='confirmed'?'confirmed':'submitted',txHash:result.txHash||operation.txHash})
      if(operation.state==='failed'){if(visible()){setStatus('idle');setError(operation.error||'Transfer failed.')}return false}
      const confirmed=operation.state==='confirmed'
      if(visible()){
        setTxHash(operation.txHash);setStatus(confirmed?'successful':'submitted');setPending(false)
        if(!options?.preserveForm){setAmount('');setAddress('')}
        onActivity(confirmed?'Transfer confirmed':'Transfer awaiting confirmation')
        void refreshBalances().catch(()=>undefined)
      }
      return confirmed||Boolean(operation.txHash)||operation.state==='accepted'
    }catch(reason){
      const failure=reason as {terminalFailure?:boolean;txHash?:string;code?:number}
      const terminal=failure?.terminalFailure===true||(!recoveredAttempt&&(failure?.code===4001||/reverted on-chain|user (rejected|cancelled)|user denied/i.test(sendError(reason))))
      const unknown=Boolean(operation&&(recoveredAttempt||submissionStarted||operation.challengeId||operation.state==='accepted'||operation.txHash))&&!terminal
      if(operation)publish({state:unknown?(operation.challengeId?'submitted':'preparing'):'failed',error:sendError(reason),...(failure?.txHash?{txHash:failure.txHash}:{})})
      if(operation?.state==='confirmed'){if(visible()){setTxHash(operation.txHash);setStatus('successful');setError('')}return true}
      if(operation?.state==='failed'){if(visible()){setTxHash(operation.txHash);setStatus('idle');setError(operation.error||'Transfer failed.')}return false}
      if(visible()){setStatus(unknown?'submitted':'idle');setError(unknown?'':sendError(reason));if(failure?.txHash)setTxHash(failure.txHash);if(/quote|fees changed/i.test(sendError(reason)))setFeeQuote(null)}
      return false
    }finally{if(claimed&&operation)releaseSendAttempt(owner,operation.idempotencyKey);running.current=false;if(visible())setPending(false)}
  },[owner,address,allowLegacyOperation,amount,balance,chargeFees,feeQuote,getAccessToken,clearExternalError,ensureWallet,getEvmSession,getSolanaSession,network,onActivity,operationContext,refreshBalances,wallet])

  return {
    reset,
    reference: txHash || submissionReference,
    feePreview,
    address,
    setAddress: updateAddress,
    amount,
    setAmount: updateAmount,
    pending,
    notice,
    status,
    txHash,
    error,
    setMax,
    prepare,
    withdraw,
  }
}

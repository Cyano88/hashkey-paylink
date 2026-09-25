import { useCallback, useEffect, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import { readCirclePaymentFeeQuote, type CirclePaymentFeeQuote } from '../../lib/circleEvmEmailWallet'
import { readSolanaPaymentQuote, sendQuotedSolanaPayment } from '../../lib/solanaPaymentFees'
import { reconcileCircleSolanaTransfer, sendCircleSolanaTransfer } from '../../lib/circleSolanaEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { recoverPocketEvmTransfer } from '../api/pocketEvmTransferStatusClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
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

const SOLANA_SEND_OPERATION_KEY = 'pocket:solana-send:operation:v2'
const EVM_SEND_OPERATION_KEY = 'pocket:evm-send:operation:v1'
type SolanaSendOperation = { context?: string; fingerprint: string; idempotencyKey: string; challengeId: string; transactionId: string; state: 'preparing' | 'submitted' | 'accepted' | 'confirmed'; updatedAt: number; sourceAddress?: string; recipient?: string; amount?: string }
function readRecentSolanaOperation(): SolanaSendOperation | null {
  try {
    const value = JSON.parse(localStorage.getItem(SOLANA_SEND_OPERATION_KEY) || 'null') as SolanaSendOperation | null
    return value && Date.now() - value.updatedAt < 24 * 60 * 60_000 ? value : null
  } catch { return null }
}
function readSolanaOperation(fingerprint: string, context: string, allowLegacy: boolean): SolanaSendOperation | null {
  const value = readRecentSolanaOperation()
  return value?.fingerprint === fingerprint && (value.context ? value.context === context : (context === 'send' || allowLegacy)) ? value : null
}
function writeSolanaOperation(value: SolanaSendOperation) { localStorage.setItem(SOLANA_SEND_OPERATION_KEY, JSON.stringify(value)) }
function clearSolanaOperation() { localStorage.removeItem(SOLANA_SEND_OPERATION_KEY) }
type EvmSendOperation = { context?: string; fingerprint: string; idempotencyKey: string; challengeId: string; transactionId: string; state: 'preparing' | 'submitted' | 'accepted'; network: Exclude<PocketNetwork, 'solana'>; sourceAddress: string; recipient: string; amount: string; createdAt?: number; updatedAt: number }
function readRecentEvmOperation(): EvmSendOperation | null {
  try {
    const value = JSON.parse(localStorage.getItem(EVM_SEND_OPERATION_KEY) || 'null') as EvmSendOperation | null
    return value && Date.now() - value.updatedAt < 24 * 60 * 60_000 ? value : null
  } catch { return null }
}
function writeEvmOperation(value: EvmSendOperation) { localStorage.setItem(EVM_SEND_OPERATION_KEY, JSON.stringify(value)) }
function clearEvmOperation() { localStorage.removeItem(EVM_SEND_OPERATION_KEY) }

export default function usePocketWithdrawalController({
  network,
  networkLabel,
  wallet,
  balance,
  resetKey,
  restoreOperations = true,
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
  const recoverEvmOperation = useCallback(async (operation: EvmSendOperation) => {
    const accessToken = await getAccessToken()
    if (!accessToken) throw new Error('Sign in again to check this transfer.')
    const submittedAt = operation.createdAt ?? operation.updatedAt
    const result = await recoverPocketEvmTransfer({
      accessToken,
      chain: operation.network,
      payer: operation.sourceAddress as Address,
      recipient: operation.recipient as Address,
      amount: operation.amount,
      notBefore: new Date(submittedAt - 10 * 60_000).toISOString(),
      notAfter: new Date(submittedAt + 30 * 60_000).toISOString(),
    })
    if (result.status !== 'confirmed' || !result.txHash) {
      if (Date.now() - submittedAt > 35 * 60_000) {
        clearEvmOperation()
        setStatus('idle')
        setNotice('Previous send was not completed. Confirm again when ready.')
        return true
      }
      return false
    }
    clearEvmOperation()
    setTxHash(result.txHash)
    setStatus('successful')
    setNotice(formatPocketDisplayAmount(operation.amount) + ' USDC sent on ' + networkLabel)
    void refreshBalances().catch(() => undefined)
    return true
  }, [getAccessToken, networkLabel, refreshBalances])

  useEffect(() => {
    setError('')
    setNotice('')
    setTxHash('')
    setSubmissionReference('')
    setStatus('idle')
  }, [resetKey])

  useEffect(() => {
    if (!restoreOperations || network !== 'solana' || !wallet?.address) return
    const operation = readRecentSolanaOperation()
    if (!operation || !['submitted', 'accepted'].includes(operation.state) || !operation.challengeId) return
    if (operation.context ? operation.context !== operationContext : (operationContext !== 'send' && !allowLegacyOperation)) return
    const sourceAddress = operation.sourceAddress ?? operation.fingerprint.split(':')[0]
    if (sourceAddress !== wallet.address) return
    // Restore the same recorded attempt; never submit another transfer here.
    setAmount(operation.amount || ''); setAddress(operation.recipient || '')
    setSubmissionReference(operation.challengeId)
    setStatus('submitted')
    setNotice('Transfer submitted. Pocket is checking confirmation.')
    let active = true
    void (async () => {
      const session = await getSolanaSession(sourceAddress)
      const accessToken = await getAccessToken()
      if (!active || !accessToken) return
      const result = await reconcileCircleSolanaTransfer({accessToken,session,challengeId:operation.challengeId,transactionId:operation.transactionId,timeoutMs:60_000})
      if (!active || result.state !== 'confirmed') return
      clearSolanaOperation(); setTxHash(result.txHash); setStatus('successful')
      void refreshBalances().catch(() => undefined)
    })().catch(() => undefined)
    return () => { active = false }
  }, [allowLegacyOperation, network, networkLabel, operationContext, resetKey, restoreOperations, wallet?.address, getSolanaSession, getAccessToken, refreshBalances])

  useEffect(() => {
    if (!restoreOperations || network === 'solana' || !wallet?.address) return
    const operation = readRecentEvmOperation()
    if (!operation || !['submitted', 'accepted'].includes(operation.state) || !operation.challengeId || operation.network !== network || operation.sourceAddress.toLowerCase() !== wallet.address.toLowerCase()) return
    if (operation.context ? operation.context !== operationContext : (operationContext !== 'send' && !allowLegacyOperation)) return

    setSubmissionReference(operation.challengeId)
    setStatus('submitted')
    setNotice('Transfer submitted. Pocket is checking Circle acceptance.')
    setAmount(operation.amount); setAddress(operation.recipient)
    void recoverEvmOperation(operation).catch(() => undefined)
  }, [allowLegacyOperation, network, networkLabel, operationContext, recoverEvmOperation, resetKey, restoreOperations, wallet?.address])

  const setMax = useCallback(() => {
    if (balance > 0) {
      setAmount(String(balance))
      setNotice('')
      setTxHash('')
      setStatus('idle')
    }
  }, [balance])

  const updateAddress = useCallback((value: string) => {
    setAddress(value)
    if (!pending) {
      setNotice('')
      setTxHash('')
      setStatus('idle')
    }
  }, [pending])

  const updateAmount = useCallback((value: string) => {
    setAmount(value)
    if (!pending) {
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
    clearExternalError()
    setError('')
    setNotice('')
    setTxHash('')
    setSubmissionReference('')
    setStatus('idle')
    let recipient: string
    try {
      recipient = validatePocketWithdrawal({ network, address, amount, balance: options?.balanceOverride ?? balance }).recipient
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Withdraw failed.')
      return false
    }

    setPending(true)
    setStatus('pending')
    try {
      let handedOff = false
      let confirmed = false
      let circleAccepted = false
      const selectedWallet = options?.walletOverride ?? wallet ?? await ensureWallet(network)
      if (!selectedWallet) throw new Error('Circle wallet setup was cancelled.')
      if (network === 'solana') {
        const session = await getSolanaSession(selectedWallet.address)
        const fingerprint = [selectedWallet.address, recipient, amount.trim()].join(':')
        const savedOperation = readSolanaOperation(fingerprint, operationContext, allowLegacyOperation)
        const existing = savedOperation?.state === 'preparing' || savedOperation?.state === 'submitted' || savedOperation?.state === 'accepted' ? savedOperation : null
        const operation: SolanaSendOperation = existing ?? { context: operationContext, fingerprint, idempotencyKey: crypto.randomUUID(), challengeId: '', transactionId: '', state: 'preparing', updatedAt: Date.now(), sourceAddress: selectedWallet.address, recipient, amount: amount.trim() }
        if (['submitted', 'accepted'].includes(operation.state) && operation.challengeId) {
          setStatus('submitted')
          setNotice(operation.state === 'accepted' ? `${formatPocketDisplayAmount(operation.amount ?? amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
          void reconcileCircleSolanaTransfer({
            accessToken: (await getAccessToken()) || '',
            session,
            challengeId: operation.challengeId,
            transactionId: operation.transactionId,
            timeoutMs: 30_000,
          }).then(reconciled => {
            if (reconciled.state !== 'confirmed') return
            clearSolanaOperation()
            setTxHash(reconciled.txHash)
            setStatus('successful')
            setNotice(`${formatPocketDisplayAmount(operation.amount ?? amount)} USDC sent on ${networkLabel}`)
            void refreshBalances().catch(() => undefined)
          }).catch(() => undefined)
          return operation.state === 'accepted'
        }
        const feeQuoteToken = acceptedFeeToken()
        writeSolanaOperation(operation)
        const result = chargeFees ? await sendQuotedSolanaPayment({ session, recipient, amount: amount.trim(), feeQuoteToken: feeQuoteToken!, accessToken: (await getAccessToken()) || '', onChallenge: identifiers => { setSubmissionReference(identifiers.challengeId); writeSolanaOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }) } }) : await sendCircleSolanaTransfer({
          session,
          recipient,
          amount: amount.trim(),
          idempotencyKey: operation.idempotencyKey,
          onChallenge: identifiers => { setSubmissionReference(identifiers.challengeId); writeSolanaOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }) },
          onAccepted: identifiers => {
            circleAccepted = true
            setStatus('submitted')
            writeSolanaOperation({ ...operation, ...identifiers, state: 'accepted', updatedAt: Date.now() })
          },
        })
        writeSolanaOperation({ ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: result.state === 'confirmed' ? 'confirmed' : circleAccepted ? 'accepted' : 'submitted', updatedAt: Date.now() })
        setTxHash(result.txHash)
        confirmed = result.state === 'confirmed'
        handedOff = confirmed || circleAccepted
        if (confirmed) clearSolanaOperation()
        if (!confirmed) {
          const sentAmount = amount
          const submittedOperation = { ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: circleAccepted ? 'accepted' as const : 'submitted' as const, updatedAt: Date.now() }
          void reconcileCircleSolanaTransfer({
            accessToken: (await getAccessToken()) || '',
            session,
            challengeId: result.challengeId,
            transactionId: result.transactionId,
            timeoutMs: 180_000,
          }).then(reconciled => {
            if (reconciled.state !== 'confirmed') return
            clearSolanaOperation()
            setTxHash(reconciled.txHash)
            setStatus('successful')
            setNotice(`${formatPocketDisplayAmount(sentAmount)} USDC sent on ${networkLabel}`)
            void refreshBalances().catch(() => undefined)
            if (!circleAccepted) onActivity(`Withdrew ${sentAmount} USDC on ${networkLabel}`)
          }).catch(() => undefined)
        }
      } else {
        const fingerprint = [network, selectedWallet.address.toLowerCase(), recipient.toLowerCase(), amount.trim()].join(':')
        const savedOperation = readRecentEvmOperation()
        const existing = savedOperation?.state === 'preparing' || savedOperation?.state === 'submitted' || savedOperation?.state === 'accepted' ? savedOperation : null
        const operation: EvmSendOperation = existing?.fingerprint === fingerprint && (existing.context ? existing.context === operationContext : (operationContext === 'send' || allowLegacyOperation))
          ? existing
          : { context: operationContext, fingerprint, idempotencyKey: crypto.randomUUID(), challengeId: '', transactionId: '', state: 'preparing', network, sourceAddress: selectedWallet.address, recipient, amount: amount.trim(), createdAt: Date.now(), updatedAt: Date.now() }
        if (['submitted', 'accepted'].includes(operation.state) && operation.challengeId) {
          setStatus('submitted')
          setNotice(operation.state === 'accepted' ? `${formatPocketDisplayAmount(operation.amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
          const recovered = operation.state === 'submitted' && await recoverEvmOperation(operation).catch(() => false)
          if (recovered) return true
          const session = await getEvmSession(network, selectedWallet.address)
          void reconcileCircleEvmEmailWithdraw({
            session,
            challengeId: operation.challengeId,
            transactionId: operation.transactionId,
            timeoutMs: 30_000,
          }).then(reconciled => {
            if (reconciled.state !== 'confirmed' || !reconciled.txHash) return
            clearEvmOperation()
            setTxHash(reconciled.txHash)
            setStatus('successful')
            setNotice(`${formatPocketDisplayAmount(operation.amount)} USDC sent on ${networkLabel}`)
            void refreshBalances().catch(() => undefined)
          }).catch(() => undefined)
          return operation.state === 'accepted'
        }
        const session = await getEvmSession(network, selectedWallet.address)
        const feeQuoteToken = acceptedFeeToken()
        writeEvmOperation(operation)
        const result = await executePocketEvmTransfer({
          session,
          linkedWalletAddress: selectedWallet.address,
          feeQuoteToken,
          recipient: recipient as Address,
          amount,
          idempotencyKey: operation.idempotencyKey,
          onChallenge: identifiers => { setSubmissionReference(identifiers.challengeId); writeEvmOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }) },
          onAccepted: identifiers => {
            circleAccepted = true
            writeEvmOperation({ ...operation, ...identifiers, state: 'accepted', updatedAt: Date.now() })
          },
          confirm: true,
        })
        if (result.txHash) setTxHash(result.txHash)
        confirmed = result.status === 'confirmed'
        handedOff = confirmed || Boolean(result.txHash) || circleAccepted
        if (confirmed) clearEvmOperation()
        if (!confirmed) {
          const submitted = readRecentEvmOperation()
          if (submitted?.fingerprint === fingerprint && submitted.challengeId) {
            writeEvmOperation({ ...submitted, state: circleAccepted ? 'accepted' : 'submitted', updatedAt: Date.now() })
            void reconcileCircleEvmEmailWithdraw({
              session,
              challengeId: submitted.challengeId,
              transactionId: submitted.transactionId,
              timeoutMs: 180_000,
            }).then(reconciled => {
              if (reconciled.state !== 'confirmed' || !reconciled.txHash) return
              clearEvmOperation()
              setTxHash(reconciled.txHash)
              setStatus('successful')
              setNotice(`${formatPocketDisplayAmount(operation.amount)} USDC sent on ${networkLabel}`)
              void refreshBalances().catch(() => undefined)
              if (!circleAccepted) onActivity(`Withdrew ${operation.amount} USDC on ${networkLabel}`)
            }).catch(() => undefined)
          }
        }
      }
      setPending(false)
      setStatus(confirmed ? 'successful' : 'submitted')
      setNotice(confirmed ? `${formatPocketDisplayAmount(amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
      // Keep the durable journal until the transfer is confirmed.
      if (confirmed) {
        if (network === 'solana') clearSolanaOperation()
        else clearEvmOperation()
      }
      if (handedOff) onActivity(`Withdrew ${amount} USDC on ${networkLabel}`)
      if (!options?.preserveForm) {
        setAmount('')
        setAddress('')
      }
      void refreshBalances().catch(() => undefined)
      return handedOff
    } catch (reason) {
      const unresolved = network === 'solana' ? readRecentSolanaOperation() : readRecentEvmOperation()
      const submitted = Boolean(unresolved?.challengeId && ['submitted', 'accepted'].includes(unresolved.state))
      const message = reason instanceof Error && reason.message ? reason.message : typeof reason === 'string' && reason ? reason : 'Withdraw failed.'
      const failedHash = (reason as {txHash?:unknown})?.txHash
      if (typeof failedHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(failedHash)) setTxHash(failedHash)
      const reverted = message === 'Withdrawal transaction reverted on-chain.'
      setStatus(submitted && !reverted ? 'submitted' : 'idle')
      if (/quote|fees changed/i.test(message)) setFeeQuote(null)
      if (reverted || (!submitted && /cancelled|failed|denied/i.test(message))) {
        if (network === 'solana') clearSolanaOperation()
        else clearEvmOperation()
      }
      setError(message)
      return false
    } finally {
      setPending(false)
    }
  }, [address, allowLegacyOperation, amount, balance, chargeFees, feeQuote, getAccessToken, clearExternalError, ensureWallet, getEvmSession, getSolanaSession, network, networkLabel, onActivity, operationContext, recoverEvmOperation, refreshBalances, wallet])

  return {
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

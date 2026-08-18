import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
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

const SOLANA_SEND_OPERATION_KEY = 'pocket:solana-send:operation:v2'
const EVM_SEND_OPERATION_KEY = 'pocket:evm-send:operation:v1'
type SolanaSendOperation = { fingerprint: string; idempotencyKey: string; challengeId: string; transactionId: string; state: 'preparing' | 'submitted' | 'accepted' | 'confirmed'; updatedAt: number; sourceAddress?: string; recipient?: string; amount?: string }
function readRecentSolanaOperation(): SolanaSendOperation | null {
  try {
    const value = JSON.parse(localStorage.getItem(SOLANA_SEND_OPERATION_KEY) || 'null') as SolanaSendOperation | null
    return value && Date.now() - value.updatedAt < 24 * 60 * 60_000 ? value : null
  } catch { return null }
}
function readSolanaOperation(fingerprint: string): SolanaSendOperation | null {
  const value = readRecentSolanaOperation()
  return value?.fingerprint === fingerprint ? value : null
}
function writeSolanaOperation(value: SolanaSendOperation) { localStorage.setItem(SOLANA_SEND_OPERATION_KEY, JSON.stringify(value)) }
function clearSolanaOperation() { localStorage.removeItem(SOLANA_SEND_OPERATION_KEY) }
type EvmSendOperation = { fingerprint: string; idempotencyKey: string; challengeId: string; transactionId: string; state: 'preparing' | 'submitted' | 'accepted'; network: Exclude<PocketNetwork, 'solana'>; sourceAddress: string; recipient: string; amount: string; createdAt?: number; updatedAt: number }
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
  ensureWallet: (network: PocketNetwork) => Promise<CirclePocketWallet | null>
  getEvmSession: (network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) => Promise<CircleEvmEmailSession>
  getSolanaSession: (walletAddress: string) => Promise<PocketSolanaEmailSession>
  getAccessToken: () => Promise<string | null>
  refreshBalances: () => Promise<void>
  clearExternalError: () => void
  onActivity: (message: string) => void
}) {
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'submitted' | 'successful'>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
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
    setStatus('idle')
  }, [resetKey])

  useEffect(() => {
    if (!restoreOperations || network !== 'solana' || !wallet?.address) return
    const operation = readRecentSolanaOperation()
    if (!operation || !['submitted', 'accepted'].includes(operation.state) || !operation.challengeId) return
    const sourceAddress = operation.sourceAddress ?? operation.fingerprint.split(':')[0]
    if (sourceAddress !== wallet.address) return
    setStatus(operation.state === 'accepted' ? 'successful' : 'submitted')
    setNotice(operation.state === 'accepted' ? `${formatPocketDisplayAmount(operation.amount ?? '')} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
  }, [network, resetKey, wallet?.address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restoreOperations || network === 'solana' || !wallet?.address) return
    const operation = readRecentEvmOperation()
    if (!operation || !['submitted', 'accepted'].includes(operation.state) || !operation.challengeId || operation.network !== network || operation.sourceAddress.toLowerCase() !== wallet.address.toLowerCase()) return
    setStatus(operation.state === 'accepted' ? 'successful' : 'submitted')
    setNotice(operation.state === 'accepted' ? `${formatPocketDisplayAmount(operation.amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
    if (operation.state === 'submitted') void recoverEvmOperation(operation).catch(() => undefined)
  }, [network, networkLabel, recoverEvmOperation, resetKey, wallet?.address])

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
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Pocket could not prepare this wallet.')
      throw reason
    }
  }, [address, amount, balance, clearExternalError, ensureWallet, getEvmSession, getSolanaSession, network, wallet])

  useEffect(() => registerPocketPaymentPreparer(prepare), [prepare])

  const withdraw = useCallback(async (options?: { balanceOverride?: number; walletOverride?: CirclePocketWallet; preserveForm?: boolean }) => {
    clearExternalError()
    setError('')
    setNotice('')
    setTxHash('')
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
      let circleAccepted = false
      const selectedWallet = options?.walletOverride ?? wallet ?? await ensureWallet(network)
      if (!selectedWallet) throw new Error('Circle wallet setup was cancelled.')
      if (network === 'solana') {
        const session = await getSolanaSession(selectedWallet.address)
        const fingerprint = [selectedWallet.address, recipient, amount.trim()].join(':')
        const existing = readSolanaOperation(fingerprint)
        const operation: SolanaSendOperation = existing ?? { fingerprint, idempotencyKey: crypto.randomUUID(), challengeId: '', transactionId: '', state: 'preparing', updatedAt: Date.now(), sourceAddress: selectedWallet.address, recipient, amount: amount.trim() }
        if (['submitted', 'accepted'].includes(operation.state) && operation.challengeId) {
          setStatus(operation.state === 'accepted' ? 'successful' : 'submitted')
          setNotice(operation.state === 'accepted' ? `${formatPocketDisplayAmount(operation.amount ?? amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
          void reconcileCircleSolanaTransfer({
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
        writeSolanaOperation(operation)
        const result = await sendCircleSolanaTransfer({
          session,
          recipient,
          amount: amount.trim(),
          idempotencyKey: operation.idempotencyKey,
          onChallenge: identifiers => writeSolanaOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }),
          onAccepted: identifiers => {
            circleAccepted = true
            writeSolanaOperation({ ...operation, ...identifiers, state: 'accepted', updatedAt: Date.now() })
          },
        })
        writeSolanaOperation({ ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: result.state === 'confirmed' ? 'confirmed' : circleAccepted ? 'accepted' : 'submitted', updatedAt: Date.now() })
        setTxHash(result.txHash)
        handedOff = result.state === 'confirmed' || circleAccepted
        if (result.txHash) clearSolanaOperation()
        if (!result.txHash) {
          const sentAmount = amount
          const submittedOperation = { ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: circleAccepted ? 'accepted' as const : 'submitted' as const, updatedAt: Date.now() }
          void reconcileCircleSolanaTransfer({
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
        const existing = readRecentEvmOperation()
        const operation: EvmSendOperation = existing?.fingerprint === fingerprint
          ? existing
          : { fingerprint, idempotencyKey: crypto.randomUUID(), challengeId: '', transactionId: '', state: 'preparing', network, sourceAddress: selectedWallet.address, recipient, amount: amount.trim(), createdAt: Date.now(), updatedAt: Date.now() }
        if (['submitted', 'accepted'].includes(operation.state) && operation.challengeId) {
          setStatus(operation.state === 'accepted' ? 'successful' : 'submitted')
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
        writeEvmOperation(operation)
        const result = await executePocketEvmTransfer({
          session,
          linkedWalletAddress: selectedWallet.address,
          recipient: recipient as Address,
          amount,
          idempotencyKey: operation.idempotencyKey,
          onChallenge: identifiers => writeEvmOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }),
          onAccepted: identifiers => {
            circleAccepted = true
            writeEvmOperation({ ...operation, ...identifiers, state: 'accepted', updatedAt: Date.now() })
          },
          confirm: false,
        })
        if (result.txHash) setTxHash(result.txHash)
        handedOff = Boolean(result.txHash) || circleAccepted
        if (result.txHash) clearEvmOperation()
        if (!result.txHash) {
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
      setStatus(handedOff ? 'successful' : 'submitted')
      setNotice(handedOff ? `${formatPocketDisplayAmount(amount)} USDC sent on ${networkLabel}` : 'Transfer submitted. Pocket is checking Circle acceptance.')
      if (handedOff) onActivity(`Withdrew ${amount} USDC on ${networkLabel}`)
      if (!options?.preserveForm) {
        setAmount('')
        setAddress('')
      }
      void refreshBalances().catch(() => undefined)
      return handedOff
    } catch (reason) {
      setStatus('idle')
      const message = reason instanceof Error && reason.message ? reason.message : typeof reason === 'string' && reason ? reason : 'Withdraw failed.'
      if (/cancelled|failed|denied/i.test(message)) {
        if (network === 'solana') clearSolanaOperation()
        else clearEvmOperation()
      }
      setError(message)
      return false
    } finally {
      setPending(false)
    }
  }, [address, amount, balance, clearExternalError, ensureWallet, getEvmSession, getSolanaSession, network, networkLabel, onActivity, recoverEvmOperation, refreshBalances, wallet])

  return {
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

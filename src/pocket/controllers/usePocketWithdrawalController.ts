import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { reconcileCircleSolanaTransfer, sendCircleSolanaTransfer } from '../../lib/circleSolanaEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import type { PocketNetwork } from '../lib/pocketSchemas'
import type { CirclePocketWallet } from '../models/pocketWallet'
import type { PocketSolanaEmailSession } from './usePocketWalletController'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { validatePocketWithdrawal } from './pocketWithdrawalValidation'

const SOLANA_SEND_OPERATION_KEY = 'pocket:solana-send:operation:v2'
type SolanaSendOperation = { fingerprint: string; idempotencyKey: string; challengeId: string; transactionId: string; state: 'preparing' | 'submitted' | 'confirmed'; updatedAt: number }
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

export default function usePocketWithdrawalController({
  network,
  networkLabel,
  wallet,
  balance,
  resetKey,
  ensureWallet,
  getEvmSession,
  getSolanaSession,
  refreshBalances,
  clearExternalError,
  onActivity,
}: {
  network: PocketNetwork
  networkLabel: string
  wallet?: CirclePocketWallet
  balance: number
  resetKey: string
  ensureWallet: (network: PocketNetwork) => Promise<CirclePocketWallet | null>
  getEvmSession: (network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) => Promise<CircleEvmEmailSession>
  getSolanaSession: (walletAddress: string) => Promise<PocketSolanaEmailSession>
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

  useEffect(() => {
    setError('')
    setNotice('')
    setTxHash('')
    setStatus('idle')
  }, [resetKey])

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

  const withdraw = useCallback(async (options?: { balanceOverride?: number; walletOverride?: CirclePocketWallet }) => {
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
      return
    }

    setPending(true)
    setStatus('pending')
    try {
      let handedOff = false
      const selectedWallet = options?.walletOverride ?? wallet ?? await ensureWallet(network)
      if (!selectedWallet) throw new Error('Circle wallet setup was cancelled.')
      if (network === 'solana') {
        const session = await getSolanaSession(selectedWallet.address)
        const fingerprint = [selectedWallet.address, recipient, amount.trim()].join(':')
        const existing = readSolanaOperation(fingerprint)
        const operation: SolanaSendOperation = existing ?? { fingerprint, idempotencyKey: crypto.randomUUID(), challengeId: '', transactionId: '', state: 'preparing', updatedAt: Date.now() }
        writeSolanaOperation(operation)
        const result = await sendCircleSolanaTransfer({
          session,
          recipient,
          amount: amount.trim(),
          idempotencyKey: operation.idempotencyKey,
          onChallenge: identifiers => writeSolanaOperation({ ...operation, ...identifiers, state: 'submitted', updatedAt: Date.now() }),
        })
        writeSolanaOperation({ ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: result.state, updatedAt: Date.now() })
        setTxHash(result.txHash)
        handedOff = result.state === 'confirmed'
        if (!handedOff) {
          const sentAmount = amount
          const submittedOperation = { ...operation, challengeId: result.challengeId, transactionId: result.transactionId, state: 'submitted' as const, updatedAt: Date.now() }
          void reconcileCircleSolanaTransfer({
            session,
            challengeId: result.challengeId,
            transactionId: result.transactionId,
            timeoutMs: 180_000,
          }).then(reconciled => {
            if (reconciled.state !== 'confirmed') return
            writeSolanaOperation({ ...submittedOperation, transactionId: reconciled.transactionId, state: 'confirmed', updatedAt: Date.now() })
            setTxHash(reconciled.txHash)
            setStatus('successful')
            setNotice(`${formatPocketDisplayAmount(sentAmount)} USDC sent on ${networkLabel}`)
            void refreshBalances().catch(() => undefined)
            onActivity(`Withdrew ${sentAmount} USDC on ${networkLabel}`)
          }).catch(() => undefined)
        }
      } else {
        const session = await getEvmSession(network, selectedWallet.address)
        const result = await executePocketEvmTransfer({
          session,
          linkedWalletAddress: selectedWallet.address,
          recipient: recipient as Address,
          amount,
          confirm: false,
        })
        if (result.txHash) setTxHash(result.txHash)
        handedOff = Boolean(result.txHash)
      }
      setPending(false)
      setStatus(handedOff ? 'successful' : 'submitted')
      setNotice(handedOff ? `${formatPocketDisplayAmount(amount)} USDC sent on ${networkLabel}` : 'Your send was accepted. Pocket is confirming delivery.')
      onActivity(`Withdrew ${amount} USDC on ${networkLabel}`)
      setAmount('')
      setAddress('')
      void refreshBalances().catch(() => undefined)
    } catch (reason) {
      setStatus('idle')
      setError(reason instanceof Error && reason.message ? reason.message : typeof reason === 'string' && reason ? reason : 'Withdraw failed.')
    } finally {
      setPending(false)
    }
  }, [address, amount, balance, clearExternalError, ensureWallet, getEvmSession, getSolanaSession, network, networkLabel, onActivity, refreshBalances, wallet])

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
    withdraw,
  }
}

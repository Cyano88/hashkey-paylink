import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { signCircleSolanaTransaction } from '../../lib/circleSolanaEmailWallet'
import { formatAmount } from '../../lib/utils'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { preparePocketSolanaTransfer, submitPocketSolanaTransfer } from '../api/pocketSolanaTransferClient'
import type { PocketNetwork } from '../lib/pocketSchemas'
import type { CirclePocketWallet } from '../models/pocketWallet'
import type { PocketSolanaEmailSession } from './usePocketWalletController'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { validatePocketWithdrawal } from './pocketWithdrawalValidation'

type PocketAccessTokenReader = () => Promise<string | null>

export default function usePocketWithdrawalController({
  network,
  networkLabel,
  wallet,
  balance,
  resetKey,
  ensureWallet,
  getAccessToken,
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
  getAccessToken: PocketAccessTokenReader
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

  const withdraw = useCallback(async () => {
    clearExternalError()
    setError('')
    setNotice('')
    setTxHash('')
    setStatus('idle')
    let recipient: string
    try {
      recipient = validatePocketWithdrawal({ network, address, amount, balance }).recipient
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Withdraw failed.')
      return
    }

    setPending(true)
    setStatus('pending')
    try {
      let confirmed = false
      const selectedWallet = wallet ?? await ensureWallet(network)
      if (!selectedWallet) throw new Error('Circle wallet setup was cancelled.')
      if (network === 'solana') {
        const session = await getSolanaSession(selectedWallet.address)
        const accessToken = await getAccessToken()
        if (!accessToken) throw new Error('Sign in again to withdraw from this Solana wallet.')
        const prepared = await preparePocketSolanaTransfer({ accessToken, recipient, amount })
        const signedTransaction = await signCircleSolanaTransaction({
          session,
          rawTransaction: prepared.transaction,
          memo: `Hash PayLink Circle Pocket withdraw ${formatAmount(amount, 6)} USDC`,
        })
        const submitted = await submitPocketSolanaTransfer({
          accessToken,
          transaction: signedTransaction,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        })
        setTxHash(submitted.txHash)
        confirmed = submitted.status === 'confirmed'
      } else {
        const session = await getEvmSession(network, selectedWallet.address)
        const result = await executePocketEvmTransfer({
          session,
          linkedWalletAddress: selectedWallet.address,
          recipient: recipient as Address,
          amount,
        })
        if (result.txHash) setTxHash(result.txHash)
        confirmed = result.status === 'confirmed'
      }
      setStatus(confirmed ? 'successful' : 'submitted')
      setNotice(confirmed ? 'Confirmed on-chain.' : 'Submitted on-chain. Confirmation is still pending.')
      onActivity(`Withdrew ${amount} USDC on ${networkLabel}`)
      setAmount('')
      setAddress('')
      await refreshBalances()
    } catch (reason) {
      setStatus('idle')
      setError(reason instanceof Error && reason.message ? reason.message : typeof reason === 'string' && reason ? reason : 'Withdraw failed.')
    } finally {
      setPending(false)
    }
  }, [address, amount, balance, clearExternalError, ensureWallet, getAccessToken, getEvmSession, getSolanaSession, network, networkLabel, onActivity, refreshBalances, wallet])

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

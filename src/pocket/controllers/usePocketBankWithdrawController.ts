import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { confirmPocketBankWithdraw, preparePocketBankWithdraw, readPocketBankWithdrawStatus, type PocketBankWithdrawData } from '../api/pocketBankWithdrawClient'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'

export type PocketBankWithdrawStatus = 'idle' | 'preparing' | 'authorizing' | 'processing' | 'sent'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export default function usePocketBankWithdrawController({
  authenticated,
  email,
  firstName,
  lastName,
  bankCode,
  bankName,
  accountNumber,
  accountName,
  bankVerified,
  wallet,
  ensureWallet,
  getEvmSession,
  getAccessToken,
  onSent,
}: {
  authenticated: boolean
  email: string
  firstName: string
  lastName: string
  bankCode: string
  bankName: string
  accountNumber: string
  accountName: string
  bankVerified: boolean
  wallet?: CirclePocketWallet
  ensureWallet: () => Promise<CirclePocketWallet | null>
  getEvmSession: (walletAddress: string) => Promise<CircleEvmEmailSession>
  getAccessToken: () => Promise<string | null>
  onSent: () => void | Promise<void>
}) {
  const [amount, setAmountState] = useState('')
  const [memo, setMemoState] = useState('')
  const [status, setStatus] = useState<PocketBankWithdrawStatus>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<PocketBankWithdrawData | null>(null)
  const idempotencyKey = useRef('')
  const cancelled = useRef(false)

  useEffect(() => () => { cancelled.current = true }, [])

  const resetResult = useCallback(() => {
    if (status === 'idle' || status === 'sent') {
      setStatus('idle')
      setError('')
      setResult(null)
      idempotencyKey.current = ''
    }
  }, [status])

  const setAmount = useCallback((value: string) => {
    setAmountState(normalizePocketAmountInput(value))
    resetResult()
  }, [resetResult])

  const setMemo = useCallback((value: string) => {
    setMemoState(value)
    resetResult()
  }, [resetResult])

  const canSubmit = authenticated
    && bankVerified
    && Boolean(bankCode && accountName && accountNumber.length === 10 && firstName && lastName)
    && /^\d+(?:\.\d{1,2})?$/.test(amount)
    && Number(amount) > 0
    && status === 'idle'

  const pollUntilSettled = useCallback(async (accessToken: string, intentId: string) => {
    for (let attempt = 0; !cancelled.current; attempt += 1) {
      if (attempt > 0) await wait(attempt <= 40 ? 3_000 : 12_000)
      const next = await readPocketBankWithdrawStatus({ accessToken, intentId }).catch(() => null)
      if (!next) continue
      setResult(next)
      if (next.state === 'sent') {
        setStatus('sent')
        setAmountState('')
        setMemoState('')
        idempotencyKey.current = ''
        await onSent()
        await wait(1_800)
        if (!cancelled.current) {
          setStatus('idle')
          setResult(null)
        }
        return
      }
      if (next.state === 'refunded') {
        setStatus('idle')
        setError('The payout was refunded. Your USDC should return to the Circle wallet.')
        return
      }
    }
  }, [onSent])

  const submit = useCallback(async () => {
    if (!canSubmit) return
    let reconciliation: { accessToken: string; intentId: string } | null = null
    cancelled.current = false
    setError('')
    setResult(null)
    setStatus('preparing')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to withdraw to bank.')
      const selectedWallet = wallet ?? await ensureWallet()
      if (!selectedWallet) throw new Error('Open your Base Circle wallet before withdrawing.')
      const key = idempotencyKey.current || window.crypto.randomUUID()
      idempotencyKey.current = key
      const prepared = await preparePocketBankWithdraw({
        accessToken,
        idempotencyKey: key,
        request: {
          owner_email: email,
          owner_first_name: firstName,
          owner_last_name: lastName,
          bank_code: bankCode,
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          amount_ngn: amount,
          wallet_address: selectedWallet.address,
          memo: memo.trim() || 'Direct bank payout',
          client_origin: window.location.origin,
        },
      })
      reconciliation = { accessToken, intentId: prepared.intentId }
      setResult(prepared)
      setStatus('authorizing')
      const session = await getEvmSession(selectedWallet.address)
      const transfer = await executePocketEvmTransfer({
        session,
        linkedWalletAddress: selectedWallet.address,
        recipient: prepared.receiveAddress as Address,
        amount: prepared.amountUsdc,
      })
      if (!transfer.txHash) throw new Error('Circle accepted the payout, but no transaction hash was returned. Check Activity before retrying.')
      setStatus('processing')
      const confirmed = await confirmPocketBankWithdraw({
        accessToken,
        request: {
          intent_id: prepared.intentId,
          order_id: prepared.orderId,
          tx_hash: transfer.txHash,
          wallet_address: selectedWallet.address,
        },
      }).catch(() => null)
      if (confirmed) setResult(confirmed)
      await pollUntilSettled(accessToken, prepared.intentId)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Bank payout failed.'
      if (message.includes('submitted and is being reconciled')) {
        setStatus('processing')
        setError('')
        if (reconciliation) await pollUntilSettled(reconciliation.accessToken, reconciliation.intentId)
        return
      }
      setStatus('idle')
      setError(message)
    }
  }, [accountName, accountNumber, amount, bankCode, bankName, canSubmit, email, ensureWallet, firstName, getAccessToken, getEvmSession, lastName, memo, pollUntilSettled, wallet])

  return { amount, memo, status, error, result, canSubmit, setAmount, setMemo, submit }
}

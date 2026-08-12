import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { authorizePocketBankWithdraw, confirmPocketBankWithdraw, preparePocketBankWithdraw, readPocketBankWithdrawStatus, type PocketBankWithdrawData } from '../api/pocketBankWithdrawClient'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'

export type PocketBankWithdrawStatus = 'idle' | 'preparing' | 'routing' | 'route-review' | 'authorizing' | 'processing' | 'sent'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const BANK_PAYOUT_OPERATION_KEY = 'pocket:bank-withdraw:operation'

async function operationFingerprint(value: string) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function storedOperation(fingerprint: string) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(BANK_PAYOUT_OPERATION_KEY) || '{}') as { fingerprint?: string; idempotencyKey?: string }
    return parsed.fingerprint === fingerprint && parsed.idempotencyKey ? parsed.idempotencyKey : ''
  } catch {
    return ''
  }
}

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
  const activeIntentId = useRef('')
  const cancelled = useRef(false)

  useEffect(() => () => { cancelled.current = true }, [])

  const resetResult = useCallback(() => {
    if (status === 'idle' || status === 'sent') {
      setStatus('idle')
      setError('')
      setResult(null)
      idempotencyKey.current = ''
      activeIntentId.current = ''
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
      const active = activeIntentId.current === intentId
      if (active) setResult(next)
      if (next.state === 'sent') {
        if (active) setStatus('sent')
        await onSent()
        return
      }
      if (next.state === 'refunded') {
        if (active) {
          setStatus('idle')
          setError('The payout was refunded. Your USDC should return to the Circle wallet.')
        }
        return
      }
    }
  }, [onSent])

  const submit = useCallback(async () => {
    if (!canSubmit) return
    cancelled.current = false
    setError('')
    setResult(null)
    setStatus('preparing')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to withdraw to bank.')
      const selectedWallet = wallet ?? await ensureWallet()
      if (!selectedWallet) throw new Error('Open your Base Circle wallet before withdrawing.')
      const fingerprint = await operationFingerprint([email.toLowerCase(), bankCode, accountNumber, amount].join('|'))
      const key = idempotencyKey.current || storedOperation(fingerprint) || window.crypto.randomUUID()
      idempotencyKey.current = key
      window.sessionStorage.setItem(BANK_PAYOUT_OPERATION_KEY, JSON.stringify({ fingerprint, idempotencyKey: key }))
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
      activeIntentId.current = prepared.intentId
      setResult(prepared)
      const requiredUsdc = Number(prepared.amountUsdc)
      if (!Number.isFinite(requiredUsdc) || requiredUsdc <= 0) {
        throw new Error('The bank payout provider returned an invalid USDC amount.')
      }
      setStatus('routing')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Bank payout failed.'
      setStatus('idle')
      setError(message)
    }
  }, [accountName, accountNumber, amount, bankCode, bankName, canSubmit, email, ensureWallet, firstName, getAccessToken, lastName, memo, wallet])

  const continueAfterRouting = useCallback(async (selectedWallet: CirclePocketWallet) => {
    const prepared = result
    if (status !== 'routing' || !prepared || !activeIntentId.current || activeIntentId.current !== prepared.intentId) return
    let reconciliation: { accessToken: string; intentId: string } | null = null
    setError('')
    setStatus('authorizing')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to continue this bank payout.')
      reconciliation = { accessToken, intentId: prepared.intentId }
      const payable = await authorizePocketBankWithdraw({
        accessToken,
        request: {
          intent_id: prepared.intentId,
          wallet_address: selectedWallet.address,
          payer_name: `${firstName} ${lastName}`.trim(),
        },
      })
      if (activeIntentId.current !== prepared.intentId) return
      setResult(payable)
      const session = await getEvmSession(selectedWallet.address)
      const transfer = await executePocketEvmTransfer({
        session,
        linkedWalletAddress: selectedWallet.address,
        recipient: payable.receiveAddress as Address,
        amount: payable.amountUsdc,
        confirm: false,
      })
      if (!transfer.txHash) throw new Error('Circle accepted the payout, but no transaction hash was returned. Check Activity before retrying.')
      setResult({ ...payable, txHash: transfer.txHash })
      setStatus('processing')
      setAmountState('')
      setMemoState('')
      idempotencyKey.current = ''
      window.sessionStorage.removeItem(BANK_PAYOUT_OPERATION_KEY)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
      const confirmed = await confirmPocketBankWithdraw({
        accessToken,
        request: {
          intent_id: prepared.intentId,
          order_id: payable.orderId,
          tx_hash: transfer.txHash,
          wallet_address: selectedWallet.address,
        },
      }).catch(() => null)
      if (confirmed && activeIntentId.current === prepared.intentId) setResult(confirmed)
      void pollUntilSettled(accessToken, prepared.intentId)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Bank payout failed.'
      if (message.includes('submitted and is being reconciled')) {
        setStatus('processing')
        setError('')
        if (reconciliation) void pollUntilSettled(reconciliation.accessToken, reconciliation.intentId)
        return
      }
      setStatus('idle')
      setError(message)
    }
  }, [firstName, getAccessToken, getEvmSession, lastName, pollUntilSettled, result, status])

  const failRouting = useCallback((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : 'Pocket could not prepare this payout.'
    const review = /previous payout move needs review|still moving|destination balance is still refreshing|submitted and is being reconciled|without a verifiable source transaction|check activity before retrying/i.test(message)
    setStatus(review ? 'route-review' : 'idle')
    setError(message)
  }, [])

  return { amount, memo, status, error, result, canSubmit, setAmount, setMemo, resetResult, submit, continueAfterRouting, failRouting }
}

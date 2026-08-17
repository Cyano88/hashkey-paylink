import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { reconcileCircleEvmEmailWithdraw } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { authorizePocketBankWithdraw, confirmPocketBankWithdraw, preparePocketBankWithdraw, readPocketBankWithdrawStatus, registerPocketBankWithdrawTransfer, type PocketBankWithdrawData } from '../api/pocketBankWithdrawClient'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { clearActivePocketBankPayout, readActivePocketBankPayout, readActivePocketBankPayoutAcceptance, readActivePocketBankPayoutTransfer, saveActivePocketBankPayout, saveActivePocketBankPayoutAcceptance } from '../lib/pocketBankPayoutState'
import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'
import { pocketRuntimeOrigin } from '../lib/pocketRoutes'

export type PocketBankWithdrawStatus = 'idle' | 'preparing' | 'routing' | 'route-review' | 'authorizing' | 'processing' | 'sent'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const BANK_PAYOUT_OPERATION_KEY = 'pocket:bank-withdraw:operation'
const BANK_PAYOUT_FAST_POLL_ATTEMPTS = 12

export const PAYMENT_TIMEOUT_NOTICE = 'The payout quote expired before any money was sent. Your details are still here; tap Confirm again to refresh it.'
export const PAYOUT_REFUNDED_NOTICE = 'This payout was refunded. Your returned USDC will appear in Activity.'

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

function payoutError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : fallback
  return /failed to fetch|networkerror|network request failed|unable to resolve host|no address associated|enotfound|pocket could not connect/i.test(message)
    ? 'Pocket could not connect before a transfer was submitted. No money was sent. Try again.'
    : message
}

function isPayoutExpiry(message: string) {
  return /payout (?:window|quote).*(?:expired|expiry)|payment window expired|payment timed out/i.test(message)
}

function clearStoredOperation() {
  window.sessionStorage.removeItem(BANK_PAYOUT_OPERATION_KEY)
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
  const activeIntentId = useRef(readActivePocketBankPayout())
  const cancelled = useRef(false)
  const polling = useRef(false)
  const approvedSession = useRef<{ walletAddress: string; session: CircleEvmEmailSession } | null>(null)
  const statusRef = useRef<PocketBankWithdrawStatus>('idle')
  const onSentRef = useRef(onSent)

  useEffect(() => () => { cancelled.current = true }, [])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { onSentRef.current = onSent }, [onSent])

  const resetResult = useCallback(() => {
    if (status === 'idle' || status === 'sent') {
      const intentId = activeIntentId.current
      if (intentId && !readActivePocketBankPayoutTransfer(intentId)) clearActivePocketBankPayout(intentId)
      setStatus('idle')
      setError('')
      setResult(null)
      idempotencyKey.current = ''
      activeIntentId.current = ''
      approvedSession.current = null
      clearStoredOperation()
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

  const pollUntilSettled = useCallback(async (accessToken: string, intentId: string, maxAttempts = BANK_PAYOUT_FAST_POLL_ATTEMPTS) => {
    if (polling.current) return
    polling.current = true
    try { for (let attempt = 0; !cancelled.current && attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await wait(attempt <= 5 ? 2_000 : 5_000)
      const next = await readPocketBankWithdrawStatus({ accessToken, intentId }).catch(() => null)
      if (!next) continue
      const active = activeIntentId.current === intentId
      if (active) setResult(next)
      if (next.nextAction === 'ensure_liquidity' || next.nextAction === 'wait_bridge' || next.nextAction === 'authorize_transfer') {
        if (active) setStatus(readActivePocketBankPayoutTransfer(intentId) ? 'processing' : 'routing')
        return
      }
      if (next.state === 'sent') {
        clearActivePocketBankPayout(intentId)
        if (active) {
          activeIntentId.current = ''
          clearStoredOperation()
          setStatus('sent')
          setError('')
        }
        await onSentRef.current()
        return
      }
      if (next.state === 'refunded') {
        clearActivePocketBankPayout(intentId)
        if (active) {
          activeIntentId.current = ''
          clearStoredOperation()
          setStatus('idle')
          setError(PAYOUT_REFUNDED_NOTICE)
        }
        return
      }
      if (next.state === 'failed') {
        clearActivePocketBankPayout(intentId)
        if (active) {
          activeIntentId.current = ''
          clearStoredOperation()
          setStatus('idle')
          setError('The payout closed before completion. Check Activity and your USDC balance before starting another payout.')
        }
        return
      }
      if (next.state === 'expired') {
        clearActivePocketBankPayout(intentId)
        if (active) {
          activeIntentId.current = ''
          clearStoredOperation()
          setResult(null)
          setStatus('idle')
          setError(PAYMENT_TIMEOUT_NOTICE)
        }
        return
      }
    } } finally { polling.current = false }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    cancelled.current = false
    const reconcile = async () => {
      const accessToken = await getAccessToken()
      if (!accessToken) return
      const intentId = activeIntentId.current
      if (!intentId) return
      const recoveredTxHash = readActivePocketBankPayoutTransfer(intentId)
      const acceptedTransfer = readActivePocketBankPayoutAcceptance(intentId)
      if (!recoveredTxHash) {
        if (acceptedTransfer) {
          setStatus('processing')
          const next = await readPocketBankWithdrawStatus({ accessToken, intentId }).catch(() => null)
          if (next) setResult(next)
          // Never open Circle authentication from mount, focus, or a timer.
          // The foreground approval path owns hash reconciliation.
          return
        }
        // A live prepare/routing operation has not submitted money yet. Wallet
        // refreshes must never mistake it for an abandoned persisted payout.
        if (statusRef.current !== 'idle') return
        clearActivePocketBankPayout(intentId)
        activeIntentId.current = ''
        setResult(null)
        setStatus('idle')
        setError('')
        clearStoredOperation()
        return
      }
      setStatus('processing')
      const next = await readPocketBankWithdrawStatus({ accessToken, intentId }).catch(() => null)
      if (!next) return
      setResult(next)
      // A submitted transfer may be recorded and reconciled, but this path never
      // creates a new transfer or asks the wallet to authorize one.
      if (next.nextAction === 'authorize_transfer' && recoveredTxHash && wallet?.address) {
        try {
          const submitted = await registerPocketBankWithdrawTransfer({
            accessToken,
            request: { intent_id: intentId, tx_hash: recoveredTxHash },
          })
          setResult(submitted)
          setStatus('processing')
          const confirmed = await confirmPocketBankWithdraw({
            accessToken,
            request: {
              intent_id: intentId,
              order_id: submitted.orderId,
              tx_hash: recoveredTxHash,
              wallet_address: wallet.address,
            },
          }).catch(() => null)
          if (confirmed) setResult(confirmed)
          void pollUntilSettled(accessToken, intentId)
        } catch {
          setStatus('processing')
          setError('')
        }
        return
      }
      if (next.state === 'sent') {
        clearActivePocketBankPayout(intentId)
        activeIntentId.current = ''
        clearStoredOperation()
        setResult(next)
        setStatus('sent')
        setError('')
        await onSentRef.current()
        return
      }
      if (next.state === 'refunded') {
        clearActivePocketBankPayout(intentId)
        activeIntentId.current = ''
        setResult(next)
        setStatus('idle')
        setError(PAYOUT_REFUNDED_NOTICE)
        clearStoredOperation()
        return
      }
      if (next.state === 'failed' || next.state === 'expired') {
        clearActivePocketBankPayout(intentId)
        activeIntentId.current = ''
        setResult(next)
        setStatus('idle')
        setError(next.state === 'expired' ? PAYMENT_TIMEOUT_NOTICE : 'The payout closed before completion. Check Activity and your USDC balance before starting another payout.')
        clearStoredOperation()
        return
      }
      if (next.nextAction === 'ensure_liquidity' || next.nextAction === 'wait_bridge' || next.nextAction === 'authorize_transfer') {
        setStatus('processing')
        return
      }
      setStatus('processing')
      void pollUntilSettled(accessToken, intentId)
    }
    void reconcile()
    const refreshVisible = () => { if (document.visibilityState === 'visible') void reconcile() }
    const interval = window.setInterval(refreshVisible, 15_000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [authenticated, getAccessToken, pollUntilSettled, wallet?.address])

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
      // Authenticate before creating a provider intent. A cancelled fingerprint
      // must leave no payout operation behind, and the approved session is
      // reused when liquidity routing reaches the on-chain transfer.
      const session = approvedSession.current?.walletAddress === selectedWallet.address
        ? approvedSession.current.session
        : await getEvmSession(selectedWallet.address)
      approvedSession.current = { walletAddress: selectedWallet.address, session }
      const fingerprint = await operationFingerprint([email.toLowerCase(), bankCode, bankName, accountNumber, accountName, amount, memo.trim()].join('|'))
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
          client_origin: pocketRuntimeOrigin(),
        },
      })
      activeIntentId.current = prepared.intentId
      saveActivePocketBankPayout(prepared.intentId)
      setResult(prepared)
      const requiredUsdc = Number(prepared.amountUsdc)
      if (!Number.isFinite(requiredUsdc) || requiredUsdc <= 0) {
        throw new Error('The bank payout provider returned an invalid USDC amount.')
      }
      setStatus('routing')
    } catch (reason) {
      approvedSession.current = null
      const message = payoutError(reason, 'Bank payout failed.')
      const intentId = activeIntentId.current
      if (intentId && !readActivePocketBankPayoutTransfer(intentId)) {
        clearActivePocketBankPayout(intentId)
        activeIntentId.current = ''
      }
      if (isPayoutExpiry(message)) {
        idempotencyKey.current = ''
        clearStoredOperation()
      }
      setStatus('idle')
      setError(message)
    }
  }, [accountName, accountNumber, amount, bankCode, bankName, canSubmit, email, ensureWallet, firstName, getAccessToken, getEvmSession, lastName, memo, wallet])

  const prepareApproval = useCallback(async () => {
    setError('')
    try {
      const selectedWallet = wallet ?? await ensureWallet()
      if (!selectedWallet) throw new Error('Open your Base Circle wallet before withdrawing.')
      const session = await getEvmSession(selectedWallet.address)
      approvedSession.current = { walletAddress: selectedWallet.address, session }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pocket could not prepare the Circle wallet session.')
      throw reason
    }
  }, [ensureWallet, getEvmSession, wallet])

  const continueAfterRouting = useCallback(async (selectedWallet: CirclePocketWallet) => {
    const prepared = result
    if (!['routing', 'route-review'].includes(status) || !prepared || !activeIntentId.current || activeIntentId.current !== prepared.intentId) return
    let reconciliation: { accessToken: string; intentId: string } | null = null
    let acceptedTransfer = readActivePocketBankPayoutAcceptance(prepared.intentId)
    let transactionSubmitted = Boolean(readActivePocketBankPayoutTransfer(prepared.intentId) || acceptedTransfer)
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
      if (payable.state === 'expired') throw new Error(PAYMENT_TIMEOUT_NOTICE)
      setResult(payable)
      const session = approvedSession.current?.walletAddress === selectedWallet.address
        ? approvedSession.current.session
        : await getEvmSession(selectedWallet.address)
      approvedSession.current = null
      if (activeIntentId.current !== prepared.intentId) return
      const transfer = await executePocketEvmTransfer({
        session,
        linkedWalletAddress: selectedWallet.address,
        recipient: payable.receiveAddress as Address,
        amount: payable.amountUsdc,
        idempotencyKey: idempotencyKey.current,
        onAccepted: identifiers => {
          acceptedTransfer = identifiers
          transactionSubmitted = true
          saveActivePocketBankPayoutAcceptance(prepared.intentId, identifiers)
          setStatus('processing')
        },
        confirm: false,
      })
      if (!transfer.txHash) {
        if (!acceptedTransfer) throw new Error('Circle did not submit the payout. No money was sent.')
        setResult(payable)
        setStatus('processing')
        clearStoredOperation()
        void reconcileCircleEvmEmailWithdraw({
          session,
          challengeId: acceptedTransfer.challengeId,
          transactionId: acceptedTransfer.transactionId,
          timeoutMs: 180_000,
        }).then(async reconciled => {
          if (!reconciled.txHash || activeIntentId.current !== prepared.intentId) return
          saveActivePocketBankPayout(prepared.intentId, reconciled.txHash)
          const submitted = await registerPocketBankWithdrawTransfer({
            accessToken,
            request: { intent_id: prepared.intentId, tx_hash: reconciled.txHash },
          })
          if (activeIntentId.current !== prepared.intentId) return
          setResult(submitted)
          const confirmed = await confirmPocketBankWithdraw({
            accessToken,
            request: {
              intent_id: prepared.intentId,
              order_id: payable.orderId,
              tx_hash: reconciled.txHash,
              wallet_address: selectedWallet.address,
            },
          }).catch(() => null)
          if (confirmed && activeIntentId.current === prepared.intentId) setResult(confirmed)
          void pollUntilSettled(accessToken, prepared.intentId)
        }).catch(() => undefined)
        return
      }
      setResult({ ...payable, txHash: transfer.txHash })
      saveActivePocketBankPayout(prepared.intentId, transfer.txHash)
      transactionSubmitted = true
      const submitted = await registerPocketBankWithdrawTransfer({
        accessToken,
        request: { intent_id: prepared.intentId, tx_hash: transfer.txHash },
      })
      setResult(submitted)
      setStatus('processing')
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
      approvedSession.current = null
      const message = payoutError(reason, 'Bank payout failed.')
      if (isPayoutExpiry(message)) {
        clearActivePocketBankPayout(prepared.intentId)
        activeIntentId.current = ''
        setResult(null)
        setStatus('idle')
        setError(PAYMENT_TIMEOUT_NOTICE)
        idempotencyKey.current = ''
        clearStoredOperation()
        return
      }
      if (message.includes('submitted and is being reconciled')) {
        setStatus('processing')
        setError('')
        if (reconciliation) void pollUntilSettled(reconciliation.accessToken, reconciliation.intentId)
        return
      }
      if (transactionSubmitted) {
        setStatus('processing')
        setError('')
        if (reconciliation) void pollUntilSettled(reconciliation.accessToken, reconciliation.intentId)
        return
      }
      setStatus('idle')
      setError(message)
    }
  }, [firstName, getAccessToken, getEvmSession, lastName, pollUntilSettled, result, status])

  const failRouting = useCallback((reason: unknown, expectedIntentId?: string) => {
    if (expectedIntentId && activeIntentId.current !== expectedIntentId) return
    const message = payoutError(reason, 'Pocket could not prepare this payout.')
    const intentId = result?.intentId ?? activeIntentId.current
    const submittedRoute = /submitted and is being reconciled|USDC move submitted|still moving|without a verifiable source transaction|check activity before retrying/i.test(message)
    const review = submittedRoute || Boolean(result?.txHash || (intentId && readActivePocketBankPayoutTransfer(intentId)))
    setStatus(review ? 'route-review' : 'idle')
    setError(review ? 'USDC move submitted. Pocket will continue the payout automatically after confirmation.' : message)
  }, [result])

  return { amount, memo, status, error, result, canSubmit, setAmount, setMemo, resetResult, prepareApproval, submit, continueAfterRouting, failRouting }
}

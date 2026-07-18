import { useCallback, useEffect, useRef, useState } from 'react'
import { preparePocketBankFund, readPocketBankFundStatus, type PocketBankFundData } from '../api/pocketBankFundClient'
import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'

export type PocketBankFundStatus = 'idle' | 'preparing' | 'waiting' | 'processing' | 'funded' | 'failed'
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export default function usePocketBankFundController(input: {
  authenticated: boolean
  firstName: string
  lastName: string
  bankCode: string
  bankName: string
  accountNumber: string
  accountName: string
  bankVerified: boolean
  getAccessToken(): Promise<string | null>
  ensureBaseWallet(): Promise<unknown>
  onFunded(): void | Promise<void>
}) {
  const [amount, setAmountState] = useState('')
  const [status, setStatus] = useState<PocketBankFundStatus>('idle')
  const [result, setResult] = useState<PocketBankFundData | null>(null)
  const [error, setError] = useState('')
  const idempotencyKey = useRef('')
  const activeIntent = useRef('')
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => { cancelled.current = true }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setError('')
    setAmountState('')
    idempotencyKey.current = ''
    activeIntent.current = ''
  }, [])

  const setAmount = useCallback((value: string) => {
    setAmountState(normalizePocketAmountInput(value))
    if (status === 'funded' || status === 'failed') {
      setStatus('idle')
      setResult(null)
      setError('')
      idempotencyKey.current = ''
      activeIntent.current = ''
    }
  }, [status])

  const canSubmit = input.authenticated
    && input.bankVerified
    && Boolean(input.bankCode && input.bankName && input.accountName && input.accountNumber.length === 10 && input.firstName && input.lastName)
    && /^\d+(?:\.\d{1,2})?$/.test(amount)
    && Number(amount) > 0
    && status === 'idle'

  const poll = useCallback(async (accessToken: string, intentId: string) => {
    for (let attempt = 0; !cancelled.current && activeIntent.current === intentId; attempt += 1) {
      if (attempt) await wait(attempt < 30 ? 4_000 : 12_000)
      const next = await readPocketBankFundStatus({ accessToken, intentId }).catch(() => null)
      if (!next || activeIntent.current !== intentId) continue
      setResult(next)
      if (next.state === 'funded') {
        setStatus('funded')
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
        await input.onFunded()
        return
      }
      if (next.state === 'expired' || next.state === 'refunded') {
        setStatus('failed')
        setError(next.state === 'expired' ? 'These bank transfer details expired. Start a new funding request.' : 'The bank funding order was refunded.')
        return
      }
      setStatus(next.state)
    }
  }, [input.onFunded])

  const prepare = useCallback(async () => {
    if (!canSubmit) return
    setStatus('preparing')
    setError('')
    try {
      const accessToken = await input.getAccessToken()
      if (!accessToken) throw new Error('Sign in again to fund with bank.')
      await input.ensureBaseWallet()
      const key = idempotencyKey.current || window.crypto.randomUUID()
      idempotencyKey.current = key
      const next = await preparePocketBankFund({
        accessToken,
        idempotencyKey: `pocket:bank-fund:${key}`,
        amountNgn: amount,
        refundBankCode: input.bankCode,
        refundBankName: input.bankName,
        refundAccountNumber: input.accountNumber,
        refundAccountName: input.accountName,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      activeIntent.current = next.intentId
      setResult(next)
      if (next.state === 'funded') {
        setStatus('funded')
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
        await input.onFunded()
        return
      }
      if (next.state === 'expired' || next.state === 'refunded') {
        setStatus('failed')
        setError(next.state === 'expired' ? 'These bank transfer details expired. Start a new funding request.' : 'The bank funding order was refunded.')
        return
      }
      setStatus(next.state)
      void poll(accessToken, next.intentId)
    } catch (reason) {
      setStatus('idle')
      setError(reason instanceof Error ? reason.message : 'Bank funding failed.')
    }
  }, [amount, canSubmit, input.accountName, input.accountNumber, input.bankCode, input.bankName, input.ensureBaseWallet, input.firstName, input.getAccessToken, input.lastName, poll])

  return { amount, setAmount, status, result, error, canSubmit, prepare, reset }
}

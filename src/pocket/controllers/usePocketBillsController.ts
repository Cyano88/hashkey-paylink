import { useCallback, useEffect, useRef, useState } from 'react'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import {
  PocketBillsApiError,
  confirmPocketAirtime,
  preparePocketAirtime,
  quotePocketData,
  quotePocketAirtime,
  readPocketDataCatalog,
  readPocketBillsAvailability,
  refreshPocketAirtime,
  type PocketDataService,
  type PocketDataVariation,
  type PocketBillIntent,
} from '../api/pocketBillsClient'
import type { CirclePocketWallet } from '../models/pocketWallet'

type AccessTokenReader = () => Promise<string | null>
type FlowStatus = 'idle' | 'quoting' | 'ready' | 'paying' | 'confirming' | 'processing' | 'successful' | 'error'
const VTPASS_SANDBOX_SUCCESS_PHONE = '08011111111'

function sandboxDataRecipient(serviceId: string) {
  return serviceId === 'spectranet' ? '1212121212' : VTPASS_SANDBOX_SUCCESS_PHONE
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function finalState(intent: PocketBillIntent) {
  return ['delivered', 'failed', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)
}

function persistActive(key: string, intentId: string, txHash = '') {
  window.localStorage.setItem(key, JSON.stringify({ intentId, txHash }))
}

function readActive(key: string): { intentId: string; txHash: string } | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '{}')
    return typeof value.intentId === 'string' && value.intentId
      ? { intentId: value.intentId, txHash: typeof value.txHash === 'string' ? value.txHash : '' }
      : null
  } catch {
    return null
  }
}

export default function usePocketBillsController({
  view,
  authenticated,
  baseWallet,
  getAccessToken,
  ensureBaseWallet,
  getEvmSession,
  refreshBalances,
}: {
  view: 'airtime' | 'data' | 'tv' | 'electricity'
  authenticated: boolean
  baseWallet?: CirclePocketWallet
  getAccessToken: AccessTokenReader
  ensureBaseWallet: () => Promise<CirclePocketWallet | null>
  getEvmSession: (walletAddress: string) => Promise<CircleEvmEmailSession>
  refreshBalances: () => Promise<void>
}) {
  const category = view === 'data' ? 'data' as const : 'airtime' as const
  const activeBillKey = `pocket:bills:active:${category}`
  const [availability, setAvailability] = useState<'loading' | 'enabled' | 'disabled'>('loading')
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox')
  const [limits, setLimits] = useState({ minNgn: 100, maxNgn: 1000 })
  const [dataEnabled, setDataEnabled] = useState(false)
  const [serviceId, setServiceIdState] = useState('mtn')
  const [phone, setPhoneState] = useState('')
  const [amountNgn, setAmountNgnState] = useState('')
  const [variationCode, setVariationCodeState] = useState('')
  const [dataServices, setDataServices] = useState<PocketDataService[]>([])
  const [dataVariations, setDataVariations] = useState<PocketDataVariation[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [intent, setIntent] = useState<PocketBillIntent | null>(null)
  const [status, setStatus] = useState<FlowStatus>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const restoreStarted = useRef('')
  const visibleCategory = useRef(category)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    if (visibleCategory.current === category) return
    visibleCategory.current = category
    setIntent(null)
    setStatus('idle')
    setError('')
    setNotice('')
    setVariationCodeState('')
    setAmountNgnState('')
  }, [category])

  useEffect(() => {
    if (view === 'airtime' && !['mtn', 'airtel', 'glo', 'etisalat'].includes(serviceId)) {
      setServiceIdState('mtn')
    }
  }, [serviceId, view])

  useEffect(() => {
    let cancelled = false
    void readPocketBillsAvailability()
      .then(result => {
        if (cancelled) return
        setEnvironment(result.environment)
        setLimits({ minNgn: result.minNgn, maxNgn: result.maxNgn })
        setDataEnabled(result.dataEnabled)
        if (result.environment === 'sandbox') setPhoneState(VTPASS_SANDBOX_SUCCESS_PHONE)
        setAvailability(result.enabled ? 'enabled' : 'disabled')
      })
      .catch(() => { if (!cancelled) setAvailability('disabled') })
    return () => { cancelled = true }
  }, [])

  const resetResult = useCallback(() => {
    if (['paying', 'confirming', 'processing'].includes(status)) return
    setIntent(null)
    setStatus('idle')
    setError('')
    setNotice('')
    window.localStorage.removeItem(activeBillKey)
  }, [activeBillKey, status])

  const setServiceId = useCallback((value: string) => {
    setServiceIdState(value)
    if (category === 'data' && environment === 'sandbox') setPhoneState(sandboxDataRecipient(value))
    setVariationCodeState('')
    setAmountNgnState('')
    setDataVariations([])
    resetResult()
  }, [category, environment, resetResult])
  const setPhone = useCallback((value: string) => { setPhoneState(value.replace(/[^\d+]/g, '').slice(0, 14)); resetResult() }, [resetResult])
  const setAmountNgn = useCallback((value: string) => {
    if (/^\d*(?:\.\d{0,2})?$/.test(value)) setAmountNgnState(value)
    resetResult()
  }, [resetResult])

  const setVariationCode = useCallback((value: string) => {
    const plan = dataVariations.find(item => item.variationCode === value)
    setVariationCodeState(plan?.variationCode ?? '')
    setAmountNgnState(plan?.amountNgn ?? '')
    resetResult()
  }, [dataVariations, resetResult])

  const token = useCallback(async () => {
    const accessToken = await getAccessToken()
    if (!accessToken) throw new Error('Sign in again to continue.')
    return accessToken
  }, [getAccessToken])

  const settleResult = useCallback((next: PocketBillIntent) => {
    if (!mounted.current) return
    setIntent(next)
    if (next.state === 'delivered') {
      setStatus('successful')
      setNotice(environment === 'sandbox' ? 'VTpass sandbox test completed.' : `${next.serviceName} sent to ${next.phone}`)
      window.localStorage.removeItem(activeBillKey)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
      void refreshBalances().catch(() => undefined)
    } else if (next.state === 'refunded') {
      setStatus('error')
      setError(`The ${category === 'data' ? 'Data' : 'Airtime'} payment was refunded. No retry is needed.`)
      window.localStorage.removeItem(activeBillKey)
    } else if (next.state === 'provider_failed_unverified') {
      setStatus('processing')
      setNotice(`Verifying the final ${category === 'data' ? 'Data' : 'Airtime'} delivery status. Do not retry.`)
    } else if (next.state === 'refund_eligible') {
      setStatus('error')
      setError(`VTpass confirmed the ${category === 'data' ? 'Data' : 'Airtime'} purchase failed. Claim your refund from Bills activity.`)
    } else if (next.state === 'refund_pending') {
      setStatus('error')
      setError('This earlier refund requires manual review; do not retry.')
    } else if (next.state === 'refunding' || next.state === 'refund_submitted') {
      setStatus('error')
      setError('Your USDC refund is processing. Check Bills activity for confirmation.')
    } else if (next.state === 'failed') {
      setStatus('error')
      setError(next.failureReason || `${category === 'data' ? 'Data' : 'Airtime'} was not delivered. No payment was completed.`)
      window.localStorage.removeItem(activeBillKey)
    } else if (next.state === 'needs_review') {
      setStatus('error')
      setError('This payment needs review. Check Bills activity before retrying.')
    } else {
      setStatus('processing')
      setNotice(`Payment received. ${category === 'data' ? 'Data' : 'Airtime'} delivery is processing.`)
    }
  }, [activeBillKey, category, environment, refreshBalances])

  const reconcile = useCallback(async (intentId: string, txHash: string, accessToken: string) => {
    let next: PocketBillIntent | null = null
    if (txHash) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        try {
          next = await confirmPocketAirtime({ accessToken, intentId, txHash })
          break
        } catch (reason) {
          if (!(reason instanceof PocketBillsApiError) || reason.code !== 'CONFIRMATION_REQUIRED' || attempt === 15) throw reason
          if (mounted.current) setStatus('confirming')
          await sleep(3_000)
        }
      }
    } else {
      next = await refreshPocketAirtime({ accessToken, intentId, refresh: true })
    }
    if (!next) throw new Error('Payment confirmation is temporarily unavailable.')
    setIntent(next)
    for (let attempt = 0; !finalState(next) && attempt < 12; attempt += 1) {
      if (mounted.current) {
        setStatus('processing')
        setNotice(`Payment received. ${category === 'data' ? 'Data' : 'Airtime'} delivery is processing.`)
      }
      await sleep(attempt < 5 ? 2_000 : 5_000)
      next = await refreshPocketAirtime({ accessToken, intentId, refresh: true })
      if (mounted.current) setIntent(next)
    }
    settleResult(next)
    return next
  }, [category, settleResult])

  useEffect(() => {
    if (!authenticated || availability !== 'enabled' || restoreStarted.current === activeBillKey) return
    const active = readActive(activeBillKey)
    if (!active) return
    restoreStarted.current = activeBillKey
    setStatus(active.txHash ? 'confirming' : 'processing')
    void token()
      .then(accessToken => reconcile(active.intentId, active.txHash, accessToken))
      .catch(reason => {
        if (!mounted.current) return
        setStatus('error')
        setError(reason instanceof Error ? reason.message : `Could not restore the ${category === 'data' ? 'Data' : 'Airtime'} payment.`)
      })
  }, [activeBillKey, authenticated, availability, category, reconcile, token])

  useEffect(() => {
    if (!intent || status !== 'ready') return
    const remaining = intent.quoteExpiresAt - Date.now()
    if (remaining <= 0) {
      setStatus('error')
      setError(`The ${category === 'data' ? 'Data' : 'Airtime'} quote expired. Review the payment again.`)
      return
    }
    const timeout = window.setTimeout(() => {
      setStatus('error')
      setError(`The ${category === 'data' ? 'Data' : 'Airtime'} quote expired. Review the payment again.`)
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [category, intent, status])

  useEffect(() => {
    if (!authenticated || availability !== 'enabled' || view !== 'data' || !dataEnabled) return
    let cancelled = false
    setCatalogBusy(true)
    void token()
      .then(accessToken => readPocketDataCatalog({ accessToken }))
      .then(result => {
        if (cancelled) return
        setDataServices(result.services)
        const preferred = result.services.some(item => item.serviceId === serviceId) ? serviceId : result.services[0]?.serviceId ?? ''
        setServiceIdState(preferred)
        if (environment === 'sandbox' && preferred) setPhoneState(sandboxDataRecipient(preferred))
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Data networks are temporarily unavailable.') })
      .finally(() => { if (!cancelled) setCatalogBusy(false) })
    return () => { cancelled = true }
  }, [authenticated, availability, dataEnabled, environment, token, view])

  useEffect(() => {
    if (!authenticated || availability !== 'enabled' || view !== 'data' || !dataEnabled || !serviceId || !dataServices.some(item => item.serviceId === serviceId)) return
    let cancelled = false
    setCatalogBusy(true)
    setDataVariations([])
    setVariationCodeState('')
    setAmountNgnState('')
    void token()
      .then(accessToken => readPocketDataCatalog({ accessToken, serviceId }))
      .then(result => {
        if (cancelled) return
        setDataVariations(result.variations)
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Data plans are temporarily unavailable.') })
      .finally(() => { if (!cancelled) setCatalogBusy(false) })
    return () => { cancelled = true }
  }, [authenticated, availability, dataEnabled, dataServices, serviceId, token, view])

  const review = useCallback(async () => {
    if (availability !== 'enabled' || !authenticated || status === 'quoting') return
    setStatus('quoting')
    setError('')
    setNotice('')
    try {
      const wallet = baseWallet ?? await ensureBaseWallet()
      if (!wallet) throw new Error('Base wallet setup was cancelled.')
      const accessToken = await token()
      const result = category === 'data'
        ? await quotePocketData({ accessToken, serviceId, variationCode, phone, payerWallet: wallet.address })
        : await quotePocketAirtime({ accessToken, serviceId, phone, amountNgn, payerWallet: wallet.address })
      if (result.intent.quoteExpiresAt <= Date.now()) throw new Error(`The ${category === 'data' ? 'Data' : 'Airtime'} quote expired. Review it again.`)
      setIntent(result.intent)
      setStatus('ready')
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : `Could not prepare the ${category === 'data' ? 'Data' : 'Airtime'} payment.`)
    }
  }, [amountNgn, authenticated, availability, baseWallet, category, ensureBaseWallet, phone, serviceId, status, token, variationCode])

  const pay = useCallback(async () => {
    if (!intent || status !== 'ready') return
    setStatus('paying')
    setError('')
    setNotice('')
    try {
      const wallet = baseWallet ?? await ensureBaseWallet()
      if (!wallet) throw new Error('Base wallet setup was cancelled.')
      const accessToken = await token()
      const prepared = await preparePocketAirtime({ accessToken, intentId: intent.id })
      setIntent(prepared)
      const session = await getEvmSession(wallet.address)
      const transfer = await executePocketEvmTransfer({
        session,
        linkedWalletAddress: wallet.address,
        recipient: prepared.treasuryAddress as `0x${string}`,
        amount: prepared.amountUsdc,
        confirm: false,
      })
      if (!transfer.txHash) throw new Error('Circle did not return a Base transaction hash. Check Activity before retrying.')
      persistActive(activeBillKey, prepared.id, transfer.txHash)
      setStatus('confirming')
      await reconcile(prepared.id, transfer.txHash, accessToken)
    } catch (reason) {
      if (!mounted.current) return
      setStatus('error')
      setError(reason instanceof Error ? reason.message : `${category === 'data' ? 'Data' : 'Airtime'} payment did not complete.`)
    }
  }, [activeBillKey, baseWallet, category, ensureBaseWallet, getEvmSession, intent, reconcile, status, token])

  const refresh = useCallback(async () => {
    if (!intent || !authenticated) return
    try {
      const accessToken = await token()
      await reconcile(intent.id, intent.txHash, accessToken)
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : `Could not refresh the ${category === 'data' ? 'Data' : 'Airtime'} payment.`)
    }
  }, [authenticated, category, intent, reconcile, token])

  const processing = ['quoting', 'paying', 'confirming', 'processing'].includes(status)
  const expectedSandboxRecipient = category === 'data' ? sandboxDataRecipient(serviceId) : VTPASS_SANDBOX_SUCCESS_PHONE
  const formReady = (category === 'data' ? /^\d{10,12}$/.test(phone) : /^0\d{10}$/.test(phone))
    && (environment !== 'sandbox' || phone === expectedSandboxRecipient)
    && Number(amountNgn) >= limits.minNgn
    && (category === 'data' || Number(amountNgn) <= limits.maxNgn)
    && (category !== 'data' || Boolean(variationCode))

  return {
    availability,
    environment,
    limits,
    dataEnabled,
    serviceId,
    phone,
    amountNgn,
    variationCode,
    dataServices,
    dataVariations,
    catalogBusy,
    intent,
    status,
    error,
    notice,
    processing,
    formReady,
    setServiceId,
    setPhone,
    setAmountNgn,
    setVariationCode,
    review,
    pay,
    refresh,
  }
}

export type PocketBillsController = ReturnType<typeof usePocketBillsController>

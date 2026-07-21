import { useCallback, useEffect, useRef, useState } from 'react'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import {
  PocketBillsApiError,
  confirmPocketAirtime,
  preparePocketAirtime,
  quotePocketData,
  quotePocketAirtime,
  quotePocketTv,
  quotePocketElectricity,
  readPocketDataCatalog,
  readPocketBillsAvailability,
  verifyPocketBillCustomer,
  refreshPocketAirtime,
  type PocketDataService,
  type PocketDataVariation,
  type PocketBillIntent,
  type PocketBillVerification,
} from '../api/pocketBillsClient'
import type { CirclePocketWallet } from '../models/pocketWallet'

type AccessTokenReader = () => Promise<string | null>
type FlowStatus = 'idle' | 'quoting' | 'ready' | 'paying' | 'confirming' | 'processing' | 'successful' | 'error'
const VTPASS_SANDBOX_SUCCESS_PHONE = '08011111111'

function sandboxDataRecipient(serviceId: string) {
  return serviceId === 'spectranet' ? '1212121212' : VTPASS_SANDBOX_SUCCESS_PHONE
}

function tvRequiresCustomerVerification(serviceId: string) {
  return serviceId !== 'showmax'
}

function sandboxBillAccount(category: 'tv' | 'electricity', variationCode = 'prepaid', serviceId = '') {
  if (category === 'tv') return tvRequiresCustomerVerification(serviceId) ? '1212121212' : VTPASS_SANDBOX_SUCCESS_PHONE
  return variationCode === 'postpaid' ? '1010101010101' : '1111111111111'
}

function billLabel(category: 'airtime' | 'data' | 'tv' | 'electricity') {
  return category === 'tv' ? 'TV' : category === 'electricity' ? 'Electricity' : category === 'data' ? 'Data' : 'Airtime'
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function confirmationPollDelay(attempt: number) {
  if (attempt === 0) return 600
  if (attempt === 1) return 1_000
  if (attempt === 2) return 1_500
  return 2_500
}

function deliveryPollDelay(attempt: number) {
  return attempt < 4 ? 1_000 : attempt < 8 ? 2_000 : 4_000
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
  const category = view
  const activeBillKey = `pocket:bills:active:${category}`
  const [availability, setAvailability] = useState<'loading' | 'enabled' | 'disabled'>('loading')
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox')
  const [airtimeEnabled, setAirtimeEnabled] = useState(false)
  const [dataEnabled, setDataEnabled] = useState(false)
  const [tvEnabled, setTvEnabled] = useState(false)
  const [electricityEnabled, setElectricityEnabled] = useState(false)
  const [serviceId, setServiceIdState] = useState('mtn')
  const [phone, setPhoneState] = useState('')
  const [amountNgn, setAmountNgnState] = useState('')
  const [variationCode, setVariationCodeState] = useState('')
  const [contactPhone, setContactPhoneState] = useState('')
  const [verification, setVerification] = useState<PocketBillVerification | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [dataServices, setDataServices] = useState<PocketDataService[]>([])
  const [dataVariations, setDataVariations] = useState<PocketDataVariation[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [intent, setIntent] = useState<PocketBillIntent | null>(null)
  const [status, setStatus] = useState<FlowStatus>('idle')
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [notice, setNotice] = useState('')
  const visibleCategory = useRef(category)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (visibleCategory.current === category) return
    visibleCategory.current = category
    setIntent(null)
    setStatus('idle')
    setError('')
    setErrorCode('')
    setNotice('')
    setVariationCodeState('')
    setAmountNgnState('')
    setVerification(null)
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
        setAirtimeEnabled(result.airtimeEnabled)
        setDataEnabled(result.dataEnabled)
        setTvEnabled(result.tvEnabled)
        setElectricityEnabled(result.electricityEnabled)
        if (result.environment === 'sandbox') {
          setPhoneState(view === 'tv' ? sandboxBillAccount('tv') : view === 'electricity' ? sandboxBillAccount('electricity') : VTPASS_SANDBOX_SUCCESS_PHONE)
          setContactPhoneState(VTPASS_SANDBOX_SUCCESS_PHONE)
          if (view === 'electricity') setVariationCodeState('prepaid')
        }
        setAvailability(result.enabled ? 'enabled' : 'disabled')
      })
      .catch(() => { if (!cancelled) setAvailability('disabled') })
    return () => { cancelled = true }
  }, [view])

  const resetResult = useCallback(() => {
    if (['paying', 'confirming', 'processing'].includes(status)) return
    setIntent(null)
    setStatus('idle')
    setError('')
    setErrorCode('')
    setNotice('')
    window.localStorage.removeItem(activeBillKey)
  }, [activeBillKey, status])

  const setServiceId = useCallback((value: string) => {
    setServiceIdState(value)
    if (category === 'data' && environment === 'sandbox') setPhoneState(sandboxDataRecipient(value))
    if ((category === 'tv' || category === 'electricity') && environment === 'sandbox') setPhoneState(sandboxBillAccount(category, variationCode, value))
    setVariationCodeState('')
    setAmountNgnState('')
    setDataVariations([])
    setVerification(null)
    resetResult()
  }, [category, environment, resetResult])
  const setPhone = useCallback((value: string) => { setPhoneState(value.replace(/[^\d+]/g, '').slice(0, 15)); setVerification(null); resetResult() }, [resetResult])
  const setContactPhone = useCallback((value: string) => { setContactPhoneState(value.replace(/[^\d+]/g, '').slice(0, 14)); resetResult() }, [resetResult])
  const setAmountNgn = useCallback((value: string) => {
    if (/^\d*(?:\.\d{0,2})?$/.test(value)) setAmountNgnState(value)
    resetResult()
  }, [resetResult])

  const setVariationCode = useCallback((value: string) => {
    const plan = dataVariations.find(item => item.variationCode === value)
    const nextCode = category === 'electricity' && (value === 'prepaid' || value === 'postpaid') ? value : plan?.variationCode ?? ''
    setVariationCodeState(nextCode)
    if (category !== 'electricity') setAmountNgnState(plan?.amountNgn ?? '')
    if (category === 'electricity' && environment === 'sandbox') setPhoneState(sandboxBillAccount('electricity', nextCode))
    if (category === 'electricity') setVerification(null)
    resetResult()
  }, [category, dataVariations, environment, resetResult])

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
      setErrorCode('BILLS_REFUNDED')
      setError(`Your ${billLabel(category)} payment was returned. No retry is needed.`)
      window.localStorage.removeItem(activeBillKey)
    } else if (next.state === 'provider_failed_unverified') {
      setStatus('processing')
      setNotice(`Verifying the final ${billLabel(category)} delivery status. Do not retry.`)
    } else if (next.state === 'refund_eligible') {
      setStatus('error')
      setError(`VTpass confirmed the ${billLabel(category)} purchase failed. Claim your refund from Bills activity.`)
    } else if (next.state === 'refund_pending') {
      setStatus('error')
      setError('This earlier refund requires manual review; do not retry.')
    } else if (next.state === 'refunding' || next.state === 'refund_submitted') {
      setStatus('error')
      setError('Your USDC refund is processing. Check Bills activity for confirmation.')
    } else if (next.state === 'failed') {
      setStatus('error')
      setError(next.failureReason || `${billLabel(category)} was not delivered. No payment was completed.`)
      window.localStorage.removeItem(activeBillKey)
    } else if (next.state === 'needs_review') {
      setStatus('error')
      setError('This payment needs review. Check Bills activity before retrying.')
    } else {
      setStatus('processing')
      setNotice(`Payment received. ${billLabel(category)} delivery is processing.`)
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
          await sleep(confirmationPollDelay(attempt))
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
        setNotice(`Payment received. ${billLabel(category)} delivery is processing.`)
      }
      await sleep(deliveryPollDelay(attempt))
      next = await refreshPocketAirtime({ accessToken, intentId, refresh: true })
      if (mounted.current) setIntent(next)
    }
    settleResult(next)
    return next
  }, [category, settleResult])

  useEffect(() => {
    if (!authenticated || availability !== 'enabled') return
    let cancelled = false
    let restoring = false
    const resume = () => {
      if (cancelled || restoring || document.visibilityState === 'hidden') return
      const active = readActive(activeBillKey)
      if (!active) return
      restoring = true
      setStatus(active.txHash ? 'confirming' : 'processing')
      setError('')
      setErrorCode('')
      void token()
        .then(accessToken => reconcile(active.intentId, active.txHash, accessToken))
        .catch(reason => {
          if (!mounted.current || cancelled) return
          setStatus('error')
          setError(reason instanceof Error ? reason.message : `Could not restore the ${billLabel(category)} payment.`)
        })
        .finally(() => { restoring = false })
    }
    const resumeWhenVisible = () => { if (document.visibilityState === 'visible') resume() }
    resume()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resumeWhenVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resumeWhenVisible)
    }
  }, [activeBillKey, authenticated, availability, category, reconcile, token])

  useEffect(() => {
    if (!intent || status !== 'ready') return
    const remaining = intent.quoteExpiresAt - Date.now()
    if (remaining <= 0) {
      setStatus('error')
      setErrorCode('BILLS_QUOTE_EXPIRED')
      setError(`The ${billLabel(category)} quote expired. Review the payment again.`)
      return
    }
    const timeout = window.setTimeout(() => {
      setStatus('error')
      setErrorCode('BILLS_QUOTE_EXPIRED')
      setError(`The ${billLabel(category)} quote expired. Review the payment again.`)
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [category, intent, status])

  useEffect(() => {
    const enabled = view === 'data' ? dataEnabled : view === 'tv' ? tvEnabled : view === 'electricity' ? electricityEnabled : false
    if (!authenticated || availability !== 'enabled' || view === 'airtime' || !enabled) return
    let cancelled = false
    setCatalogBusy(true)
    void token()
      .then(accessToken => readPocketDataCatalog({ accessToken, category: view }))
      .then(result => {
        if (cancelled) return
        setDataServices(result.services)
        const preferred = result.services.some(item => item.serviceId === serviceId) ? serviceId : result.services[0]?.serviceId ?? ''
        setServiceIdState(preferred)
        if (environment === 'sandbox' && preferred) setPhoneState(view === 'data' ? sandboxDataRecipient(preferred) : sandboxBillAccount(view, variationCode, preferred))
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : `${billLabel(view)} providers are temporarily unavailable.`) })
      .finally(() => { if (!cancelled) setCatalogBusy(false) })
    return () => { cancelled = true }
  }, [authenticated, availability, dataEnabled, electricityEnabled, environment, token, tvEnabled, view])

  useEffect(() => {
    const enabled = view === 'data' ? dataEnabled : view === 'tv' ? tvEnabled : false
    if (!authenticated || availability !== 'enabled' || (view !== 'data' && view !== 'tv') || !enabled || !serviceId || !dataServices.some(item => item.serviceId === serviceId)) return
    let cancelled = false
    setCatalogBusy(true)
    setDataVariations([])
    setVariationCodeState('')
    setAmountNgnState('')
    void token()
      .then(accessToken => readPocketDataCatalog({ accessToken, serviceId, category: view }))
      .then(result => {
        if (cancelled) return
        setDataVariations(result.variations)
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : `${billLabel(view)} plans are temporarily unavailable.`) })
      .finally(() => { if (!cancelled) setCatalogBusy(false) })
    return () => { cancelled = true }
  }, [authenticated, availability, dataEnabled, dataServices, serviceId, token, tvEnabled, view])

  const verifyCustomer = useCallback(async () => {
    if (category !== 'tv' && category !== 'electricity') return
    setVerifyBusy(true)
    setError('')
    setErrorCode('')
    try {
      const accessToken = await token()
      const result = await verifyPocketBillCustomer({ accessToken, category, serviceId, billersCode: phone, variationCode })
      setVerification(result)
    } catch (reason) {
      setVerification(null)
      setErrorCode(reason instanceof PocketBillsApiError ? reason.code : '')
      setError(reason instanceof Error ? reason.message : `Could not verify this ${category === 'tv' ? 'smartcard' : 'meter'}.`)
    } finally {
      setVerifyBusy(false)
    }
  }, [category, phone, serviceId, token, variationCode])

  const review = useCallback(async () => {
    if (availability !== 'enabled' || !authenticated || status === 'quoting') return
    setStatus('quoting')
    setError('')
    setErrorCode('')
    setNotice('')
    try {
      const wallet = baseWallet ?? await ensureBaseWallet()
      if (!wallet) throw new Error('Base wallet setup was cancelled.')
      const accessToken = await token()
      const result = category === 'data' ? await quotePocketData({ accessToken, serviceId, variationCode, phone, payerWallet: wallet.address })
        : category === 'tv' ? await quotePocketTv({ accessToken, serviceId, variationCode, smartcard: phone, contactPhone: tvRequiresCustomerVerification(serviceId) ? contactPhone : phone, payerWallet: wallet.address })
          : category === 'electricity' ? await quotePocketElectricity({ accessToken, serviceId, meterType: variationCode as 'prepaid' | 'postpaid', meterNumber: phone, contactPhone, amountNgn, payerWallet: wallet.address })
            : await quotePocketAirtime({ accessToken, serviceId, phone, amountNgn, payerWallet: wallet.address })
      if (result.intent.quoteExpiresAt <= Date.now()) throw new PocketBillsApiError(`The ${billLabel(category)} quote expired. Review it again.`, { code: 'BILLS_QUOTE_EXPIRED', status: 409 })
      setIntent(result.intent)
      setStatus('ready')
    } catch (reason) {
      setStatus('error')
      setErrorCode(reason instanceof PocketBillsApiError ? reason.code : '')
      setError(reason instanceof Error ? reason.message : `Could not prepare the ${billLabel(category)} payment.`)
    }
  }, [amountNgn, authenticated, availability, baseWallet, category, contactPhone, ensureBaseWallet, phone, serviceId, status, token, variationCode])

  const pay = useCallback(async () => {
    if (!intent || status !== 'ready') return
    setStatus('paying')
    setError('')
    setErrorCode('')
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
      setErrorCode(reason instanceof PocketBillsApiError ? reason.code : '')
      setError(reason instanceof Error ? reason.message : `${billLabel(category)} payment did not complete.`)
    }
  }, [activeBillKey, baseWallet, category, ensureBaseWallet, getEvmSession, intent, reconcile, status, token])

  const refresh = useCallback(async () => {
    if (!intent || !authenticated) return
    try {
      const accessToken = await token()
      await reconcile(intent.id, intent.txHash, accessToken)
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : `Could not refresh the ${billLabel(category)} payment.`)
    }
  }, [authenticated, category, intent, reconcile, token])

  const processing = ['quoting', 'paying', 'confirming', 'processing'].includes(status)
  const expectedSandboxRecipient = category === 'data' ? sandboxDataRecipient(serviceId) : category === 'tv' || category === 'electricity' ? sandboxBillAccount(category, variationCode, serviceId) : VTPASS_SANDBOX_SUCCESS_PHONE
  const recipientReady = category === 'airtime' ? /^0\d{10}$/.test(phone) : category === 'data' ? /^\d{10,12}$/.test(phone) : /^\d{8,15}$/.test(phone)
  const electricityAmountWithinLimits = category !== 'electricity' || !verification || (
    (verification.minimumAmount === null || Number(amountNgn) >= verification.minimumAmount)
    && (verification.maximumAmount === null || Number(amountNgn) <= verification.maximumAmount)
  )
  const formReady = recipientReady
    && (environment !== 'sandbox' || phone === expectedSandboxRecipient)
    && Number(amountNgn) > 0
    && (category === 'airtime' || Boolean(variationCode))
    && electricityAmountWithinLimits
    && (category === 'tv' && !tvRequiresCustomerVerification(serviceId)
      ? /^0\d{10}$/.test(phone)
      : ((category !== 'tv' && category !== 'electricity') || (Boolean(verification) && /^0\d{10}$/.test(contactPhone))))

  return {
    availability,
    environment,
    airtimeEnabled,
    dataEnabled,
    tvEnabled,
    electricityEnabled,
    serviceId,
    phone,
    amountNgn,
    variationCode,
    contactPhone,
    verification,
    tvVerificationRequired: category !== 'tv' || tvRequiresCustomerVerification(serviceId),
    verifyBusy,
    dataServices,
    dataVariations,
    catalogBusy,
    intent,
    status,
    error,
    errorCode,
    notice,
    processing,
    formReady,
    setServiceId,
    setPhone,
    setContactPhone,
    setAmountNgn,
    setVariationCode,
    verifyCustomer,
    edit: resetResult,
    review,
    pay,
    refresh,
  }
}

export type PocketBillsController = ReturnType<typeof usePocketBillsController>

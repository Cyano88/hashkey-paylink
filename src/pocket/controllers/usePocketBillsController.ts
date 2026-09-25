import { markPocketActivityDirty } from '../lib/pocketActivityCache'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { registerPocketPaymentPreparer } from '../lib/pocketPaymentApproval'
import {
  PocketBillsApiError,
  processPocketBillRefund,
  confirmPocketAirtime,
  preparePocketAirtime,
  quotePocketData,
  quotePocketAirtime,
  quotePocketTv,
  quotePocketElectricity,
  readPocketDataCatalog,
  readPocketBillsAvailability,
  cachedPocketBillsAvailability,
  verifyPocketBillCustomer,
  refreshPocketAirtime,
  type PocketDataService,
  type PocketDataVariation,
  type PocketBillIntent,
  type PocketBillVerification,
} from '../api/pocketBillsClient'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { normalizeNigerianMobileNumber } from '../lib/nigerianMobileNetwork'

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

function confirmationPollDelay(attempt: number, code: string) {
  // Base inclusion usually arrives within a few blocks. Check the first
  // pending result sooner; retain the longer backoff for provider outages.
  return attempt === 0 && code !== 'BILLS_PAYMENT_VERIFIER_UNAVAILABLE' ? 4_000 : 10_000
}

function deliveryPollDelay(attempt: number) {
  return attempt < 4 ? 1_000 : attempt < 8 ? 2_000 : 4_000
}

function finalState(intent: PocketBillIntent) {
  return ['delivered', 'failed', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)
}

function persistActive(key: string, intentId: string, txHash = '', idempotencyKey = '', identifiers?:{challengeId:string;transactionId:string}) {
  const previous=readActive(key+':attempt:'+intentId)
  const value=JSON.stringify({...previous,intentId,txHash:txHash||previous?.txHash||'',idempotencyKey,...identifiers})
  const current=readActive(key)
  if(!previous||!current||current.intentId===intentId)window.localStorage.setItem(key,value)
  window.localStorage.setItem(key+':attempt:'+intentId,value)
}

function readActive(key: string): { intentId: string; txHash: string; idempotencyKey: string; challengeId?:string; transactionId?:string } | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '{}')
    return typeof value.intentId === 'string' && value.intentId
      ? { challengeId:value.challengeId,transactionId:value.transactionId,intentId: value.intentId, txHash: typeof value.txHash === 'string' ? value.txHash : '', idempotencyKey: typeof value.idempotencyKey === 'string' ? value.idempotencyKey : '' }
      : null
  } catch {
    return null
  }
}

export default function usePocketBillsController({
  owner,
  view,
  authenticated,
  baseWallet,
  getAccessToken,
  ensureBaseWallet,
  getEvmSession,
  refreshBalances,
  recoverTransfer,
}: {
  owner: string
  view: 'airtime' | 'data' | 'tv' | 'electricity'
  authenticated: boolean
  baseWallet?: CirclePocketWallet
  getAccessToken: AccessTokenReader
  ensureBaseWallet: () => Promise<CirclePocketWallet | null>
  getEvmSession: (walletAddress: string) => Promise<CircleEvmEmailSession>
  recoverTransfer?: (input: { session: CircleEvmEmailSession | null; challengeId: string; transactionId?: string }) => Promise<string | null>
  refreshBalances: () => Promise<void>
}) {
  const recoveryReader = useRef(recoverTransfer); recoveryReader.current = recoverTransfer
  const category = view
  const tokenReader = useRef(getAccessToken); tokenReader.current = getAccessToken
  const balanceRefresher = useRef(refreshBalances); balanceRefresher.current = refreshBalances
  const activeBillKey = `pocket:bills:owned:${encodeURIComponent(owner.trim().toLowerCase())}:${category}`
  const savedAvailability = cachedPocketBillsAvailability()
  const [availability, setAvailability] = useState<'loading' | 'enabled' | 'disabled'>(savedAvailability ? savedAvailability.enabled ? 'enabled' : 'disabled' : 'loading')
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>(savedAvailability?.environment ?? 'sandbox')
  const [airtimeEnabled, setAirtimeEnabled] = useState(savedAvailability?.airtimeEnabled ?? false)
  const [dataEnabled, setDataEnabled] = useState(savedAvailability?.dataEnabled ?? false)
  const [tvEnabled, setTvEnabled] = useState(savedAvailability?.tvEnabled ?? false)
  const [electricityEnabled, setElectricityEnabled] = useState(savedAvailability?.electricityEnabled ?? false)
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
  const lastVerificationKey = useRef('')
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
    let initializedSandbox = false
    let cancelled = false, pending: Promise<void> | undefined, timer: ReturnType<typeof setTimeout>, failures = 0
    const refreshAvailability = () => {
      if (cancelled || document.visibilityState !== 'visible') return Promise.resolve()
      if (pending) return pending
      pending = readPocketBillsAvailability().then(result => {
        if (cancelled) return
        failures = 0
        setEnvironment(result.environment); setAirtimeEnabled(result.airtimeEnabled); setDataEnabled(result.dataEnabled)
        setTvEnabled(result.tvEnabled); setElectricityEnabled(result.electricityEnabled)
        if (result.environment === 'sandbox' && !initializedSandbox) {
          initializedSandbox = true
          setPhoneState(view === 'tv' ? sandboxBillAccount('tv') : view === 'electricity' ? sandboxBillAccount('electricity') : VTPASS_SANDBOX_SUCCESS_PHONE)
          setContactPhoneState(VTPASS_SANDBOX_SUCCESS_PHONE)
          if (view === 'electricity') setVariationCodeState('prepaid')
        }
        setAvailability(result.enabled ? 'enabled' : 'disabled')
      }).catch(() => { failures++ /* Retain verified configuration; unknown remains a shimmer. */ }).finally(() => { pending = undefined })
      return pending
    }
    const poll = async () => { await refreshAvailability(); if (!cancelled) timer = setTimeout(poll, failures ? Math.min(60_000, 15_000 * 2 ** (failures - 1)) : 60_000) }
    const visible = () => { if (document.visibilityState === 'visible') void refreshAvailability() }
    void poll()
    const unregister = registerPocketRefreshHandler(refreshAvailability)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => { cancelled = true; clearTimeout(timer); unregister(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible) }
  }, [view])

  const activePaymentSession = useRef<{ scope: string; session: CircleEvmEmailSession } | null>(null)
  const displayedAttempt=useRef('')
  const terminalAttempts = useRef(new Set<string>())
  const billPayInFlight=useRef(false)
  const [confirming,setConfirming]=useState(false)
  const [refundBusy, setRefundBusy] = useState(false)
  const refundInFlight = useRef(false)
  const billScope=useRef(activeBillKey);billScope.current=activeBillKey
  const dismiss=useCallback(()=>{displayedAttempt.current='';setIntent(null);setStatus('idle');setError('');setErrorCode('');setNotice('');setAmountNgnState('')},[])
  useEffect(() => { dismiss() }, [owner, dismiss])
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
    lastVerificationKey.current = ''
    setServiceIdState(value)
    if (category === 'data' && environment === 'sandbox') setPhoneState(sandboxDataRecipient(value))
    if ((category === 'tv' || category === 'electricity') && environment === 'sandbox') setPhoneState(sandboxBillAccount(category, variationCode, value))
    setVariationCodeState('')
    setAmountNgnState('')
    setDataVariations([])
    setVerification(null)
    resetResult()
  }, [category, environment, resetResult])
  const setPhone = useCallback((value: string) => {
    lastVerificationKey.current = ''
    const nextPhone = value.replace(/[^\d+]/g, '').slice(0, 15)
    setPhoneState(nextPhone)
    setVerification(null)
    resetResult()
  }, [resetResult])
  const setContactPhone = useCallback((value: string) => { setContactPhoneState(value.replace(/[^\d+]/g, '').slice(0, 14)); resetResult() }, [resetResult])
  const setAmountNgn = useCallback((value: string) => {
    if (/^\d*(?:\.\d{0,2})?$/.test(value)) setAmountNgnState(value)
    resetResult()
  }, [resetResult])

  const setVariationCode = useCallback((value: string) => {
    lastVerificationKey.current = ''
    const plan = dataVariations.find(item => item.variationCode === value)
    const nextCode = category === 'electricity' && (value === 'prepaid' || value === 'postpaid') ? value : plan?.variationCode ?? ''
    setVariationCodeState(nextCode)
    if (category !== 'electricity') setAmountNgnState(plan?.amountNgn ?? '')
    if (category === 'electricity' && environment === 'sandbox') setPhoneState(sandboxBillAccount('electricity', nextCode))
    if (category === 'electricity') setVerification(null)
    resetResult()
  }, [category, dataVariations, environment, resetResult])

  const token = useCallback(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const accessToken = await Promise.race([
        tokenReader.current(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Sign-in verification is taking longer. Please try again.')), 10_000) }),
      ])
      if (!accessToken) throw new Error('Sign in again to continue.')
      return accessToken
    } finally { clearTimeout(timer) }
  }, [])

  const settleResult = useCallback((next: PocketBillIntent) => {
    if (!mounted.current) return
    if (terminalAttempts.current.has(next.id) && !['delivered', 'refunded', 'failed'].includes(next.state)) return
    if (['delivered', 'refunded', 'failed'].includes(next.state)) {
      terminalAttempts.current.add(next.id)
      if (terminalAttempts.current.size > 32) terminalAttempts.current.delete(terminalAttempts.current.values().next().value!)
      try {
        window.localStorage.removeItem(activeBillKey + ':attempt:' + next.id)
        if (readActive(activeBillKey)?.intentId === next.id) window.localStorage.removeItem(activeBillKey)
      } catch { /* Storage cleanup must not hide a verified result. */ }
    }
    markPocketActivityDirty(owner)
    setIntent(next)
    if (next.state === 'delivered') {
      setStatus('successful')
      setNotice(environment === 'sandbox' ? 'VTpass sandbox test completed.' : `${next.serviceName} sent to ${next.phone}`)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
      void balanceRefresher.current().catch(() => undefined)
    } else if (next.state === 'refunded') {
      setStatus('error')
      setErrorCode('BILLS_REFUNDED')
      setError(`Your ${billLabel(category)} payment was returned. No retry is needed.`)
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
    } else if (next.state === 'needs_review') {
      setStatus('error')
      setError('This payment needs review. Check Bills activity before retrying.')
    } else {
      setStatus('processing')
      setNotice(`Payment received. ${billLabel(category)} delivery is processing.`)
    }
  }, [activeBillKey, category, environment, owner])

  const reconcile = useCallback(async (intentId: string, txHash: string, accessToken: string, restoring = false) => {
    const visible=()=>mounted.current&&billScope.current===activeBillKey&&displayedAttempt.current===intentId&&!terminalAttempts.current.has(intentId)
    let next: PocketBillIntent | null = null
    // Circle approval may finish before its transaction hash becomes available.
    // Resume only a recorded challenge; never execute another transfer here.
    const saved = readActive(activeBillKey + ':attempt:' + intentId)
    if (!txHash && saved?.challengeId) {
      const session = activePaymentSession.current?.scope === activeBillKey ? activePaymentSession.current.session : null
      const recoveredHash = await recoveryReader.current?.({ session, challengeId: saved.challengeId, transactionId: saved.transactionId })
      if (recoveredHash && billScope.current === activeBillKey) {
        txHash = recoveredHash
        try { persistActive(activeBillKey, intentId, txHash, saved.idempotencyKey) } catch { /* Submit proof even if device storage is full. */ }
      }
    }
    if (txHash) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          next = await confirmPocketAirtime({ accessToken, intentId, txHash })
          break
        } catch (reason) {
          if (!(reason instanceof PocketBillsApiError) || !['CONFIRMATION_REQUIRED', 'BILLS_PAYMENT_PENDING', 'BILLS_PAYMENT_VERIFIER_UNAVAILABLE'].includes(reason.code) || attempt === 2) throw reason
          if (visible()) setStatus('confirming')
          await sleep(confirmationPollDelay(attempt, reason.code))
        }
      }
    } else {
      next = await refreshPocketAirtime({ accessToken, intentId, refresh: true })
    }
    if (!next) throw new Error('Payment confirmation is temporarily unavailable.')
    markPocketActivityDirty(owner)
    if(visible())setIntent(next)
    for (let attempt = 0; !finalState(next) && !terminalAttempts.current.has(intentId) && attempt < 12; attempt += 1) {
      if (visible()) {
        setStatus('processing')
        setNotice(`Payment received. ${billLabel(category)} delivery is processing.`)
      }
      await sleep(deliveryPollDelay(attempt))
      next = await refreshPocketAirtime({ accessToken, intentId, refresh: true })
      if (visible()) setIntent(next)
    }
    if(['delivered','refunded','failed'].includes(next.state)){
      // A storage failure cannot suppress the server result.
      try {
      window.localStorage.removeItem(activeBillKey+':attempt:'+intentId)
      if(readActive(activeBillKey)?.intentId===intentId)window.localStorage.removeItem(activeBillKey)
      } catch { /* Keep rendering the verified result. */ }
    }
    if(visible())settleResult(next)
    return next
  }, [activeBillKey, category, owner, settleResult])

  useEffect(() => {
    if (!authenticated || availability !== 'enabled') return
    let cancelled = false
    let restoring = false
    const resume = () => {
      if (cancelled || restoring || billPayInFlight.current || document.visibilityState === 'hidden') return
      const active = readActive(activeBillKey)
      if (!active && !Object.keys(localStorage).some(key=>key.startsWith(activeBillKey+':attempt:'))) return
      restoring = true
      // Resume financial reconciliation quietly; never restore an old form.
      void token()
        .then(async accessToken=>{
          const records=new Map<string,{intentId:string;txHash:string;idempotencyKey:string}>(active?[[active.intentId,active]]:[])
          for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(activeBillKey+':attempt:')){const saved=readActive(key);if(saved)records.set(saved.intentId,saved)}}
          for(const saved of records.values()){if(cancelled)return;await reconcile(saved.intentId,saved.txHash,accessToken,true).catch(()=>undefined)}
        })
        .catch(reason => {
          if (!mounted.current || cancelled) return
          // A recovery transport error does not establish financial failure.
        })
        .finally(() => { restoring = false })
    }
    const resumeWhenVisible = () => { if (document.visibilityState === 'visible') resume() }
    resume()
    const recoveryTimer = window.setInterval(resume, 30_000)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resumeWhenVisible)
    return () => {
      cancelled = true
      window.clearInterval(recoveryTimer)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resumeWhenVisible)
    }
  }, [activeBillKey, authenticated, availability, category, reconcile, token])

  // The visible sheet follows server truth independently of the retry journal.
  // A different reader may consume that journal while this sheet is still open.
  useEffect(() => {
    if (!authenticated || !intent || !['confirming', 'processing'].includes(status) && !['refunding', 'refund_submitted'].includes(intent.state)) return
    const intentId = intent.id
    let cancelled = false, reading = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (cancelled || reading) return
      reading = true
      try {
        if (document.visibilityState === 'hidden') return
        const accessToken = await token()
        if (cancelled) return
        const next = await refreshPocketAirtime({ accessToken, intentId, refresh: false,
          fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8_000) }),
        })
        if (!cancelled && mounted.current && billScope.current === activeBillKey && displayedAttempt.current === intentId && finalState(next)) settleResult(next)
      } catch { /* Read failures do not change a financial outcome. */ }
      finally {
        reading = false
        if (!cancelled && !terminalAttempts.current.has(intentId)) timer = setTimeout(poll, 5_000)
      }
    }
    timer = setTimeout(poll, 2_000)
    const visible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void poll() } }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible) }
  }, [activeBillKey, authenticated, intent?.id, intent?.state, status, settleResult, token])

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

  useEffect(() => {
    const needsResolution = category === 'electricity' || (category === 'tv' && tvRequiresCustomerVerification(serviceId))
    if (!authenticated || !needsResolution || !serviceId || !/^\d{8,15}$/.test(phone) || (category === 'electricity' && !variationCode) || verifyBusy || verification) return
    const verificationKey = `${category}:${serviceId}:${variationCode}:${phone}`
    if (lastVerificationKey.current === verificationKey) return
    lastVerificationKey.current = verificationKey
    const timer = window.setTimeout(() => { void verifyCustomer() }, 250)
    return () => window.clearTimeout(timer)
  }, [authenticated, category, phone, serviceId, variationCode, verification, verifyBusy, verifyCustomer])

  const review = useCallback(async () => {
    if (availability !== 'enabled' || !authenticated || status === 'quoting') return
    const reviewScope=billScope.current
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
      if(!mounted.current||billScope.current!==reviewScope)return
      if (result.intent.quoteExpiresAt <= Date.now()) throw new PocketBillsApiError(`The ${billLabel(category)} quote expired. Review it again.`, { code: 'BILLS_QUOTE_EXPIRED', status: 409 })
      setIntent(result.intent)
      setStatus('ready')
    } catch (reason) {
      if(!mounted.current||billScope.current!==reviewScope)return
      setStatus('error')
      setErrorCode(reason instanceof PocketBillsApiError ? reason.code : '')
      setError(reason instanceof Error ? reason.message : `Could not prepare the ${billLabel(category)} payment.`)
    }
  }, [amountNgn, authenticated, availability, baseWallet, category, contactPhone, ensureBaseWallet, phone, serviceId, status, token, variationCode])

  const pay = useCallback(async () => {
    if (!intent || status !== 'ready' || billPayInFlight.current) return
    billPayInFlight.current=true
    setConfirming(true)
    const stillCurrent=()=>{if(!mounted.current||billScope.current!==activeBillKey||displayedAttempt.current!==intent.id)throw Error('Your Pocket account or bill changed.')}
    displayedAttempt.current=intent.id
    setStatus('paying')
    setError('')
    setErrorCode('')
    setNotice('')
    try {
      const wallet = baseWallet ?? await ensureBaseWallet()
      if (!wallet) throw new Error('Base wallet setup was cancelled.')
      stillCurrent()
      const accessToken = await token()
      stillCurrent()
      const prepared = await preparePocketAirtime({ accessToken, intentId: intent.id })
      stillCurrent()
      setIntent(prepared)
      const saved = readActive(activeBillKey)
      const idempotencyKey = saved?.intentId === prepared.id && saved.idempotencyKey ? saved.idempotencyKey : crypto.randomUUID()
      persistActive(activeBillKey, prepared.id, '', idempotencyKey)
      const session = await getEvmSession(wallet.address)
      stillCurrent()
      activePaymentSession.current = { scope: activeBillKey, session }
      const transfer = await executePocketEvmTransfer({
        session,
        linkedWalletAddress: wallet.address,
        recipient: prepared.treasuryAddress as `0x${string}`,
        amount: prepared.amountUsdc,
        idempotencyKey,
        onChallenge:ids=>persistActive(activeBillKey,prepared.id,'',idempotencyKey,ids),
        onAccepted:ids=>persistActive(activeBillKey,prepared.id,'',idempotencyKey,ids),
        confirm: false,
      })
      if (transfer.txHash) {
        try { persistActive(activeBillKey, prepared.id, transfer.txHash, idempotencyKey) } catch { /* A submitted payment must still reach reconciliation. */ }
      }
      if(mounted.current&&billScope.current===activeBillKey&&displayedAttempt.current===intent.id)setStatus('confirming')
      await reconcile(prepared.id, transfer.txHash || '', accessToken)
    } catch (reason) {
      if (!mounted.current || displayedAttempt.current!==intent.id || terminalAttempts.current.has(intent.id)) return
      const active=readActive(activeBillKey)
      setStatus(active?.intentId===intent.id&&(active.txHash||active.challengeId)?'processing':'error')
      setErrorCode(reason instanceof PocketBillsApiError ? reason.code : '')
      setError(active?.txHash||active?.challengeId?'':reason instanceof Error?reason.message:'Could not submit payment.')
    } finally { billPayInFlight.current=false;setConfirming(false) }
  }, [activeBillKey, baseWallet, category, ensureBaseWallet, getEvmSession, intent, reconcile, status, token])

  const claimRefund = useCallback(async () => {
    if (!intent || refundInFlight.current || !['refund_eligible', 'refunding', 'refund_submitted'].includes(intent.state)) return
    refundInFlight.current = true; setRefundBusy(true)
    try {
      const accessToken = await token()
      const result = await processPocketBillRefund({ accessToken, intentId: intent.id })
      if (mounted.current && billScope.current === activeBillKey && displayedAttempt.current === intent.id) settleResult(result.intent)
      markPocketActivityDirty(owner)
      if (result.intent.state === 'refunded') void balanceRefresher.current().catch(() => undefined)
    } catch (reason) { if (mounted.current && billScope.current === activeBillKey) setError(reason instanceof Error ? reason.message : 'Refund status is unavailable.') }
    finally { refundInFlight.current = false; setRefundBusy(false) }
  }, [activeBillKey, intent, owner, settleResult, token])

  const preparePaymentApproval = useCallback(async () => {
    if (!intent || status !== 'ready') throw new Error('Review the bill payment before confirming.')
    const wallet = baseWallet ?? await ensureBaseWallet()
    if (!wallet) throw new Error('Open your Base wallet before confirming this bill.')
    await getEvmSession(wallet.address)
  }, [baseWallet, ensureBaseWallet, getEvmSession, intent, status])

  useEffect(() => registerPocketPaymentPreparer(preparePaymentApproval), [preparePaymentApproval])

  const refresh = useCallback(async () => {
    if (!intent || !authenticated) return
    try {
      const accessToken = await token()
      await reconcile(intent.id, intent.txHash || readActive(activeBillKey + ':attempt:' + intent.id)?.txHash || '', accessToken)
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : `Could not refresh the ${billLabel(category)} payment.`)
    }
  }, [activeBillKey, authenticated, category, intent, reconcile, token])

  const processing = ['quoting', 'paying', 'confirming', 'processing'].includes(status)
  const expectedSandboxRecipient = category === 'data' ? sandboxDataRecipient(serviceId) : category === 'tv' || category === 'electricity' ? sandboxBillAccount(category, variationCode, serviceId) : VTPASS_SANDBOX_SUCCESS_PHONE
  const recipientReady = category === 'airtime' || category === 'data' ? /^0\d{10}$/.test(normalizeNigerianMobileNumber(phone)) : /^\d{8,15}$/.test(phone)
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
    confirming,
    dismiss,
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
    preparePaymentApproval,
    claimRefund,
    refundBusy,
    pay,
    refresh,
  }
}

export type PocketBillsController = ReturnType<typeof usePocketBillsController>

import { normalizePayoutAccount, pocketFiatCurrency } from '../lib/pocketFiatCorridors'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard, formatAmount } from '../../lib/utils'
import { readCachedPocketBankInstitutions, readPocketBankInstitutions, verifyPocketBankAccount } from '../api/pocketBankClient'
import { createPocketBankReceive } from '../api/pocketBankReceiveClient'
import { hashPayLinkAppOriginForOrigin, pocketRuntimeOrigin } from '../lib/pocketRoutes'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'
import { readablePocketBankPayoutError } from './pocketBankErrors'
import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'

type PocketAccessTokenReader = () => Promise<string | null>

export default function usePocketBankReceiveController({
  authenticated,
  email,
  getAccessToken,
  profile,
  profileDraft,
  allowThirdPartyAccount = false,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  profile: LocalCurrencyProfile | null
  profileDraft: LocalCurrencyProfile
  allowThirdPartyAccount?: boolean
}) {
  const verificationSequence = useRef(0)
  const verificationOwner = useRef(email)
  verificationOwner.current = authenticated ? email : ''
  useEffect(()=>()=>{verificationSequence.current++},[])
  const [country, setCountryState] = useState('NG')
  const cachedInstitutions = useRef(readCachedPocketBankInstitutions())
  const [institutions, setInstitutions] = useState<Array<{ code: string; name: string }>>(() => cachedInstitutions.current?.institutions ?? [])
  const [institutionsBusy, setInstitutionsBusy] = useState(() => !cachedInstitutions.current)
  const [bankCode, setBankCode] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [nameRequired, setNameRequired] = useState(false)
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [amount, setAmountState] = useState('')
  const [memo, setMemoState] = useState('')
  const [flexibleAmount, setFlexibleAmountState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [dashboardUrl, setDashboardUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const idempotencyKey = useRef('')
  const lastVerificationKey = useRef('')
  const qrRef = useRef<HTMLDivElement>(null)
  const qrHiResRef = useRef<HTMLDivElement>(null)

  const amountDirty = amount.length > 0
  const amountValid = amountDirty && /^(?:\d+|\d*\.\d+)$/.test(amount) && Number(amount) > 0
  const profileReady = Boolean(profile?.resolvedName && (profile.email || email))
  const normalizeName = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).sort().join(' ')
  const profileVerified = profile?.nameStatus === 'kyc_verified' && Boolean(profile.resolvedName)
  const staleOwnerNameRejection = /different verified name/i.test(error)
  const beneficiaryVerified = (verified && (!nameRequired || (accountName.trim().length >= 2 && accountName.trim().toUpperCase() !== 'OK'))) || (allowThirdPartyAccount && staleOwnerNameRejection && Boolean(accountName))
  const displayedError = allowThirdPartyAccount && staleOwnerNameRejection ? '' : error
  const identityMatches = profileVerified && beneficiaryVerified && (allowThirdPartyAccount || normalizeName(accountName) === normalizeName(profile?.resolvedName ?? ''))
  const canSubmit = (flexibleAmount || amountValid) && identityMatches && Boolean(bankCode && accountName) && authenticated && profileReady

  const invalidateResult = useCallback(() => {
    setGeneratedLink('')
    setDashboardUrl('')
    setCopied(false)
  }, [])

  useEffect(() => {
    let current = true
    const cached = readCachedPocketBankInstitutions(pocketFiatCurrency(country))
    setInstitutions(cached?.institutions ?? [])
    setInstitutionsBusy(!cached)
    readPocketBankInstitutions(fetch, pocketFiatCurrency(country))
      .then(data => {
        if (current) setInstitutions(data.institutions)
      })
      .catch(reason => {
        if (!current) return
        if (!cached) {
          setInstitutions([])
          setError(readablePocketBankPayoutError(reason, 'Could not load banks.'))
        }
      })
      .finally(() => {
        if (current) setInstitutionsBusy(false)
      })
    return () => { current = false }
  }, [country])

  const setCountry = useCallback((value: string) => {
    if (value === country || !['NG','UG'].includes(value) || (!allowThirdPartyAccount && value !== 'NG')) return
    setBankCode('');setBankName('');setAccountNumber('');setAccountName('');setVerified(false);setNameRequired(false);setError('');setInstitutions([]);setInstitutionsBusy(true);lastVerificationKey.current=''
    verificationSequence.current++
    setVerifying(false)
    idempotencyKey.current = ''
    setCountryState(value)
    invalidateResult()
  }, [country, allowThirdPartyAccount, invalidateResult])

  const setInstitution = useCallback((code: string, name: string, resetAccount: boolean) => {
    verificationSequence.current++
    setVerifying(false)
    idempotencyKey.current = ''
    lastVerificationKey.current = ''
    setBankCode(code)
    setBankName(name)
    if (resetAccount) setAccountNumber('')
    setVerified(false);setNameRequired(false)
    setAccountName('')
    setError('')
    invalidateResult()
  }, [invalidateResult])

  const setAccount = useCallback((value: string) => {
    verificationSequence.current++
    setVerifying(false)
    idempotencyKey.current = ''
    lastVerificationKey.current = ''
    setAccountNumber(value.replace(/\D/g, '').slice(0, country === 'UG' ? 12 : 10))
    setVerified(false);setNameRequired(false)
    setAccountName('')
    setError('')
    invalidateResult()
  }, [country, invalidateResult])

  const verify = useCallback(async () => {
    const sequence = ++verificationSequence.current
    const valid = () => sequence === verificationSequence.current && verificationOwner.current === email
    setVerifying(true)
    setError('')
    setVerified(false);setNameRequired(false)
    setAccountName('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to verify this bank account.')
      const data = await verifyPocketBankAccount({
        accessToken,
        request: {
          currency: pocketFiatCurrency(country),
          bank_code: bankCode,
          bank_name: bankName,
          account_number: accountNumber,
        },
      })
      if (!valid()) return
      if (data.bank_code) setBankCode(String(data.bank_code).trim())
      if (data.name_required) {
        if (!allowThirdPartyAccount || country !== 'UG') throw new Error('This provider does not verify account ownership. Use an account that returns your registered name.')
        setNameRequired(true)
        setVerified(true)
        return
      }
      const resolved = String(data.account_name ?? '').trim()
      setAccountName(resolved)
      if (!allowThirdPartyAccount && profileVerified && normalizeName(resolved) !== normalizeName(profile?.resolvedName ?? '')) {
        setError('This account belongs to a different verified name. Use an account in your verified name.')
        return
      }
      setVerified(true)
    } catch (reason) {
      if (valid()) setError(readablePocketBankPayoutError(reason, 'Account verification failed'))
    } finally {
      if (valid()) setVerifying(false)
    }
  }, [country, email, accountNumber, allowThirdPartyAccount, bankCode, bankName, getAccessToken, profile?.resolvedName, profileVerified])

  useEffect(() => {
    if (!authenticated || !bankCode || !normalizePayoutAccount(accountNumber, pocketFiatCurrency(country)) || verifying || verified) return
    const verificationKey = `${bankCode}:${accountNumber}`
    if (lastVerificationKey.current === verificationKey) return
    const timer = window.setTimeout(() => { lastVerificationKey.current = verificationKey; void verify() }, 250)
    return () => window.clearTimeout(timer)
  }, [accountNumber, authenticated, bankCode, verified, verify, verifying])

  const setAmount = useCallback((value: string) => {
    idempotencyKey.current = ''
    setAmountState(normalizePocketAmountInput(value))
    invalidateResult()
  }, [invalidateResult])

  const setMemo = useCallback((value: string) => {
    idempotencyKey.current = ''
    setMemoState(value)
    invalidateResult()
  }, [invalidateResult])

  const setFlexibleAmount = useCallback((enabled: boolean) => {
    idempotencyKey.current = ''
    setFlexibleAmountState(enabled)
    if (enabled) setAmountState('')
    invalidateResult()
  }, [invalidateResult])

  const submit = useCallback(async () => {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to create bank receive links.')
      const currentIdempotencyKey = idempotencyKey.current || window.crypto.randomUUID()
      idempotencyKey.current = currentIdempotencyKey
      const data = await createPocketBankReceive({
        accessToken,
        idempotencyKey: currentIdempotencyKey,
        request: {
          owner_email: email,
          owner_first_name: profile?.firstName || profileDraft.firstName,
          owner_last_name: profile?.lastName || profileDraft.lastName,
          display_name: memo.trim() || 'Bank receive',
          amount: flexibleAmount ? '' : amount,
          flexible_amount: flexibleAmount,
          bank_name: bankName,
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
          client_origin: pocketRuntimeOrigin(),
        },
      })
      idempotencyKey.current = ''
      const paymentUrl = data.link.payment_url
      const nextDashboardUrl = data.link.dashboard_url || `${hashPayLinkAppOriginForOrigin(pocketRuntimeOrigin())}/dashboard?n=base`
      setGeneratedLink(paymentUrl)
      setDashboardUrl(nextDashboardUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create bank receive link.')
    } finally {
      setBusy(false)
    }
  }, [accountName, accountNumber, amount, bankCode, bankName, canSubmit, email, flexibleAmount, getAccessToken, memo, profile, profileDraft])

  const copy = useCallback(async () => {
    if (!generatedLink) return
    await copyToClipboard(generatedLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }, [generatedLink])

  const shareText = useMemo(() => {
    const cleanedMemo = memo.trim()
    return cleanedMemo
      ? `Pay ${formatAmount(amount, 6)} USDC for ${cleanedMemo}`
      : `Pay ${formatAmount(amount, 6)} USDC with Hash PayLink`
  }, [amount, memo])

  const share = useCallback(async () => {
    if (!generatedLink) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hash PayLink', text: shareText, url: generatedLink })
        return
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
      }
    }
    setShareOpen(true)
  }, [generatedLink, shareText])

  const downloadQr = useCallback(() => {
    const canvas = qrHiResRef.current?.querySelector('canvas')
    if (!canvas) return
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')
    if (!context) return
    context.drawImage(canvas, 0, 0)
    const logo = new Image()
    logo.onload = () => {
      const size = Math.round(canvas.width * 0.15)
      const x = Math.round((canvas.width - size) / 2)
      const y = Math.round((canvas.height - size) / 2)
      const padding = 10
      context.fillStyle = '#ffffff'
      context.fillRect(x - padding, y - padding, size + padding * 2, size + padding * 2)
      context.drawImage(logo, x, y, size, size)
      const anchor = document.createElement('a')
      anchor.href = output.toDataURL('image/png')
      anchor.download = `${(memo.trim() || 'payment-link').replace(/\s+/g, '-')}-qr.png`
      anchor.click()
    }
    logo.src = '/hash-logo.png'
  }, [memo])

  const reset = useCallback(() => {
    idempotencyKey.current = ''
    setAmountState('')
    setMemoState('')
    setFlexibleAmountState(false)
    setGeneratedLink('')
    setDashboardUrl('')
    setCopied(false)
    setShareOpen(false)
  }, [])

  return {
    country,
    institutions,
    institutionsBusy,
    bankCode,
    bankName,
    accountNumber,
    accountName,
    nameRequired,
    setRecipientName: (value: string) => { if (nameRequired && allowThirdPartyAccount) { setAccountName(value.slice(0, 160)); invalidateResult() } },
    verified: beneficiaryVerified,
    profileVerified,
    identityMatches,
    verifying,
    amount,
    amountDirty,
    amountValid,
    memo,
    flexibleAmount,
    busy,
    error: displayedError,
    canSubmit,
    generatedLink,
    dashboardUrl,
    copied,
    shareOpen,
    shareText,
    qrRef,
    qrHiResRef,
    setCountry,
    setInstitution,
    setAccount,
    verify,
    setAmount,
    setMemo,
    setFlexibleAmount,
    submit,
    copy,
    share,
    closeShare: () => setShareOpen(false),
    downloadQr,
    reset,
  }
}

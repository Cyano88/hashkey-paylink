import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard } from '../../lib/utils'
import { readPocketBankInstitutions, verifyPocketBankAccount } from '../api/pocketBankClient'
import { createPocketPos } from '../api/pocketPosClient'
import type { PocketPosMerchant } from '../lib/pocketSchemas'
import { hashPayLinkAppOriginForOrigin, POCKET_BASE_PATH } from '../lib/pocketRoutes'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'
import { readablePocketBankPayoutError } from './pocketBankErrors'
import { usePocketPosController } from './usePocketMoveControllers'

type PocketAccessTokenReader = () => Promise<string | null>
export type PocketPosRouteStep = 'country' | 'setup' | 'ready'

export default function usePocketPosPageController({
  authenticated,
  email,
  getAccessToken,
  profile,
  profileReady,
  routeStep,
  onStepChange,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  profile: LocalCurrencyProfile | null
  profileReady: boolean
  routeStep: PocketPosRouteStep
  onStepChange: (step: PocketPosRouteStep) => void
}) {
  const [country, setCountry] = useState<string | null>(null)
  const [merchantName, setMerchantName] = useState('')
  const [institutions, setInstitutions] = useState<Array<{ code: string; name: string }>>([])
  const [institutionsBusy, setInstitutionsBusy] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankVerified, setBankVerified] = useState(false)
  const [bankVerifyBusy, setBankVerifyBusy] = useState(false)
  const [merchant, setMerchant] = useState<PocketPosMerchant | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const creationIdempotencyKey = useRef('')
  const lastVerificationKey = useRef('')
  const normalizeName = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
  const profileVerified = profile?.nameStatus === 'bank_resolved' && Boolean(profile.resolvedName)
  const identityMatches = profileVerified && bankVerified && normalizeName(bankAccountName) === normalizeName(profile?.resolvedName ?? '')

  const resetBank = useCallback(() => {
    lastVerificationKey.current = ''
    setBankName('')
    setBankCode('')
    setBankAccount('')
    setBankAccountName('')
    setBankVerified(false)
    setBankVerifyBusy(false)
  }, [])

  useEffect(() => {
    if (routeStep === 'setup' || routeStep === 'ready') {
      setCountry('NG')
      if (routeStep === 'setup') {
        setMerchant(null)
        setCopied(false)
      }
      return
    }
    setCountry(null)
    setMerchant(null)
    setCopied(false)
    resetBank()
    setError('')
  }, [resetBank, routeStep])

  useEffect(() => {
    if (!country) return
    let current = true
    setInstitutionsBusy(true)
    readPocketBankInstitutions()
      .then(data => {
        if (current) setInstitutions(data.institutions)
      })
      .catch(reason => {
        if (!current) return
        setInstitutions([])
        setError(readablePocketBankPayoutError(reason, 'Could not load banks.'))
      })
      .finally(() => {
        if (current) setInstitutionsBusy(false)
      })
    return () => { current = false }
  }, [country])

  const verifyBankAccount = useCallback(async () => {
    setBankVerifyBusy(true)
    setError('')
    setBankVerified(false)
    setBankAccountName('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to verify this bank account.')
      const data = await verifyPocketBankAccount({
        accessToken,
        request: {
          bank_code: bankCode,
          bank_name: bankName,
          account_number: bankAccount,
        },
      })
      if (data.bank_code) setBankCode(String(data.bank_code).trim())
      const resolved = String(data.account_name ?? '').trim()
      setBankAccountName(resolved)
      if (profileVerified && normalizeName(resolved) !== normalizeName(profile?.resolvedName ?? '')) {
        setError('This account belongs to a different verified name. Use an account in your verified name.')
        return
      }
      setBankVerified(true)
    } catch (reason) {
      setError(readablePocketBankPayoutError(reason, 'Account verification failed'))
    } finally {
      setBankVerifyBusy(false)
    }
  }, [bankAccount, bankCode, bankName, getAccessToken, profile?.resolvedName, profileVerified])

  useEffect(() => {
    if (!authenticated || !bankCode || bankAccount.length !== 10 || bankVerifyBusy || bankVerified) return
    const verificationKey = `${bankCode}:${bankAccount}`
    if (lastVerificationKey.current === verificationKey) return
    lastVerificationKey.current = verificationKey
    const timer = window.setTimeout(() => { void verifyBankAccount() }, 250)
    return () => window.clearTimeout(timer)
  }, [authenticated, bankAccount, bankCode, bankVerified, bankVerifyBusy, verifyBankAccount])

  const canSubmit = Boolean(
    authenticated &&
    !busy &&
    merchantName.trim() &&
    identityMatches &&
    bankCode &&
    bankAccountName &&
    profileReady
  )

  const createMerchant = useCallback(async () => {
    if (!authenticated) {
      setError('Sign in to create POS and save local currency receipts.')
      return
    }
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to create POS.')
      const idempotencyKey = creationIdempotencyKey.current || window.crypto.randomUUID()
      creationIdempotencyKey.current = idempotencyKey
      const data = await createPocketPos({
        accessToken,
        idempotencyKey,
        request: {
          owner_email: email,
          owner_first_name: profile?.firstName,
          owner_last_name: profile?.lastName,
          payout_preference: 'INSTANT_FIAT',
          display_name: merchantName.trim(),
          supported_networks: ['base'],
          circle_smart_wallet_address: '',
          solana_wallet_address: '',
          bank_name: bankName.trim(),
          bank_code: bankCode.trim(),
          account_number: bankAccount.trim(),
          account_name: bankAccountName.trim(),
        },
      })
      setMerchant(data.merchant)
      creationIdempotencyKey.current = ''
      onStepChange('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'POS setup failed')
    } finally {
      setBusy(false)
    }
  }, [authenticated, bankAccount, bankAccountName, bankCode, bankName, canSubmit, email, getAccessToken, merchantName, onStepChange, profile])

  const controller = usePocketPosController({
    draft: {
      merchantName,
      country: country ?? '',
      networks: ['base'],
      bankName,
      bankAccountLast4: bankAccount.slice(-4),
      accountVerified: bankVerified,
    },
    canSubmit,
    submitting: busy,
    completed: Boolean(merchant),
    submit: () => { void createMerchant() },
    actions: {
      selectCountry: selectedCountry => {
        if (!authenticated || !profileReady) {
          setError('Sign in and save your payout profile before creating POS.')
          return
        }
        setCountry(selectedCountry)
        setError('')
        onStepChange('setup')
      },
      setMerchantName: name => {
        setMerchantName(name)
        setError('')
      },
      toggleNetwork: () => {
        setError('')
      },
      setBankInstitution: (code, name) => {
        lastVerificationKey.current = ''
        setBankCode(code)
        setBankName(name)
        setBankVerified(false)
        setBankAccountName('')
        setError('')
      },
      setManualBankCode: code => {
        lastVerificationKey.current = ''
        setBankCode(code.toUpperCase().trim())
        setBankName('')
        setBankVerified(false)
        setBankAccountName('')
        setError('')
      },
      setBankAccount: accountNumber => {
        lastVerificationKey.current = ''
        setBankAccount(accountNumber.replace(/\D/g, '').slice(0, 10))
        setBankVerified(false)
        setBankAccountName('')
        setError('')
      },
      verifyBankAccount: () => { void verifyBankAccount() },
    },
  })

  const customerUrl = merchant
    ? `${hashPayLinkAppOriginForOrigin(window.location.origin)}/pos/ng?merchant_id=${encodeURIComponent(merchant.merchant_id)}`
    : ''
  const dashboardUrl = merchant
    ? `${POCKET_BASE_PATH}/activity/pos?terminal=${encodeURIComponent(merchant.merchant_id)}`
    : ''

  const copyCustomerUrl = useCallback(async () => {
    if (!customerUrl) return
    await copyToClipboard(customerUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }, [customerUrl])

  return useMemo(() => ({
    controller,
    country,
    merchant,
    institutions,
    institutionsBusy,
    bankCode,
    bankAccount,
    bankAccountName,
    bankVerified,
    profileVerified,
    identityMatches,
    bankVerifyBusy,
    error,
    copied,
    customerUrl,
    dashboardUrl,
    copyCustomerUrl,
  }), [bankAccount, bankAccountName, bankCode, bankVerified, bankVerifyBusy, controller, copied, country, customerUrl, dashboardUrl, error, institutions, institutionsBusy, merchant, copyCustomerUrl])
}

import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, Copy, LayoutDashboard, Loader2, QrCode } from 'lucide-react'
import { cn } from '../lib/utils'

type SettlementType = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'

const POS_NETWORK_LABELS: Record<PosNetwork, string> = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  arc: 'Arc Testnet',
  solana: 'Solana',
}

function supportedMerchantNetworks(value: unknown): PosNetwork[] {
  const allowed: PosNetwork[] = ['base', 'arbitrum', 'arc', 'solana']
  const raw = Array.isArray(value) ? value : ['base']
  const selected = raw.filter((item): item is PosNetwork => allowed.includes(item as PosNetwork))
  return selected.length ? Array.from(new Set(selected)) : ['base']
}

function formatNgn(value: number) {
  if (!Number.isFinite(value)) return 'NGN 0'
  return `NGN ${value.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
}

function formatUsdc(value: number) {
  if (!Number.isFinite(value)) return '0 USDC'
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC`
}

type PublicMerchant = {
  merchant_id: string
  display_name: string
  country: 'NG'
  payout_preference: SettlementType
  settlement_enabled: boolean
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'RESTRICTED'
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
  bank_configured: boolean
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
  fx_rate_ngn_per_usdc?: string
  fx_source?: string
}

type Quote = {
  quote_id: string
  merchant_id: string
  network: PosNetwork
  supported_networks?: PosNetwork[]
  settlement_type: SettlementType
  amount_ngn: string
  amount_usdc: string
  fx_rate_ngn_per_usdc: string
  fx_source: string
  expires_at: string
  pay_url: string
  fiat_execution_ready: boolean
  offramp_provider?: 'paycrest'
  intent_id?: string
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
}

const emptySetup = {
  display_name: '',
  circle_smart_wallet_address: '',
  bank_name: '',
  bank_code: '',
  account_number: '',
  account_name: '',
}

export default function NigerianPos() {
  const params = new URLSearchParams(window.location.search)
  const initialMerchantId = params.get('merchant_id') ?? ''
  const initialManageMode = params.get('manage') === '1'
  const [merchantId, setMerchantId] = useState(initialMerchantId)
  const [merchant, setMerchant] = useState<PublicMerchant | null>(null)
  const [setup, setSetup] = useState(emptySetup)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [bankVerifyBusy, setBankVerifyBusy] = useState(false)
  const [bankVerified, setBankVerified] = useState(false)
  const [showMerchantQr, setShowMerchantQr] = useState(initialManageMode)
  const [copied, setCopied] = useState(false)
  const [settlementStep, setSettlementStep] = useState<'select' | 'amount'>('select')
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementType>('KEEP_CRYPTO')
  const [selectedNetwork, setSelectedNetwork] = useState<PosNetwork>('base')
  const [amountCurrency, setAmountCurrency] = useState<'NGN' | 'USDC'>('NGN')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteError, setQuoteError] = useState('')

  const posUrl = useMemo(() => {
    if (!merchantId) return ''
    const url = new URL('/pos/ng', window.location.origin)
    url.searchParams.set('merchant_id', merchantId)
    return url.toString()
  }, [merchantId])

  const dashboardUrl = useMemo(() => {
    if (!merchant?.merchant_id) return ''
    const networks = supportedMerchantNetworks(merchant.supported_networks)
    const dashboardNetwork = networks.find((network) => network !== 'solana') ?? 'solana'
    const dashboardAddress = dashboardNetwork === 'solana' ? merchant.solana_wallet_address : merchant.circle_smart_wallet_address
    if (!dashboardAddress) return ''
    const url = new URL('/dashboard', window.location.origin)
    url.searchParams.set(dashboardNetwork === 'solana' ? 's' : 'e', dashboardAddress)
    url.searchParams.set('n', dashboardNetwork)
    url.searchParams.set('id', `ngpos-${merchant.merchant_id}`)
    url.searchParams.set('src', 'ngpos')
    return url.toString()
  }, [merchant])

  const merchantNetworks = useMemo(
    () => supportedMerchantNetworks(merchant?.supported_networks),
    [merchant?.supported_networks],
  )
  const posRate = Number(merchant?.fx_rate_ngn_per_usdc)
  const amountValue = Number(String(amount).replace(/,/g, '').trim())
  const hasAmountValue = Number.isFinite(amountValue) && amountValue > 0
  const convertedNgn = hasAmountValue && Number.isFinite(posRate) && posRate > 0
    ? amountCurrency === 'USDC' ? amountValue * posRate : amountValue
    : null
  const convertedUsdc = hasAmountValue && Number.isFinite(posRate) && posRate > 0
    ? amountCurrency === 'USDC' ? amountValue : amountValue / posRate
    : null

  useEffect(() => {
    if (!merchantId) return
    let ignore = false
    setQuote(null)
    fetch(`/api/ng-pos?merchant_id=${encodeURIComponent(merchantId)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Merchant not found')
        if (!ignore) {
          setMerchant(data.merchant)
          setSelectedNetwork(supportedMerchantNetworks(data.merchant.supported_networks)[0])
          const bankConfigured = Boolean(data.merchant.bank_configured)
          setSelectedSettlement(bankConfigured ? 'INSTANT_FIAT' : data.merchant.payout_preference ?? 'KEEP_CRYPTO')
          setAmountCurrency(bankConfigured ? 'NGN' : 'USDC')
          setSettlementStep(bankConfigured ? 'amount' : 'select')
        }
      })
      .catch((err) => {
        if (!ignore) setSetupError(err instanceof Error ? err.message : 'Merchant not found')
      })
    return () => {
      ignore = true
    }
  }, [merchantId])

  async function createMerchant() {
    setSetupBusy(true)
    setSetupError('')
    try {
      const res = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'createMerchant',
          payout_preference: bankVerified ? 'INSTANT_FIAT' : 'KEEP_CRYPTO',
          ...setup,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'POS setup failed')
      setMerchant(data.merchant)
      setMerchantId(data.merchant.merchant_id)
      setShowMerchantQr(true)
      window.history.replaceState(null, '', `/pos/ng?merchant_id=${encodeURIComponent(data.merchant.merchant_id)}&manage=1`)
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'POS setup failed')
    } finally {
      setSetupBusy(false)
    }
  }

  async function verifyBankAccount() {
    setBankVerifyBusy(true)
    setSetupError('')
    setBankVerified(false)
    try {
      const res = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'verifyAccount',
          bank_code: setup.bank_code,
          account_number: setup.account_number,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Bank verification failed')
      setSetup({ ...setup, account_name: data.account_name })
      setBankVerified(true)
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Bank verification failed')
    } finally {
      setBankVerifyBusy(false)
    }
  }

  async function requestQuote() {
    if (!merchant) return
    setQuoteBusy(true)
    setQuoteError('')
    setQuote(null)
    try {
      const res = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'quote',
          merchant_id: merchant.merchant_id,
          network: selectedNetwork,
          settlement_type: selectedSettlement,
          amount_currency: amountCurrency,
          amount,
          client_origin: window.location.origin,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Quote failed')
      const nextQuote = data.quote as Quote
      setQuote(nextQuote)
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Quote failed')
    } finally {
      setQuoteBusy(false)
    }
  }

  async function copyQrLink() {
    if (!posUrl) return
    await navigator.clipboard.writeText(posUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (!merchantId || (!merchant && !initialMerchantId)) {
    return (
      <PosShell eyebrow="Nigerian Retail Mode" title="Create POS QR" body="Set up one static QR for local in-person payments.">
        <div className="space-y-4">
          <div className="grid gap-3">
            <TextField label="Merchant name" value={setup.display_name} onChange={(display_name) => setSetup({ ...setup, display_name })} placeholder="Shy Stores" />
            <TextField label="Circle wallet" value={setup.circle_smart_wallet_address} onChange={(circle_smart_wallet_address) => setSetup({ ...setup, circle_smart_wallet_address })} placeholder="0x..." />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Naira bank payout</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Payers pay Base USDC. Naira goes to this bank account.</p>
              </div>
              <Banknote className="h-4 w-4 shrink-0 text-gray-400" />
            </div>
            <div className="grid gap-3">
              <TextField label="Bank name" value={setup.bank_name} onChange={(bank_name) => { setSetup({ ...setup, bank_name }); setBankVerified(false) }} placeholder="Guaranty Trust Bank" />
              <TextField label="Paycrest bank code" value={setup.bank_code} onChange={(bank_code) => { setSetup({ ...setup, bank_code: bank_code.toUpperCase() }); setBankVerified(false) }} placeholder="GTBINGLA" />
              <TextField label="Account number" value={setup.account_number} onChange={(account_number) => { setSetup({ ...setup, account_number: account_number.replace(/\D/g, '').slice(0, 10) }); setBankVerified(false) }} placeholder="0123456789" />
              {setup.account_name && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                  {setup.account_name}
                </div>
              )}
              <button
                type="button"
                onClick={verifyBankAccount}
                disabled={bankVerifyBusy || !setup.bank_code || setup.account_number.length !== 10}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-800 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
              >
                {bankVerifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : bankVerified ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Banknote className="h-4 w-4" />}
                {bankVerified ? 'Bank verified' : 'Verify bank account'}
              </button>
            </div>
          </div>

          {setupError && <ErrorNote message={setupError} />}
          <button
            type="button"
            onClick={createMerchant}
            disabled={setupBusy || (!!setup.bank_code && !bankVerified)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            {setupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Generate POS QR
          </button>
        </div>
      </PosShell>
    )
  }

  if (!merchant) {
    return (
      <PosShell eyebrow="Nigerian Retail Mode" title="Loading POS" body="Fetching payout options.">
        {setupError ? <ErrorNote message={setupError} /> : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
      </PosShell>
    )
  }

  if (showMerchantQr) {
    return (
      <PosShell eyebrow="Nigerian Retail Mode" title="POS QR ready" body="One static QR for local in-person payments.">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-4">
              {posUrl && (
                <div className="rounded-xl bg-white p-2 shadow-sm">
                  <QRCodeSVG value={posUrl} size={112} />
                </div>
              )}
              <div className="min-w-0">
                <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:border-white/10 dark:bg-white/[0.06]">
                  Static POS QR
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{merchant.display_name}</p>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">Payers scan once and enter their amount.</p>
                <button
                  type="button"
                  onClick={copyQrLink}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied' : 'Copy payer link'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-gray-500">Payer link ready</p>
          </div>

          <div className="grid gap-2">
            {dashboardUrl && (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open today's receipts
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setShowMerchantQr(false)
                window.history.replaceState(null, '', `/pos/ng?merchant_id=${encodeURIComponent(merchant.merchant_id)}`)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
            >
              Preview payer checkout
            </button>
          </div>
        </div>
      </PosShell>
    )
  }

  if (!merchant.bank_configured) {
    return (
      <PosShell
        eyebrow="Nigerian Retail Mode"
        title={merchant.display_name}
        body="This POS terminal needs a verified merchant bank account before it can accept Naira payments."
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Ask the merchant to recreate this POS QR with bank payout enabled.
        </div>
      </PosShell>
    )
  }

  return (
    <PosShell
      eyebrow="Nigerian Retail Mode"
      title={merchant.display_name}
      body={merchant.bank_configured ? 'Enter the Naira amount. Checkout collects Base USDC and pays out to the merchant bank account.' : 'This POS terminal needs a verified merchant bank account.'}
      beforeHeader={settlementStep === 'amount' && !merchant.bank_configured ? (
        <button
          type="button"
          onClick={() => {
            setSettlementStep('select')
            setQuote(null)
            setQuoteError('')
          }}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : null}
    >
      <div className="space-y-5">
        <>
        {selectedSettlement !== 'INSTANT_FIAT' && merchantNetworks.length > 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Pay on</p>
              <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">Merchant supported</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {merchantNetworks.map((network) => (
                <button
                  key={network}
                  type="button"
                  onClick={() => {
                    setSelectedNetwork(network)
                    setQuote(null)
                    setQuoteError('')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-semibold transition-all',
                    selectedNetwork === network
                      ? 'border-gray-900 bg-gray-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-gray-950'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20',
                  )}
                >
                  {POS_NETWORK_LABELS[network]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          {selectedSettlement !== 'INSTANT_FIAT' && (
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.06]">
              {(['NGN', 'USDC'] as const).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => {
                    setAmountCurrency(currency)
                    setQuote(null)
                  }}
                  className={cn(
                    'rounded-md px-3 py-2 text-xs font-semibold transition',
                    amountCurrency === currency
                      ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-950 dark:text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  {currency}
                </button>
              ))}
            </div>
          )}
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {selectedSettlement === 'INSTANT_FIAT' ? 'Amount in naira' : 'Amount'}
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <span className="text-sm font-semibold text-gray-400">{amountCurrency === 'NGN' ? 'NGN' : '$'}</span>
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setQuote(null)
              }}
              inputMode="decimal"
              placeholder={amountCurrency === 'NGN' ? '5000' : '5'}
              className="w-full bg-transparent text-lg font-semibold text-gray-950 outline-none placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            {convertedNgn !== null && convertedUsdc !== null ? (
              <>
                <span>{amountCurrency === 'USDC' ? `Approx ${formatNgn(convertedNgn)}` : `You will pay approx ${formatUsdc(convertedUsdc)}`}</span>
                <span>1 USDC = {formatNgn(posRate)}</span>
              </>
            ) : (
              <span>NGN conversion appears as you type.</span>
            )}
          </div>
        </div>

        {quoteError && <ErrorNote message={quoteError} />}
        {quote ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  {quote!.settlement_type === 'INSTANT_FIAT' ? 'Naira payment ready' : 'Payment ready'}
                </p>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  NGN {quote!.amount_ngn} · {quote!.amount_usdc} USDC
                </p>
                {quote!.settlement_type === 'INSTANT_FIAT' && (
                  <div className="mt-3 rounded-xl border border-emerald-200/80 bg-white/70 p-3 text-[11px] text-emerald-900 dark:border-emerald-300/20 dark:bg-white/[0.06] dark:text-emerald-100">
                    <p className="font-semibold">{quote.bank_account_name ?? merchant.bank_account_name}</p>
                    <p className="mt-0.5">{quote.bank_name ?? merchant.bank_name} ****{quote.bank_last4 ?? merchant.bank_last4}</p>
                    <p className="mt-2 text-emerald-700 dark:text-emerald-200">Base USDC is converted to Naira for this bank account.</p>
                  </div>
                )}
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
            </div>
            <a
              href={quote!.pay_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              Continue to Circle checkout <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-2 text-center text-[11px] font-medium text-emerald-700/70 dark:text-emerald-200/70">
              The bank account is shown again before payment.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={requestQuote}
            disabled={quoteBusy || !amount}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            {quoteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Continue to pay
          </button>
        )}
        </>

      </div>
    </PosShell>
  )
}

function PosShell({
  eyebrow,
  title,
  body,
  beforeHeader,
  children,
}: {
  eyebrow: string
  title: string
  body: string
  beforeHeader?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-[460px] flex-col justify-center px-4 py-8">
      <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111318]">
        {beforeHeader}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{body}</p>
        <div className="mt-5">{children}</div>
      </section>
    </main>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
      />
    </label>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
      {message}
    </div>
  )
}

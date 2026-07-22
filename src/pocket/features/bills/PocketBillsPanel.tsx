import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Check, Clock3, Copy, Lightbulb, Loader2, Mail, Phone, Tv, Wallet, Wifi } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import PocketSlideAction from '../../components/PocketSlideAction'
import PocketSelect from '../../components/PocketSelect'
import type { PocketBillsController } from '../../controllers/usePocketBillsController'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import { POCKET_BASE_PATH } from '../../lib/pocketRoutes'
import PocketDataBundlePicker from './PocketDataBundlePicker'
import { Link } from 'react-router-dom'
import UnifiedReceipt from '../../../components/UnifiedReceipt'
import type { PaylinkReceipt } from '../../../lib/paymentReceiptPdf'

export type PocketBillView = 'airtime' | 'data' | 'tv' | 'electricity'

type PocketBillsPanelProps = {
  view: PocketBillView
  authenticated: boolean
  bills: PocketBillsController
  baseAddress: string
  baseBalance: number
  walletBusy: boolean
  onOpenWallet: () => void
}

const billMeta = {
  airtime: { title: 'Airtime', body: 'Top up a Nigerian mobile number from Circle Pocket.', icon: Phone },
  data: { title: 'Data', body: 'Choose a provider and bundle.', icon: Wifi },
  tv: { title: 'TV', body: 'Renew a supported decoder or smartcard subscription.', icon: Tv },
  electricity: { title: 'Electricity', body: 'Validate a meter and pay a supported electricity provider.', icon: Lightbulb },
} as const

const NETWORKS = [
  { value: 'mtn', label: 'MTN' },
  { value: 'airtel', label: 'Airtel' },
  { value: 'glo', label: 'Glo' },
  { value: 'etisalat', label: '9mobile' },
] as const

function dataServiceLabel(name: string) {
  return name
    .replace(/\s+Internet\s+Data$/i, '')
    .replace(/\s+Payment$/i, '')
    .replace(/\s+Data$/i, '')
}

function money(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(amount)
    : '₦0'
}

function rechargeToken(value: string) {
  return value.replace(/^token\s*:\s*/i, '').trim()
}

function SignInCard() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
      <PrivyConnectButton className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]">
        <Mail className="absolute left-5 h-4 w-4" />
        <span>Sign in to Bills</span>
        <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
      </PrivyConnectButton>
      <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">Bill history, delivery status, and support stay connected to your Pocket account.</p>
    </div>
  )
}

export default function PocketBillsPanel({ view, authenticated, bills, baseAddress, baseBalance, walletBusy, onOpenWallet }: PocketBillsPanelProps) {
  const [copiedToken, setCopiedToken] = useState('')
  useEffect(() => setCopiedToken(''), [bills.intent?.id])
  const meta = billMeta[view]
  const BillIcon = meta.icon
  const locked = bills.processing || bills.status === 'ready'
  const showPayment = Boolean(bills.intent) && ['ready', 'paying', 'confirming', 'processing', 'successful'].includes(bills.status)
  const reviewBlocked = Boolean(bills.intent && ['provider_failed_unverified', 'refund_pending', 'refund_eligible', 'needs_review'].includes(bills.intent.state))
  const slideStatus = bills.status === 'successful'
    ? 'successful'
    : bills.status === 'processing'
      ? 'submitted'
      : bills.status === 'paying' || bills.status === 'confirming'
        ? 'pending'
        : 'idle'
  const isData = view === 'data'
  const isVerifiedBill = view === 'electricity' || (view === 'tv' && bills.tvVerificationRequired)
  const isDirectTv = view === 'tv' && !bills.tvVerificationRequired
  const billReceipt: PaylinkReceipt | null = bills.intent ? {
    type: bills.intent.category,
    receiptId: bills.intent.requestId,
    receiptHash: bills.intent.txHash || bills.intent.requestId,
    title: `${billMeta[bills.intent.category].title} payment confirmed`,
    status: 'confirmed',
    eventId: bills.intent.id,
    txHash: bills.intent.txHash || bills.intent.requestId,
    chain: bills.intent.network,
    payer: bills.intent.payerWallet,
    memo: bills.intent.variationName || bills.intent.serviceName,
    amount: bills.intent.paymentAmountUsdc || bills.intent.amountUsdc,
    amountNgn: bills.intent.amountNgn,
    asset: 'USDC',
    createdAt: bills.intent.updatedAt || bills.intent.createdAt,
    source: 'bills',
    settlementType: `bill_payment:${bills.intent.category}`,
    variant: 'bills',
    providerName: bills.intent.serviceName || dataServiceLabel(bills.intent.serviceId),
    targetLabel: bills.intent.category === 'electricity' ? 'Meter Number' : bills.intent.category === 'tv' ? 'Smartcard Number' : 'Phone Number',
    targetValue: bills.intent.phone,
    referenceId: bills.intent.requestId,
  } : null
  const billName = view === 'tv' ? 'TV' : view === 'electricity' ? 'Electricity' : isData ? 'Data' : 'Airtime'
  const prepaidToken = view === 'electricity' && bills.intent?.variationCode === 'prepaid' && bills.intent.state === 'delivered'
    ? rechargeToken(bills.intent.purchasedCode)
    : ''
  const networks = view !== 'airtime'
    ? bills.dataServices.map(service => ({ value: service.serviceId, label: dataServiceLabel(service.name) }))
    : [...NETWORKS]
  const categoryEnabled = view === 'data' ? bills.dataEnabled : view === 'tv' ? bills.tvEnabled : view === 'electricity' ? bills.electricityEnabled : bills.airtimeEnabled
  const quoteExpired = bills.errorCode === 'BILLS_QUOTE_EXPIRED'
  const refundComplete = bills.errorCode === 'BILLS_REFUNDED'
  const providerUnavailable = bills.errorCode === 'PROVIDER_UNAVAILABLE'
    || bills.errorCode === 'BILLS_PROVIDER_RESERVE_LOW'
    || bills.errorCode === 'BILLS_DISABLED'
    || bills.errorCode === 'BILLS_CATEGORY_DISABLED'
  const errorPresentation = refundComplete
    ? { title: 'Refund complete', body: bills.error, action: '', icon: Check, success: true }
    : quoteExpired
    ? { title: 'Quote expired', body: 'Rates can move. Review your details to get a fresh quote.', action: 'Review again', icon: Clock3, success: false }
    : providerUnavailable
      ? { title: 'Bills temporarily unavailable', body: 'Your details are safe. Try again shortly.', action: 'Try again', icon: Clock3, success: false }
      : { title: 'Check your details', body: bills.error, action: '', icon: AlertCircle, success: false }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-blue-50/70 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-blue-500/[0.08]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Bills</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950 dark:text-white">{meta.title}</h2>
            <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400">{meta.body}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white/80 text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"><BillIcon className="h-[18px] w-[18px]" /></span>
        </div>
      </div>

      {bills.availability === 'loading' ? (
        <div className="flex min-h-36 items-center justify-center rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-[#111216]"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : bills.availability === 'disabled' ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300"><BillIcon className="h-5 w-5" /></span>
          <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-gray-100">Bills pilot is not open</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">Bill payments remain hidden until the protected provider and refund controls are enabled.</p>
        </div>
      ) : !authenticated ? <SignInCard /> : !categoryEnabled ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300"><BillIcon className="h-5 w-5" /></span>
          <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-gray-100">{billName} unavailable</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{bills.environment === 'sandbox' ? `${billName} testing is not enabled yet.` : `${billName} payments are not available yet.`}</p>
        </div>
      ) : (
        <>
          {bills.environment === 'sandbox' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              <span className="font-black">Sandbox test</span>
              <span className="block">VTpass simulates {billName} delivery using its official test account. Your Base USDC payment is real; no live service is delivered.</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Paying from Base</span>
              <span className="mt-1 block truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{baseAddress ? `${baseAddress.slice(0, 6)}...${baseAddress.slice(-4)}` : 'Wallet not open'}</span>
            </span>
            {baseAddress ? (
              <span className="shrink-0 text-sm font-semibold tabular-nums tracking-[-0.02em] text-gray-950 dark:text-white">{formatPocketDisplayAmount(baseBalance)} <span className="text-[10px] text-gray-400">USDC</span></span>
            ) : (
              <button type="button" onClick={onOpenWallet} disabled={walletBusy} className="flex min-h-9 items-center gap-2 rounded-full bg-gray-950 px-3 text-[11px] font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
                {walletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}Open wallet
              </button>
            )}
          </div>

          <div className="space-y-4 rounded-[24px] border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:from-[#15161a] dark:to-[#101115]">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{view === 'tv' ? 'TV provider' : view === 'electricity' ? 'Electricity provider' : isData ? 'Data provider' : 'Mobile network'}</p>
              {isVerifiedBill ? (
                <PocketSelect value={bills.serviceId} options={networks} onChange={bills.setServiceId} disabled={locked || bills.catalogBusy} placeholder="Select provider" ariaLabel={`Select ${billName} provider`} />
              ) : (
                <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 [scrollbar-width:none] dark:border-white/10 dark:bg-[#17181d] [&::-webkit-scrollbar]:hidden">
                  {networks.map(network => (
                    <button key={network.value} type="button" disabled={locked} onClick={() => bills.setServiceId(network.value)} className={cn('min-h-10 min-w-[72px] shrink-0 rounded-xl border px-2.5 text-[11px] font-black transition-all', bills.serviceId === network.value ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 shadow-sm dark:text-blue-300' : 'border-transparent text-gray-500 hover:bg-blue-500/[0.06] hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300', locked && 'cursor-not-allowed opacity-60')}>{network.label}</button>
                  ))}
                </div>
              )}
              {view !== 'airtime' && bills.catalogBusy && !networks.length && <span className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-gray-400"><Loader2 className="h-3 w-3 animate-spin" />Loading providers</span>}
            </div>

            {view === 'electricity' && (
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Meter type</span>
                <div className="mt-1"><PocketSelect value={bills.variationCode} options={[{ value: 'prepaid', label: 'Prepaid' }, { value: 'postpaid', label: 'Postpaid' }]} onChange={bills.setVariationCode} disabled={locked} placeholder="Select meter type" ariaLabel="Select electricity meter type" /></div>
              </div>
            )}

            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{view === 'tv' ? (isDirectTv ? 'Subscriber phone' : 'Smartcard number') : view === 'electricity' ? 'Meter number' : bills.environment === 'sandbox' ? 'VTpass test account' : isData ? 'Account or phone number' : 'Phone number'}</span>
              <input type="tel" inputMode="tel" autoComplete="tel" disabled={locked || bills.environment === 'sandbox'} value={bills.phone} onChange={event => bills.setPhone(event.target.value)} placeholder="08012345678" className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
            </label>
            {isData ? (
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Data plan</span>
                {bills.catalogBusy ? (
                  <span className="mt-2 flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white text-xs font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.035]"><Loader2 className="h-4 w-4 animate-spin" />Loading plans</span>
                ) : (
                  <div className="mt-2">
                    <PocketDataBundlePicker
                      serviceId={bills.serviceId}
                      variations={bills.dataVariations}
                      value={bills.variationCode}
                      disabled={locked}
                      onChange={bills.setVariationCode}
                    />
                  </div>
                )}
              </div>
            ) : view === 'tv' ? (
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">TV package</span>
                <div className="mt-1"><PocketSelect value={bills.variationCode} options={bills.dataVariations.filter(item => item.available).map(item => ({ value: item.variationCode, label: `${item.name} · ${money(item.amountNgn)}` }))} onChange={bills.setVariationCode} disabled={locked || bills.catalogBusy} placeholder={bills.catalogBusy ? 'Loading packages' : 'Select package'} ariaLabel="Select TV package" /></div>
              </div>
            ) : view !== 'electricity' ? (
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Airtime amount</span>
                <span className="mt-1 flex items-center rounded-xl border border-gray-200 bg-white px-3 focus-within:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]">
                  <span className="text-sm font-black text-gray-400">₦</span>
                  <input type="text" inputMode="decimal" disabled={locked} value={bills.amountNgn} onChange={event => bills.setAmountNgn(event.target.value)} placeholder="100" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-medium text-gray-900 outline-none disabled:opacity-60 dark:text-white" />
                </span>
              </label>
            ) : null}

            {isVerifiedBill && (
              <>
                {!bills.verification ? (
                  <button type="button" onClick={() => void bills.verifyCustomer()} disabled={locked || bills.verifyBusy || !bills.serviceId || !bills.phone || (view === 'electricity' && !bills.variationCode)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-300">
                    {bills.verifyBusy ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying</> : `Verify ${view === 'tv' ? 'smartcard' : 'meter'}`}
                  </button>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                    <span className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" />{bills.environment === 'sandbox' ? `${view === 'tv' ? 'Test smartcard' : 'Test meter'} verified` : bills.verification.customerName || `${view === 'tv' ? 'Smartcard' : 'Meter'} verified`}</span>
                    {bills.environment !== 'sandbox' && bills.verification.customerAddress && <span className="mt-1 block text-[10px] leading-4 text-emerald-700/70 dark:text-emerald-200/70">{bills.verification.customerAddress}</span>}
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Contact phone</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" disabled={locked} value={bills.contactPhone} onChange={event => bills.setContactPhone(event.target.value)} placeholder="08012345678" className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
                </label>
              </>
            )}

            {view === 'electricity' && (
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Electricity amount</span>
                <span className="mt-1 flex items-center rounded-xl border border-gray-200 bg-white px-3 focus-within:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]"><span className="text-sm font-black text-gray-400">₦</span><input type="text" inputMode="decimal" disabled={locked} value={bills.amountNgn} onChange={event => bills.setAmountNgn(event.target.value)} placeholder="100" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-medium text-gray-900 outline-none disabled:opacity-60 dark:text-white" /></span>
                {bills.verification?.minimumAmount !== null && bills.verification?.minimumAmount !== undefined && <span className="mt-1.5 block text-[10px] font-semibold text-gray-400">Minimum for this meter: {money(String(bills.verification.minimumAmount))}</span>}
              </label>
            )}

            {!showPayment && !reviewBlocked && (
              <button type="button" onClick={() => void bills.review()} disabled={!bills.formReady || !baseAddress || bills.processing} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-gray-950">
                {bills.status === 'quoting' ? <><Loader2 className="h-4 w-4 animate-spin" />Getting live quote</> : 'Review payment'}
              </button>
            )}

            {reviewBlocked && <Link to={`${POCKET_BASE_PATH}/activity/bills`} className="flex min-h-11 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">View Bills activity</Link>}

            {showPayment && bills.intent && (
              <>
                {bills.status === 'successful' && billReceipt ? (
                  <UnifiedReceipt receipt={billReceipt} />
                ) : (
                  <>
                    {bills.status === 'ready' && (
                      <div className="flex justify-end">
                        <button type="button" onClick={bills.edit} className="rounded-full px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-blue-400/10">Edit details</button>
                      </div>
                    )}
                    <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-[11px] dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex justify-between gap-3"><span className="text-gray-500">{bills.intent.variationName || 'Airtime'}</span><span className="shrink-0 font-semibold text-gray-900 dark:text-white">{money(bills.intent.amountNgn)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-gray-500">{view === 'tv' ? (isDirectTv ? 'Subscriber phone' : 'Smartcard') : view === 'electricity' ? 'Meter' : isData ? 'Recipient' : 'Mobile number'}</span><span className="font-semibold text-gray-900 dark:text-white">{bills.intent.phone}</span></div>
                      <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 dark:border-white/10"><span className="text-gray-500">Pay from Base</span><span className="font-semibold tabular-nums tracking-[-0.02em] text-gray-900 dark:text-white">{formatPocketDisplayAmount(Number(bills.intent.amountUsdc))} USDC</span></div>
                    </div>
                    <PocketSlideAction
                      status={slideStatus}
                      disabled={bills.status !== 'ready' || Number(bills.intent.amountUsdc) > baseBalance}
                      onConfirm={() => void bills.pay()}
                      labels={{ disabled: Number(bills.intent.amountUsdc) > baseBalance ? 'Not enough Base USDC' : 'Review payment', idle: bills.environment === 'sandbox' ? 'Slide to test payment' : 'Slide to pay', pending: 'Confirm in Circle', submitted: bills.environment === 'sandbox' ? `Running ${billName} test` : `Delivering ${billName}`, successful: bills.environment === 'sandbox' ? 'Test complete' : `${billName} sent` }}
                    />
                  </>
                )}
                {prepaidToken && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700/70 dark:text-emerald-200/70">Recharge token</span>
                        <span className="mt-1.5 block select-all break-all font-mono text-sm font-black tracking-[0.08em] text-emerald-950 dark:text-emerald-100">{prepaidToken}</span>
                      </span>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(prepaidToken).then(() => setCopiedToken(prepaidToken)).catch(() => undefined)} className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 text-[10px] font-bold text-emerald-700 transition active:scale-[0.98] dark:border-emerald-400/20 dark:bg-white/[0.07] dark:text-emerald-200"><Copy className="h-3 w-3" />{copiedToken === prepaidToken ? 'Copied' : 'Copy'}</button>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-emerald-700/70 dark:text-emerald-200/70">Enter this token on the prepaid meter. It remains available in Bills activity.</p>
                  </div>
                )}
              </>
            )}

            {bills.notice && <p className={cn('text-center text-xs font-semibold', bills.status === 'successful' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-300')}>{bills.notice}</p>}
            {bills.error && (() => {
              const ErrorIcon = errorPresentation.icon
              return (
                <div className={cn('rounded-2xl border p-3.5', errorPresentation.success ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/10' : 'border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.04]')}>
                  <div className="flex items-start gap-3">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/[0.07]', errorPresentation.success ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-300')}><ErrorIcon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-gray-950 dark:text-white">{errorPresentation.title}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-gray-500 dark:text-gray-400">{errorPresentation.body}</span>
                    </span>
                  </div>
                  {errorPresentation.action && <button type="button" onClick={bills.edit} className="mt-3 min-h-9 w-full rounded-full border border-gray-200 bg-white text-[11px] font-bold text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-blue-400/10 dark:hover:text-blue-300">{errorPresentation.action}</button>}
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}

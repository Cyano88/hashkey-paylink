import { ArrowRight, Copy, LayoutDashboard, Loader2, Mail, Store } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { cn, truncateAddress } from '../../../lib/utils'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import type { ReactNode } from 'react'
import type {
  PocketMoveController,
  PocketPosActions,
  PocketPosDraft,
} from '../../controllers/usePocketMoveControllers'

export type PocketPosNetworkOption = {
  key: string
  label: string
  badge?: string
}

export type PocketPosBankInstitution = {
  code: string
  name: string
}

export type PocketPosCountryOption = {
  key: string
  name: string
  label: string
  status: 'live' | 'soon'
  copy: string
}

export function PocketPosShell({
  standalone,
  backButton,
  children,
}: {
  standalone: boolean
  backButton?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cn(
      'space-y-5',
      standalone
        ? 'fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] top-[68px] mx-auto w-[calc(100%-2rem)] max-w-[430px] overflow-y-auto overscroll-contain pb-5 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        : 'min-h-[590px] p-4 sm:min-h-[640px] sm:p-5',
    )}>
      {!standalone && (
        <div className="relative flex min-h-8 items-center">
          {backButton}
          <div className="pointer-events-none absolute left-1/2 max-w-[48%] -translate-x-1/2 text-center">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Retail POS</p>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

type PocketPosCountryPanelProps = {
  controller: PocketMoveController<'pos', PocketPosDraft, PocketPosActions>
  countries: PocketPosCountryOption[]
  profileReady: boolean
}

export function PocketPosCountryPanel({ controller, countries, profileReady }: PocketPosCountryPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">In-person checkout</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">One QR for every sale</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Customers enter the amount, pay with Base USDC, and you receive Naira in your verified bank account.
        </p>
      </div>

      <div className="grid gap-2">
        {countries.map(country => {
          const live = country.status === 'live'
          return (
            <button
              key={country.key}
              type="button"
              disabled={!live}
              onClick={() => controller.actions.selectCountry(country.key)}
              className={cn(
                'group flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all',
                live && profileReady
                  ? 'border-gray-200 bg-gray-50 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.07]'
                  : 'cursor-not-allowed border-dashed border-gray-200 bg-gray-50/70 opacity-70 dark:border-white/10 dark:bg-white/[0.03]',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-black text-gray-900 shadow-sm dark:bg-white/10 dark:text-white">
                    {country.key}
                  </span>
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-white">{country.name}</p>
                    <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{country.copy}</p>
                  </div>
                </div>
              </div>
              <span className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                live
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950'
                  : 'border border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.06]',
              )}>
                {country.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type PocketPosSetupPanelProps = {
  controller: PocketMoveController<'pos', PocketPosDraft, PocketPosActions>
  networkOptions: PocketPosNetworkOption[]
  instantBankPayout: boolean
  bankInstitutions: PocketPosBankInstitution[]
  bankInstitutionsBusy: boolean
  bankCode: string
  bankAccount: string
  bankAccountName: string
  bankVerified: boolean
  bankVerifyBusy: boolean
  error: string
}

export function PocketPosSetupPanel({
  controller,
  networkOptions,
  instantBankPayout,
  bankInstitutions,
  bankInstitutionsBusy,
  bankCode,
  bankAccount,
  bankAccountName,
  bankVerified,
  bankVerifyBusy,
  error,
}: PocketPosSetupPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Nigeria Naira POS</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Create Naira POS QR</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Payers enter Naira, pay with Base USDC, and you receive a bank payout.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Merchant name</span>
          <input
            value={controller.draft.merchantName}
            onChange={event => controller.actions.setMerchantName(event.target.value)}
            placeholder="Shy Stores"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
          />
        </label>

        <div>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Network</span>
          <div className="mt-1.5 grid gap-2">
            {networkOptions.map(network => {
              const active = controller.draft.networks.includes(network.key)
              return (
                <button
                  key={network.key}
                  type="button"
                  onClick={() => controller.actions.toggleNetwork(network.key)}
                  className={cn(
                    'flex min-h-[42px] items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all',
                    active
                      ? 'border-gray-900 bg-gray-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-gray-950'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20',
                  )}
                >
                  <span>{network.label}</span>
                  {network.badge && (
                    <span className={cn('text-[10px] font-bold uppercase tracking-wide', active ? 'text-white/70 dark:text-gray-500' : 'text-gray-400')}>
                      {network.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {instantBankPayout && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Nigerian bank account</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Choose the bank and verify the account name before creating the QR.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Bank</span>
                {bankInstitutions.length ? (
                  <select
                    value={bankCode}
                    onChange={event => {
                      const selected = bankInstitutions.find(institution => institution.code === event.target.value)
                      controller.actions.setBankInstitution(event.target.value, selected?.name ?? '')
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25"
                  >
                    <option value="">{bankInstitutionsBusy ? 'Loading banks...' : 'Select bank'}</option>
                    {bankInstitutions.map(institution => (
                      <option key={institution.code} value={institution.code}>{institution.name} ({institution.code})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={bankCode}
                    onChange={event => controller.actions.setManualBankCode(event.target.value)}
                    placeholder={bankInstitutionsBusy ? 'Loading banks...' : 'Bank code'}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                  />
                )}
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Account number</span>
                <input
                  value={bankAccount}
                  onChange={event => controller.actions.setBankAccount(event.target.value)}
                  inputMode="numeric"
                  placeholder="0123456789"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                />
              </label>

              <button
                type="button"
                onClick={controller.actions.verifyBankAccount}
                disabled={bankVerifyBusy || !bankCode || bankAccount.length !== 10}
                className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:border-white/20"
              >
                {bankVerifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {bankVerified ? 'Account verified' : 'Verify account'}
              </button>

              {bankAccountName && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                  {bankAccountName}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={controller.submit}
        disabled={!controller.canSubmit || controller.submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
      >
        {controller.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
        Generate Naira POS QR
      </button>
    </div>
  )
}

type PocketPosReadyPanelProps = {
  customerUrl: string
  dashboardUrl: string
  displayName: string
  walletAddress: string
  copied: boolean
  onCopy: () => void
}

export function PocketPosReadyPanel({
  customerUrl,
  dashboardUrl,
  displayName,
  walletAddress,
  copied,
  onCopy,
}: PocketPosReadyPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Nigerian Retail Mode</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">POS QR ready</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">Payers scan once and enter their amount.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-white p-2 shadow-sm">
            <QRCodeCanvas value={customerUrl} size={112} level="H" includeMargin />
          </div>
          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:border-white/10 dark:bg-white/[0.06]">Static POS QR</span>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{truncateAddress(walletAddress, 8)}</p>
            <button
              type="button"
              onClick={onCopy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy payer link'}
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-gray-500">Payer link ready</p>
      </div>

      <div className="grid gap-2">
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <LayoutDashboard className="h-4 w-4" />
          View payments
        </a>
        <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
          Payers open payment by scanning the QR or using the copied link.
        </p>
      </div>
    </div>
  )
}

export function PocketPosSignInCard() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
      <PrivyConnectButton className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]">
        <Mail className="absolute left-5 h-4 w-4" />
        <span>Sign in to POS</span>
        <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="h-4 w-4" />
        </span>
      </PrivyConnectButton>
      <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
        Secure access keeps POS receipts, payouts, reversals, and support records connected.
      </p>
    </div>
  )
}

import { ArrowRight, Coins, Info, Landmark, Link2, Loader2, Sliders, Tag } from 'lucide-react'
import { cn } from '../../../lib/utils'

export type PocketPayLinkLane = 'usdc' | 'bank' | 'bank-send'

function usesNaira(lane: PocketPayLinkLane) {
  return lane === 'bank' || lane === 'bank-send'
}

type PocketPaymentAmountFieldProps = {
  lane: PocketPayLinkLane
  flexible: boolean
  amount: string
  dirty: boolean
  valid: boolean
  helperText: string
  onAmountChange: (amount: string) => void
}

export function PocketPaymentAmountField({ lane, flexible, amount, dirty, valid, helperText, onAmountChange }: PocketPaymentAmountFieldProps) {
  const naira = usesNaira(lane)
  return (
    <>
      {flexible && (
        <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950">
            <Sliders className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight text-gray-800 dark:text-gray-100">Flexible amount enabled</p>
            <p className="mt-0.5 text-[11px] font-medium leading-snug text-gray-400 dark:text-gray-500">{naira ? 'Payer enters the Naira amount.' : 'Payer enters the amount.'}</p>
          </div>
        </div>
      )}
      {!flexible && (
        <fieldset className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            {naira ? <Landmark className="h-3.5 w-3.5 text-gray-400" /> : <Coins className="h-3.5 w-3.5 text-gray-400" />}
            {naira ? 'Naira amount' : 'Amount'}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={event => onAmountChange(event.target.value)}
              className={cn(
                'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 pr-28 text-sm',
                'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                dirty && !valid
                  ? 'border-red-300 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                  : 'border-gray-200 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-blue-400/40 dark:focus:ring-blue-400/10',
              )}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-gray-400">{naira ? 'NGN' : 'USDC'}</span>
          </div>
          {dirty && !valid && <p className="flex items-center gap-1 text-xs text-red-500"><Info className="h-3 w-3" /> Enter a valid amount greater than 0</p>}
          {!dirty && <p className="text-[11px] text-gray-400 dark:text-gray-500">{helperText}</p>}
        </fieldset>
      )}
    </>
  )
}

type PocketPaymentNoteFieldProps = {
  value: string
  onChange: (value: string) => void
}

export function PocketPaymentNoteField({ value, onChange }: PocketPaymentNoteFieldProps) {
  return (
    <fieldset className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <Tag className="h-3.5 w-3.5 text-gray-400" />
        Payment note
        <span className="text-xs font-normal text-gray-400">(optional)</span>
      </label>
      <input
        type="text"
        placeholder="Coffee, Invoice #042, Split dinner..."
        value={value}
        maxLength={100}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm placeholder:text-gray-400 transition-all focus:border-[#0071E3]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-blue-400/40 dark:focus:bg-white/[0.06] dark:focus:ring-blue-400/10"
      />
    </fieldset>
  )
}

type PocketFlexibleAmountToggleProps = {
  lane: PocketPayLinkLane
  enabled: boolean
  onToggle: () => void
}

export function PocketFlexibleAmountToggle({ lane, enabled, onToggle }: PocketFlexibleAmountToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-all',
        enabled
          ? 'border-gray-300 bg-white shadow-sm dark:border-white/15 dark:bg-white/[0.05]'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
            enabled
              ? 'border-gray-900 bg-gray-950 text-white dark:border-white/20 dark:bg-gray-900 dark:text-white'
              : 'border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500',
          )}><Sliders className="h-3.5 w-3.5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">Let payer enter amount</span>
            <span className="block text-[11px] font-medium leading-snug text-gray-400 dark:text-gray-500">{usesNaira(lane) ? 'Payer enters the Naira amount.' : 'Payer enters the amount.'}</span>
          </span>
        </div>
        <span className={cn('relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all sm:h-7 sm:w-12', enabled ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10')}>
          <span className={cn('block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950 sm:h-6 sm:w-6', enabled ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0')} />
        </span>
      </div>
    </button>
  )
}

type PocketPayLinkSubmitPanelProps = {
  lane: PocketPayLinkLane
  shellActive: boolean
  idle: boolean
  canSubmit: boolean
  submitting: boolean
  error?: string
  addressGuidance?: string
  onSubmit: () => void
}

export function PocketPayLinkSubmitPanel({ lane, shellActive, idle, canSubmit, submitting, error, addressGuidance, onSubmit }: PocketPayLinkSubmitPanelProps) {
  const bankLane = usesNaira(lane)
  const label = lane === 'bank' ? 'Create Bank PayLink' : lane === 'bank-send' ? 'Create Bank-to-USDC PayLink' : 'Generate Payment Link'
  return (
    <div className={cn('space-y-2', shellActive ? 'w-full' : 'p-3 sm:p-4')}>
      {idle && (
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            shellActive
              ? 'group relative flex min-h-14 w-full items-center justify-center rounded-full px-16 py-1.5 text-center text-sm font-semibold transition-all duration-200 active:scale-[0.98]'
              : 'flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-center text-sm font-semibold leading-tight transition-all duration-200',
            canSubmit && !submitting
              ? shellActive
                ? 'bg-gray-950 text-white shadow-sm hover:bg-black dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]'
                : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'
              : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500',
          )}
        >
          {bankLane && submitting
            ? <Loader2 className={cn('h-4 w-4 shrink-0 animate-spin', shellActive && 'absolute left-5')} />
            : <Link2 className={cn('h-4 w-4 shrink-0', shellActive && 'absolute left-5')} />}
          <span>{label}</span>
          {canSubmit && !submitting && (shellActive
            ? <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
            : <ArrowRight className="h-4 w-4 shrink-0" />)}
        </button>
      )}

      {lane === 'bank' && idle && (
        <div className="space-y-1 px-2 text-center text-xs leading-snug">
          {error && <p className="font-medium text-red-500">{error}</p>}
          {!canSubmit && !error && <p className="text-gray-400 dark:text-gray-500">Sign in, save your profile, verify bank account, and enter a Naira amount.</p>}
        </div>
      )}
      {lane === 'bank-send' && idle && <div className="space-y-1 px-2 text-center text-xs leading-snug"><p className="text-gray-400 dark:text-gray-500">Payer checkout will collect refund bank details before creating the bank transfer order.</p></div>}
      {lane === 'usdc' && idle && !canSubmit && addressGuidance && <p className="px-2 text-center text-xs leading-snug text-gray-400 dark:text-gray-500">{addressGuidance}</p>}
    </div>
  )
}

import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import PocketSelect from '../../components/PocketSelect'

export type PocketBankInstitutionOption = {
  code: string
  name: string
}

type PocketVerifiedBankFieldsProps = {
  country: string
  institutions: PocketBankInstitutionOption[]
  institutionsBusy: boolean
  bankCode: string
  bankName: string
  accountNumber: string
  accountName: string
  verified: boolean
  verifying: boolean
  error: string
  onCountryChange: (country: string) => void
  onInstitutionChange: (code: string, name: string, resetAccount: boolean) => void
  onAccountChange: (accountNumber: string) => void
  onVerify: () => void
  embedded?: boolean
}

export function PocketVerifiedBankFields({
  country,
  institutions,
  institutionsBusy,
  bankCode,
  bankName,
  accountNumber,
  accountName,
  verified,
  verifying,
  error,
  onCountryChange,
  onInstitutionChange,
  onAccountChange,
  onVerify,
  embedded = false,
}: PocketVerifiedBankFieldsProps) {
  return (
    <div className={cn(
      'space-y-2.5 rounded-xl p-2.5',
      embedded
        ? 'bg-gray-50/80 dark:bg-white/[0.04]'
        : 'border border-gray-100 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.04]',
    )}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Country</p>
        <PocketSelect
          value={country || 'NG'}
          options={[
            { value: 'NG', label: 'Nigeria' },
            { value: 'GH', label: 'Ghana - coming soon', disabled: true },
            { value: 'KE', label: 'Kenya - coming soon', disabled: true },
          ]}
          onChange={onCountryChange}
          ariaLabel="Bank country"
          className="mt-1"
          buttonClassName="rounded-lg"
        />
      </div>

      {country === 'NG' && (
        <div className="space-y-2.5 border-t border-gray-100 pt-2.5 dark:border-white/10">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Bank</span>
            {institutions.length ? (
              <PocketSelect
                value={bankCode}
                options={institutions.map(institution => ({ value: institution.code, label: institution.name }))}
                onChange={value => {
                  const selected = institutions.find(institution => institution.code === value)
                  onInstitutionChange(value, selected?.name ?? '', true)
                }}
                placeholder={institutionsBusy ? 'Loading banks...' : 'Select bank'}
                ariaLabel="Bank"
                className="mt-1"
                buttonClassName="rounded-lg font-medium"
              />
            ) : (
              <input
                value={bankName || bankCode}
                onChange={event => onInstitutionChange(event.target.value.trim(), event.target.value, false)}
                placeholder={institutionsBusy ? 'Loading banks...' : 'Zenith Bank'}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
              />
            )}
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Account number</span>
            <div className="mt-1 flex gap-2">
              <input
                value={accountNumber}
                onChange={event => onAccountChange(event.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="0123456789"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
              />
              <button type="button" onClick={onVerify} disabled={verifying || !bankCode || accountNumber.length !== 10} className="inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Verify
              </button>
            </div>
          </label>
          {verified && accountName && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">{accountName}</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}
        </div>
      )}
    </div>
  )
}

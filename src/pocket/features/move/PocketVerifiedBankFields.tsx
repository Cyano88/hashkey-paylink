import { Loader2 } from '../../components/PocketIcons'
import PocketResolvedNameRow from '../../components/PocketResolvedNameRow'
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
  embedded = false,
}: PocketVerifiedBankFieldsProps) {
  return (
    <div className={cn(
      'space-y-2.5',
      embedded
        ? 'rounded-none bg-transparent p-0'
        : 'rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]',
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
                searchable
                searchPlaceholder="Search banks"
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
            <div className="relative mt-1">
              <input
                value={accountNumber}
                onChange={event => onAccountChange(event.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="0123456789"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-sm font-medium tabular-nums text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
              />
              {verifying && <span className="absolute right-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-gray-400"><Loader2 className="h-4 w-4" /></span>}
            </div>
          </label>
          {verified && accountName && <PocketResolvedNameRow name={accountName} />}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}
        </div>
      )}
    </div>
  )
}

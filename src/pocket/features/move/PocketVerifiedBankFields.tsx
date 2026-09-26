import PocketBankPicker from '../../components/PocketBankPicker'
import { PocketLoadingField } from '../../components/PocketContentSkeletons'
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
  onRetry?: () => void
  recipientEntry?: boolean
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
  onRetry,
  embedded = false,
  recipientEntry = false,
}: PocketVerifiedBankFieldsProps) {
  const accountField = (<label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{country === 'UG' ? 'Mobile money number' : 'Account number'}</span>
            <div className="relative mt-1">
              <input
                value={accountNumber}
                onChange={event => onAccountChange(event.target.value.replace(/\D/g, '').slice(0, country === 'UG' ? 12 : 10))}
                inputMode="numeric"
                placeholder={country === 'UG' ? '07XXXXXXXX' : '0123456789'}
                className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm font-medium tabular-nums text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-[#262626] dark:bg-[#121212] dark:text-white dark:placeholder:text-gray-600"
              />
              {verifying && <span className="absolute right-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4" /></span>}
            </div>
          </label>)
  const bankField = (<label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{country === 'UG' ? 'Provider' : 'Bank'}</span>
            <div className="mt-1">{institutionsBusy && !institutions.length ? <PocketLoadingField label="Loading banks" /> : <PocketBankPicker label={country === 'UG' ? 'Provider' : 'Bank'} value={bankCode} options={institutions} onChange={(code,name)=>onInstitutionChange(code,name,!recipientEntry)} />}</div>
          </label>)
  return (
    <div className={cn(
      'space-y-2.5',
      embedded
        ? 'rounded-none bg-transparent p-0'
        : 'rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 dark:border-[#262626] dark:bg-[#121212]',
    )}>
      {!recipientEntry && <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Country</p>
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
      </div>}

      {(country === 'NG' || country === 'UG') && (
        <div className={recipientEntry ? "flex flex-col gap-3" : "space-y-2.5 border-t border-gray-100 pt-2.5 dark:border-[#262626]"}>
          {recipientEntry ? <>{accountField}{bankField}</> : <>{bankField}{accountField}</>}
          
          {verified && accountName && <PocketResolvedNameRow name={accountName} />}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}{onRetry && bankCode && accountNumber.length >= 9 && <button type="button" disabled={verifying} onClick={onRetry} className="ml-2 min-h-8 font-semibold underline underline-offset-2 disabled:opacity-45">Try again</button>}</div>}
        </div>
      )}
    </div>
  )
}

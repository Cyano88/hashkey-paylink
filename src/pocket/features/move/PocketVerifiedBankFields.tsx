import { ChevronDown, Loader2 } from 'lucide-react'

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
}: PocketVerifiedBankFieldsProps) {
  return (
    <div className="space-y-2.5 rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Country</p>
        <div className="relative mt-1">
          <select value={country || 'NG'} onChange={event => onCountryChange(event.target.value)} className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm font-semibold text-gray-950 outline-none transition-all focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25">
            <option value="NG">Nigeria</option>
            <option value="GH" disabled>Ghana - coming soon</option>
            <option value="KE" disabled>Kenya - coming soon</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {country === 'NG' && (
        <div className="space-y-2.5 border-t border-gray-100 pt-2.5 dark:border-white/10">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Bank</span>
            {institutions.length ? (
              <select
                value={bankCode}
                onChange={event => {
                  const selected = institutions.find(institution => institution.code === event.target.value)
                  onInstitutionChange(event.target.value, selected?.name ?? '', true)
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25"
              >
                <option value="">{institutionsBusy ? 'Loading banks...' : 'Select bank'}</option>
                {institutions.map(institution => <option key={institution.code} value={institution.code}>{institution.name}</option>)}
              </select>
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

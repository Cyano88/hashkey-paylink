import { useRef, useState } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import { Loader2 } from './PocketIcons'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

type Currency = LocalCurrencyProfile['displayCurrency']
const OPTIONS = [
  ['USDC', 'US dollar', 'USD'],
  ['NGN', 'Nigerian naira', 'NGN'],
  ['UGX', 'Ugandan shilling', 'UGX'],
] as const

export default function PocketDisplayCurrencyPicker({ current, busy, error, onBack, onSelect, stocks = false }: { stocks?: boolean; current: Currency; busy: boolean; error: string; onBack(): void; onSelect(currency: Currency): Promise<boolean> }) {
  const [pending, setPending] = useState<Currency | null>(null)
  const [saveError, setSaveError] = useState('')
  const saving = useRef(false)
  const choose = async (currency: Currency) => {
    if (busy || saving.current) return
    if (currency === current) { onBack(); return }
    saving.current = true; setPending(currency); setSaveError('')
    try { if (await onSelect(currency)) onBack() }
    catch { setSaveError('Could not save your display currency. Try again.') }
    finally { saving.current = false; setPending(null) }
  }
  return <PocketBottomSheet title="Display currency" showCloseButton dismissible={!busy && !pending} onClose={onBack}>
    <h2 className="text-base font-semibold">Display currency</h2>
    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{stocks ? 'Saved for XStocks on this device.' : 'USD stays first. Local values are estimates.'}</p>
    <div className="mt-4" role="listbox" aria-label="Display currency">
      {OPTIONS.map(([value, label, code]) => <button key={value} type="button" role="option" aria-selected={value === current} disabled={busy || Boolean(pending)} onClick={() => void choose(value)} className="flex min-h-16 w-full items-center gap-3 border-b border-gray-100 text-left last:border-0 disabled:opacity-60 dark:border-[#262626]">
        <span className="flex-1 text-sm font-medium">{label}</span><span className="text-xs text-gray-500 dark:text-gray-400">{code}</span>
        {pending === value ? <Loader2 className="h-4 w-4" /> : <span aria-hidden="true" className={'h-4 w-4 rounded-full border ' + (value === current ? 'border-4 border-gray-950 dark:border-white' : 'border-gray-300 dark:border-gray-600')} />}
      </button>)}
    </div>
    {(saveError || error) && <p role="alert" className="mt-3 text-xs text-red-500">{saveError || error}</p>}
  </PocketBottomSheet>
}

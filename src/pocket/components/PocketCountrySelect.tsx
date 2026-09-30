import { useEffect, useState } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import { ChevronDown } from './PocketIcons'
import { cn } from '../../lib/utils'

function CountryFlag({ value }: { value: string }) {
  const src = value === 'NG' ? '/brand/countries/ng.svg' : value === 'UG' ? '/brand/countries/ug.svg' : undefined
  return src ? <img src={src} alt="" aria-hidden="true" width={28} height={21} className="h-[21px] w-7 shrink-0 rounded-sm object-cover ring-1 ring-black/10 dark:ring-white/15" /> : null
}

type CountryOption = { value: string; label: string }
export default function PocketCountrySelect({ value, options, onChange, disabled = false, ariaLabel = 'Select country' }: {
  value: string
  options: readonly CountryOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <>
    <button type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={disabled || !options.length} onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-950 outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50 dark:border-[#262626] dark:bg-[#121212] dark:text-white">
      <CountryFlag value={value} /><span className="flex-1">{options.find(option => option.value === value)?.label || 'Select country'}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
    </button>
    {open && <PocketBottomSheet title="Select country" onClose={() => setOpen(false)}>
      <h2 className="mb-3 text-sm font-bold">Select country</h2>
      <div role="listbox" aria-label={ariaLabel}>
        {options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); setOpen(false) }} className="flex min-h-14 w-full items-center gap-3 text-left text-sm font-semibold">
          <CountryFlag value={option.value} /><span className="flex-1">{option.label}</span>
          <span aria-hidden="true" className={cn('h-4 w-4 rounded-full border', value === option.value ? 'border-4 border-gray-950 dark:border-white' : 'border-gray-300 dark:border-gray-600')} />
        </button>)}
      </div>
    </PocketBottomSheet>}
  </>
}

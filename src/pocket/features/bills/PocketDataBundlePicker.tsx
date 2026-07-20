import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { PocketDataVariation } from '../../api/pocketBillsClient'
import {
  parsePocketDataBundles,
  type PocketDataBundleCategory,
} from '../../lib/pocketDataBundles'

const CATEGORIES: Array<{ value: PocketDataBundleCategory; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'mega', label: 'Mega' },
  { value: 'broadband', label: 'Broadband' },
]

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function PocketDataBundlePicker({
  serviceId,
  variations,
  value,
  disabled,
  onChange,
}: {
  serviceId: string
  variations: PocketDataVariation[]
  value: string
  disabled?: boolean
  onChange: (variationCode: string) => void
}) {
  const bundles = useMemo(() => parsePocketDataBundles(variations, serviceId), [serviceId, variations])
  const availableCategories = useMemo(
    () => CATEGORIES.filter(category => bundles.some(bundle => bundle.category === category.value)),
    [bundles],
  )
  const selectedBundle = bundles.find(bundle => bundle.variationCode === value)
  const [category, setCategory] = useState<PocketDataBundleCategory>('daily')

  useEffect(() => {
    const next = selectedBundle?.category ?? availableCategories[0]?.value
    if (next) setCategory(next)
  }, [availableCategories, selectedBundle?.category, serviceId])

  const visible = bundles.filter(bundle => bundle.category === category)

  return (
    <div className="space-y-2.5">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Data plan categories">
        {CATEGORIES.map(item => {
          const hasPlans = availableCategories.some(categoryOption => categoryOption.value === item.value)
          const active = category === item.value
          return (
            <button
              key={item.value}
              type="button"
              disabled={!hasPlans || disabled}
              onClick={() => setCategory(item.value)}
              className={cn(
                'min-h-8 shrink-0 rounded-full px-3 text-[10px] font-black transition-all duration-200',
                active
                  ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950'
                  : 'text-gray-500 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-200',
                (!hasPlans || disabled) && 'cursor-not-allowed opacity-35',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="listbox" aria-label="Data plans">
        {visible.map(bundle => {
          const selected = bundle.variationCode === value
          return (
            <button
              key={bundle.variationCode}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled || !bundle.available}
              onClick={() => onChange(bundle.variationCode)}
              title={!bundle.available ? 'Outside the current Bills payment limit' : bundle.name}
              className={cn(
                'relative min-h-[104px] rounded-2xl border p-3 text-left transition-all duration-200',
                selected
                  ? 'border-blue-500 bg-blue-50/80 shadow-[0_8px_22px_rgba(59,130,246,0.12)] dark:border-blue-400/50 dark:bg-blue-400/10'
                  : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-400/40',
                (disabled || !bundle.available) && 'cursor-not-allowed opacity-40 hover:translate-y-0 hover:border-gray-200 hover:shadow-none dark:hover:border-white/10',
              )}
            >
              {selected && <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3 stroke-[3]" /></span>}
              <span className="block pr-5 text-base font-black tracking-[-0.03em] text-gray-950 dark:text-white">{bundle.dataAmount}</span>
              <span className="mt-0.5 block text-[10px] font-semibold text-gray-400">{bundle.validity}</span>
              <span className="mt-3 block text-xs font-black tabular-nums text-gray-800 dark:text-gray-100">{formatNaira(bundle.price)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

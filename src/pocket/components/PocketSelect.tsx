import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export type PocketSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export default function PocketSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select an option',
  ariaLabel,
  className,
  buttonClassName,
}: {
  value: string
  options: PocketSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel: string
  className?: string
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={cn(
          'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-900 shadow-sm outline-none transition-all hover:border-blue-300 hover:bg-blue-50/70 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#17181d] dark:text-white dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:focus:border-blue-400/50',
          buttonClassName,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-gray-400')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180 text-blue-500')} />
      </button>

      {open && (
        <div role="listbox" aria-label={ariaLabel} className="absolute left-0 right-0 top-full z-[80] mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#1b1b20] dark:shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
          {options.map(option => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-200 dark:hover:bg-blue-400/10 dark:hover:text-blue-200',
                  option.disabled && 'cursor-not-allowed text-gray-300 hover:bg-transparent hover:text-gray-300 dark:text-gray-600 dark:hover:bg-transparent dark:hover:text-gray-600',
                )}
              >
                <span>{option.label}</span>
                {active && <Check className="h-4 w-4 shrink-0 stroke-[2.5]" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function PocketStatusCheck({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_22px_rgba(16,185,129,0.28)] ring-4 ring-emerald-500/10', className)}>
      <Check className="h-5 w-5 stroke-[2.75]" />
    </span>
  )
}

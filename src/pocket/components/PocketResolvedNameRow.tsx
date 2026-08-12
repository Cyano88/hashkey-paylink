import { Check } from './PocketIcons'

export default function PocketResolvedNameRow({ label = 'Account name', name, detail }: { label?: string; name: string; detail?: string }) {
  return <div className="flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-white px-3.5 py-3 shadow-sm dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-white/[0.03]">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4 stroke-[2.5]" /></span>
    <span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">{label}</span><span className="mt-0.5 block truncate text-sm font-semibold tracking-tight text-gray-950 dark:text-white">{name}</span>{detail && <span className="mt-1 block text-[10px] leading-4 text-gray-500 dark:text-gray-400">{detail}</span>}</span>
  </div>
}

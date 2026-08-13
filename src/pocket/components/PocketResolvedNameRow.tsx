import { Check } from './PocketIcons'

export default function PocketResolvedNameRow({ label = 'Account name', name, detail }: { label?: string; name: string; detail?: string }) {
  return <div className="flex min-h-10 items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
    <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
    <span className="min-w-0 flex-1"><span className="flex min-w-0 items-baseline gap-2"><span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-500 dark:text-blue-300">{label}</span><span className="truncate text-xs font-semibold tracking-tight text-gray-950 dark:text-white">{name}</span></span>{detail && <span className="mt-0.5 block truncate text-[10px] text-gray-500 dark:text-gray-400">{detail}</span>}</span>
  </div>
}

import { ArrowUpDown } from 'lucide-react'

export default function PocketMoveLanding() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
        <ArrowUpDown className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg font-black tracking-tight text-gray-950 dark:text-white">Choose how money moves</h2>
      <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500 dark:text-gray-400">Select USDC, Bank, or POS from the pinned switch above.</p>
    </div>
  )
}

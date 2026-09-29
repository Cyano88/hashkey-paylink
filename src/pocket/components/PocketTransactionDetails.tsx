import type { ReactNode } from 'react'

export default function PocketTransactionDetails({ rows }: { rows: Array<[string, ReactNode]> }) {
  if (!rows.length) return null
  return <dl data-pocket-transaction-details className="mb-5 space-y-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs dark:border-[#262626] dark:bg-[#171717]">
    {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="min-w-0 max-w-[65%] break-words text-right font-semibold [overflow-wrap:anywhere]">{value}</dd></div>)}
  </dl>
}

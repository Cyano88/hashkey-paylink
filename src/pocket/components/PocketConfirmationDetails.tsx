import type { ReactNode } from 'react'

/** The same amount and details layout used by Pocket's bank confirmation. */
export default function PocketConfirmationDetails({ amount, rows }: { amount: string; rows: Array<[string, ReactNode]> }) {
  return <>
    <h2 className="mb-6 text-center text-2xl font-bold">{amount}</h2>
    <dl className="mb-5 space-y-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs dark:border-[#262626] dark:bg-[#171717]">
      {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="max-w-[65%] break-words text-right font-semibold">{value}</dd></div>)}
    </dl>
  </>
}

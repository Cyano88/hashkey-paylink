import PocketTransactionDetails from './PocketTransactionDetails'
import type { ReactNode } from 'react'

/** The same amount and details layout used by Pocket's bank confirmation. */
export default function PocketConfirmationDetails({ amount, equivalent, rows }: { amount: string; equivalent?: string; rows: Array<[string, ReactNode]> }) {
  return <>
    <div className="mb-6 text-center"><h2 className="text-2xl font-bold">{amount}</h2>{equivalent && <p className="mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{equivalent}</p>}</div>
    <PocketTransactionDetails rows={rows} />
  </>
}

import PocketLocalEquivalent from './PocketLocalEquivalent'
import PocketTransactionDetails from './PocketTransactionDetails'
import type { ReactNode } from 'react'

/** The same amount and details layout used by Pocket's bank confirmation. */
export default function PocketConfirmationDetails({ amount, equivalent, rows }: { amount: string; equivalent?: string; rows: Array<[string, ReactNode]> }) {
  const fiatFirst = /^(NGN|UGX|\u20a6)\s?/.test(amount) && /USDC$/.test(equivalent || '')
  const primary = fiatFirst ? equivalent! : amount
  const usdc = /USDC$/.test(primary) ? Number(primary.replace(/[^0-9.]/g, '')) : NaN
  return <>
    <div className="mb-6 text-center"><h2 className="text-2xl font-bold">{primary}</h2>{Number.isFinite(usdc) ? <PocketLocalEquivalent amount={usdc} /> : equivalent && !fiatFirst && <p className="mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{equivalent}</p>}</div>
    <PocketTransactionDetails rows={rows} />
  </>
}

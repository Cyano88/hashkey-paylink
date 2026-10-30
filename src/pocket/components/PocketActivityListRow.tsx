import {PocketWebPaymentIdentity,PocketWebPaymentLabel} from './PocketWebPaymentIdentity'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityIcon, pocketActivityShortDate } from './pocketActivityIcon'
import { pocketActivityTitle, pocketActivityAction, pocketActivitySignedAmount, pocketActivityVisibleStatus, pocketActivityIsCompletedIncoming } from '../lib/pocketActivityPresentation'

export default function PocketActivityListRow({row,onClick,title}:{row:PocketActivityRow;onClick:()=>void;title?:string}) {
  const Icon=pocketActivityIcon(row),status=pocketActivityVisibleStatus(row)
  const webPayment=row.source==='hosted_checkout'||row.settlementType==='hosted_checkout'
  const category = pocketActivityAction(row)
  return <button type="button" onClick={onClick} data-pocket-transaction-row className="flex min-h-20 w-full items-center gap-3 py-4 text-left">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-gray-900 dark:bg-white/[0.07] dark:text-white">{webPayment?<PocketWebPaymentIdentity name={row.merchantName||row.recipient} imageUrl={row.merchantImageUrl}/>:<Icon className="h-5 w-5" />}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{webPayment?<PocketWebPaymentLabel method={row.paymentMethod}/>:title || pocketActivityTitle(row)}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{category ? category + ' \u00b7 ' : ''}{pocketActivityShortDate(row.ts)}</span></span>
    <span className="shrink-0 text-right"><span data-pocket-activity-amount className={`block whitespace-nowrap text-sm font-medium tabular-nums ${pocketActivityIsCompletedIncoming(row) ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{pocketActivitySignedAmount(row)}</span>{status&&<span className="mt-1 block text-xs capitalize text-gray-500 dark:text-gray-400">{status}</span>}</span>
  </button>
}

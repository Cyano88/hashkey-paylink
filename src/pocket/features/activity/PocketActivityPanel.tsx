import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Landmark, Store, Filter, RequestMoney, CreditCard } from '../../components/PocketIcons'
import type { PocketActivityRow } from '../../models/pocketActivity'
import { isIncomingPosPayment, isOutgoingPosPurchase, pocketBankRecipientLabel } from '../../lib/pocketPurchaseKind'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import { pocketActivityStatus } from '../../lib/pocketReceipt'
import PocketActivityReceipt from '../../components/PocketActivityReceipt'
import PocketBridgeActivityDetails from '../../components/PocketBridgeActivityDetails'
import type { PocketPendingBridge } from '../../lib/pocketPendingBridge'
import PocketRecentActivitySkeleton from '../../components/PocketRecentActivitySkeleton'

export type { PocketActivityRow } from '../../models/pocketActivity'
export type PocketActivityView = 'all' | 'purchases' | 'bank' | 'pos' | 'collections'
type Category = 'all' | 'bank' | 'bills' | 'pos' | 'requests' | 'purchases' | 'wallet'
type Props = {view:PocketActivityView;rows:PocketActivityRow[];authenticated:boolean;busy:boolean;error:string;onRefund:(id:string)=>Promise<string>;onBridgeCheck?:(bridge:PocketPendingBridge)=>Promise<void>;bridgeChecking?:(id:string)=>boolean;bridgeMessages?:Record<string,string>;onNewBridge?:()=>void}
const categories: Array<[Category,string]> = [['all','All transactions'],['bank','Bank transfers'],['bills','Bills'],['pos','POS purchases'],['requests','Requests and collections'],['purchases','Other purchases'],['wallet','USDC and swaps']]
export function pocketTransactionCategory(row: PocketActivityRow): Category {
  const source = String(row.source || '').toLowerCase().replace(/_/g,'-')
  if (isOutgoingPosPurchase(row)) return 'pos'
  if (source === 'bills') return 'bills'
  if (source === 'request' || source === 'collection') return 'requests'
  if (source.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return 'bank'
  if (source.startsWith('wallet-') || row.settlementType?.startsWith('wallet_')) return 'wallet'
  return 'purchases'
}
function initialCategory(view:PocketActivityView):Category {return view === 'bank' ? 'bank' : view === 'collections' ? 'requests' : view === 'purchases' ? 'bills' : 'all'}
export default function PocketActivityPanel({view,rows,authenticated,busy,error,onRefund,onBridgeCheck,bridgeChecking,bridgeMessages,onNewBridge}:Props) {
  const [category,setCategory] = useState<Category>(()=>initialCategory(view))
  const [month,setMonth] = useState('')
  const [filterOpen,setFilterOpen] = useState(false)
  const [selected,setSelected] = useState<PocketActivityRow|null>(null)
  useEffect(()=>{setCategory(initialCategory(view))},[view])
  const transactions=rows.filter(row=>!isIncomingPosPayment(row)).slice().sort((a,b)=>b.ts-a.ts)
  const monthKey=(row:PocketActivityRow)=>{const date=new Date(row.ts);return Number.isFinite(date.getTime())?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'):'unknown'}
  const monthLabel=(key:string)=>key==='unknown'?'Earlier':new Date(Number(key.slice(0,4)),Number(key.slice(5))-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})
  const months=[...new Set(transactions.map(monthKey))]
  const visible=transactions.filter(row=>(category==='all'||pocketTransactionCategory(row)===category)&&(!month||monthKey(row)===month))
  const selectedRow=selected ? rows.find(row=>row.eventId===selected.eventId&&row.txHash===selected.txHash) ?? selected : null
  if(!authenticated)return <p className="py-12 text-center text-sm text-gray-500">Sign in to view your transactions.</p>
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><p className="text-xs text-gray-500">{categories.find(([key])=>key===category)?.[1]}</p><button type="button" aria-label="Filter transactions" aria-expanded={filterOpen} onClick={()=>setFilterOpen(open=>!open)} className="flex h-10 w-10 items-center justify-center rounded-full"><Filter className="h-5 w-5" /></button></div>
    {filterOpen&&<div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Category<select aria-label="Transaction category" value={category} onChange={event=>setCategory(event.target.value as Category)} className="mt-2 min-h-11 w-full rounded-xl bg-gray-100 px-2 text-xs text-gray-950 dark:bg-[#171717] dark:text-white">{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs text-gray-500">Month<select aria-label="Transaction month" value={month} onChange={event=>setMonth(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl bg-gray-100 px-2 text-xs text-gray-950 dark:bg-[#171717] dark:text-white"><option value="">All history</option>{months.map(key=><option key={key} value={key}>{monthLabel(key)}</option>)}</select></label></div>}
    {busy&&!transactions.length?<PocketRecentActivitySkeleton/>:!visible.length?<p className="py-12 text-center text-xs text-gray-500">{error&&!transactions.length?error:'No transactions to show.'}</p>:<div aria-label="Transactions">
      {visible.map(row=>{
        const kind=pocketTransactionCategory(row),incoming=row.direction==='in'||['refunded','reversed'].includes(pocketActivityStatus(row))
        const Icon=kind==='bank'?Landmark:kind==='bills'?Receipt:kind==='pos'?Store:kind==='requests'?RequestMoney:kind==='purchases'?CreditCard:row.source==='wallet-swap'||row.source==='wallet-bridge'?ArrowLeftRight:incoming?ArrowDownToLine:ArrowUpFromLine
        const title=pocketBankRecipientLabel(row)||row.activityLabel||row.memo||(incoming?'USDC received':'Payment')
        const detail=pocketBankRecipientLabel(row)?[row.bankName,'Bank transfer'].filter(Boolean).join(' / '):new Date(row.ts).toLocaleDateString(undefined,{day:'numeric',month:'short'})
        return <button key={row.eventId+':'+row.txHash} type="button" onClick={()=>setSelected(row)} className="flex w-full items-center gap-3 py-4 text-left" data-pocket-transaction-row>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 dark:bg-[#171717] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{title}</span><span className="mt-1 block truncate text-[11px] text-gray-500">{detail}</span></span>
          <span className="shrink-0 text-right"><span className={`block text-xs font-semibold tabular-nums ${incoming?'text-emerald-600 dark:text-emerald-400':''}`}>{row.source==='wallet-swap'?'Swap':(incoming?'+':'-')+(row.amountNgn?'NGN '+Number(row.amountNgn).toLocaleString('en-NG'):formatPocketDisplayAmount(Number(row.amount))+' USDC')}</span><span className="mt-1 block text-[10px] capitalize text-gray-500">{pocketActivityStatus(row)}</span></span>
        </button>
      })}
    </div>}
    {selectedRow&&<PocketActivityReceipt row={selectedRow} onClose={()=>setSelected(null)} onRefund={onRefund}>{selectedRow.bridge&&<PocketBridgeActivityDetails bridge={selectedRow.bridge} checking={bridgeChecking?.(selectedRow.bridge.id)||false} message={bridgeMessages?.[selectedRow.bridge.id]||''} onCheck={()=>{if(selectedRow.bridge)void onBridgeCheck?.(selectedRow.bridge)}} onNewBridge={onNewBridge}/>}</PocketActivityReceipt>}
  </div>
}

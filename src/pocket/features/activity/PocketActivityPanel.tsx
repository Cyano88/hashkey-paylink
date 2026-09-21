import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Landmark, Store, Filter, Deposit, RequestMoney, CreditCard } from '../../components/PocketIcons'
import type { PocketActivityRow } from '../../models/pocketActivity'
import { isIncomingPosPayment, isOutgoingPosPurchase, pocketBankRecipientLabel } from '../../lib/pocketPurchaseKind'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import { pocketActivityStatus } from '../../lib/pocketReceipt'
import PocketActivityReceipt from '../../components/PocketActivityReceipt'
import PocketBridgeActivityDetails from '../../components/PocketBridgeActivityDetails'
import type { PocketPendingBridge } from '../../lib/pocketPendingBridge'
import PocketBottomSheet from '../../components/PocketBottomSheet'
import { downloadPocketStatement } from '../../lib/pocketStatement'
import { paymentReceiptOutcome } from '../../../lib/paymentReceiptPdf'
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
  const [period,setPeriod] = useState({from:'',to:''})
  const [status,setStatus] = useState('all')
  const [draft,setDraft] = useState({category:initialCategory(view),status:'all',from:'',to:''})
  const [statementOpen,setStatementOpen] = useState(false)
  const [exporting,setExporting] = useState(false)
  const [exportError,setExportError] = useState('')
  const [filterOpen,setFilterOpen] = useState(false)
  const [selected,setSelected] = useState<PocketActivityRow|null>(null)
  useEffect(()=>{setCategory(initialCategory(view))},[view])
  const transactions=rows.filter(row=>!isIncomingPosPayment(row)).slice().sort((a,b)=>b.ts-a.ts)
  const visible=transactions.filter(row=>{
    const date=new Date(row.ts)
    const day=Number.isFinite(date.getTime())?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'):''
    return (category==='all'||pocketTransactionCategory(row)===category)
      &&(status==='all'||paymentReceiptOutcome({status:pocketActivityStatus(row)}).state===status)
      &&(!period.from||!!day&&day>=period.from)&&(!period.to||!!day&&day<=period.to)
  })
  const activeFilters=category!=='all'||status!=='all'||!!period.from||!!period.to
  const openFilters=()=>{setDraft({category,status,...period});setFilterOpen(true)}
  const exportStatement=async()=>{
    if(exporting)return
    setExporting(true);setExportError('')
    try{await downloadPocketStatement(visible);setStatementOpen(false)}
    catch(reason){if(!(reason instanceof Error&&reason.name==='AbortError'))setExportError('Your statement could not be saved. Please try again.')}
    finally{setExporting(false)}
  }
  const selectedRow=selected ? rows.find(row=>row.eventId===selected.eventId&&row.txHash===selected.txHash) ?? selected : null
  if(!authenticated)return <p className="py-12 text-center text-sm text-gray-500">Sign in to view your transactions.</p>
  return <div className="space-y-4">
    <header className="relative flex min-h-14 items-center justify-center">
      <h1 className="text-base font-black">Activity</h1>
      <div className="absolute right-0 flex items-center">
        <button type="button" aria-label="Filter transactions" aria-expanded={filterOpen} onClick={openFilters} className="relative flex h-11 w-11 items-center justify-center rounded-full"><Filter className="h-5 w-5"/>{activeFilters&&<span aria-label="Filters active" className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500"/>}</button>
        <button type="button" aria-label="Download statement" onClick={()=>{setExportError('');setStatementOpen(true)}} className="flex h-11 w-11 items-center justify-center rounded-full"><Deposit className="h-5 w-5"/></button>
      </div>
    </header>
    {activeFilters&&<div className="flex items-center justify-between text-xs text-gray-500"><span>{visible.length} transactions</span><button type="button" onClick={()=>{setCategory('all');setStatus('all');setPeriod({from:'',to:''})}} className="min-h-10 px-2 font-semibold">Clear filters</button></div>}
    {filterOpen&&<PocketBottomSheet title="Filter transactions" onClose={()=>setFilterOpen(false)}>
      <h2 className="mb-6 text-center text-base font-bold">Filter transactions</h2>
      <div className="space-y-5">
        <fieldset><legend className="mb-3 text-xs font-semibold text-gray-500">Category</legend><div className="flex flex-wrap gap-2">{categories.map(([key,label])=><button key={key} type="button" aria-pressed={draft.category===key} onClick={()=>setDraft(value=>({...value,category:key}))} className={`min-h-10 rounded-full px-4 text-xs font-medium ${draft.category===key?'bg-gray-950 text-white dark:bg-white dark:text-gray-950':'bg-gray-100 dark:bg-[#222]'}`}>{label}</button>)}</div></fieldset>
        <fieldset><legend className="mb-3 text-xs font-semibold text-gray-500">Status</legend><div className="flex flex-wrap gap-2">{[['all','All statuses'],['successful','Successful'],['pending','Pending'],['failed','Failed'],['reversed','Reversed']].map(([key,label])=><button key={key} type="button" aria-pressed={draft.status===key} onClick={()=>setDraft(value=>({...value,status:key}))} className={`min-h-10 rounded-full px-4 text-xs font-medium ${draft.status===key?'bg-gray-950 text-white dark:bg-white dark:text-gray-950':'bg-gray-100 dark:bg-[#222]'}`}>{label}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-3">{(['from','to'] as const).map(key=><label key={key} className="min-w-0 text-xs text-gray-500">{key==='from'?'From':'To'}<input type="date" aria-label={key==='from'?'From date':'To date'} value={draft[key]} onChange={event=>setDraft(value=>({...value,[key]:event.target.value}))} className="mt-2 h-12 w-full min-w-0 rounded-xl bg-gray-100 px-3 text-sm text-gray-950 dark:bg-[#222] dark:text-white"/></label>)}</div>
        {draft.from&&draft.to&&draft.from>draft.to&&<p role="alert" className="text-xs text-red-500">Choose an end date on or after the start date.</p>}
        <div className="flex gap-3"><button type="button" onClick={()=>setDraft({category:'all',status:'all',from:'',to:''})} className="h-12 flex-1 rounded-full bg-gray-100 text-sm font-semibold dark:bg-[#222]">Reset</button><button type="button" disabled={!!draft.from&&!!draft.to&&draft.from>draft.to} onClick={()=>{setCategory(draft.category);setStatus(draft.status);setPeriod({from:draft.from,to:draft.to});setFilterOpen(false)}} className="h-12 flex-1 rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Apply filters</button></div>
      </div>
    </PocketBottomSheet>}
    {statementOpen&&<PocketBottomSheet title="Download statement" onClose={()=>setStatementOpen(false)} dismissible={!exporting}>
      <h2 className="mb-4 text-center text-base font-bold">Download statement</h2>
      <p className="text-center text-sm text-gray-500">Export {visible.length} transactions as CSV.</p>
      <p className="mt-2 text-center text-xs text-gray-500">Includes currently loaded activity matching your filters. Incoming POS payments are available in POS terminals.</p>
      {exportError&&<p role="alert" className="mt-4 text-center text-xs text-red-500">{exportError}</p>}
      <button type="button" disabled={!visible.length||exporting} onClick={()=>void exportStatement()} className="mt-6 h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{exporting?'Preparing statement...':'Download CSV'}</button>
    </PocketBottomSheet>}
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

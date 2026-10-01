import { useSearchParams } from 'react-router-dom'
import PocketDateField from '../../components/PocketDateField'
import PocketLocalEquivalent from '../../components/PocketLocalEquivalent'
import { pocketActivityIcon } from '../../components/pocketActivityIcon'
import { pocketActivityAmount, currentPocketActivityRow } from '../../lib/pocketActivityPresentation'
import { pocketActivityArchiveKey } from '../../lib/pocketActivityArchive'
import { useEffect, useState, type ReactNode } from 'react'
import { Filter, Deposit } from '../../components/PocketIcons'
import type { PocketActivityRow } from '../../models/pocketActivity'
import { isIncomingPosPayment, isOutgoingPosPurchase, pocketBankRecipientLabel, personalPocketActivity } from '../../lib/pocketPurchaseKind'
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
type Props = {collectionTitle?:string;collectionId?:string;renderHeader?:(actions:ReactNode)=>ReactNode;incomingPos?:boolean;rail?:'stablecoins'|'xstocks';hideHeading?:boolean;archivedKeys?:string[];view:PocketActivityView;rows:PocketActivityRow[];authenticated:boolean;busy:boolean;error:string;onRefund:(id:string)=>Promise<string>;onBridgeCheck?:(bridge:PocketPendingBridge)=>Promise<void>;bridgeChecking?:(id:string)=>boolean;bridgeMessages?:Record<string,string>;onNewBridge?:()=>void}
const categories: Array<[Category,string]> = [['all','All transactions'],['bank','Bank transfers'],['bills','Bills'],['pos','POS purchases'],['requests','Requests'],['purchases','Other purchases'],['wallet','USDC and swaps']]
export function pocketTransactionCategory(row: PocketActivityRow): Category {
  const source = String(row.source || '').toLowerCase().replace(/_/g,'-')
  if (isOutgoingPosPurchase(row) || isIncomingPosPayment(row)) return 'pos'
  if (source === 'xpay') return 'purchases'
  if (source === 'bills') return 'bills'
  if (source === 'request' || source === 'collection') return 'requests'
  if (source.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return 'bank'
  if (source.startsWith('wallet-') || row.settlementType?.startsWith('wallet_')) return 'wallet'
  return 'purchases'
}
function initialCategory(view:PocketActivityView):Category {return view === 'bank' ? 'bank' : view === 'collections' ? 'requests' : view === 'purchases' ? 'bills' : 'all'}
export default function PocketActivityPanel({collectionTitle,collectionId,renderHeader,incomingPos=false,rail='stablecoins',hideHeading=false,archivedKeys=[],view,rows,authenticated,busy,error,onRefund,onBridgeCheck,bridgeChecking,bridgeMessages,onNewBridge}:Props) {
  const availableCategories = (incomingPos || collectionId) ? ([['all','All payments']] as Array<[Category,string]>) : rail==='xstocks' ? ([['all','All transactions'],['wallet','Transfers'],['requests','Requests'],['purchases','XPay']] as Array<[Category,string]>) : categories
  const [category,setCategory] = useState<Category>(()=>initialCategory(view))
  const [period,setPeriod] = useState({from:'',to:''})
  const [status,setStatus] = useState('all')
  const [draft,setDraft] = useState({category:initialCategory(view),status:'all',from:'',to:''})
  const [statementOpen,setStatementOpen] = useState(false)
  const [exporting,setExporting] = useState(false)
  const [statementPeriod,setStatementPeriod]=useState({from:'',to:''})
  const [statementKind,setStatementKind]=useState<'all'|'local'>('all')
  const [statementFormat,setStatementFormat]=useState<'pdf'|'csv'>('pdf')
  const [exportError,setExportError] = useState('')
  const [filterOpen,setFilterOpen] = useState(false)
  const [selected,setSelected] = useState<PocketActivityRow|null>(null)
  const [searchParams,setSearchParams]=useSearchParams()
  const receiptReference=searchParams.get('receipt')
  const closeReceipt=()=>{
    setSelected(null)
    if(receiptReference){const next=new URLSearchParams(searchParams);next.delete('receipt');setSearchParams(next,{replace:true})}
  }

  useEffect(()=>{setCategory(initialCategory(view))},[view])
  const transactions=(collectionId?rows:incomingPos?rows.filter(isIncomingPosPayment):personalPocketActivity(rows)).slice().sort((a,b)=>b.ts-a.ts)
  const visible=transactions.filter(row=>{
    const date=new Date(row.ts)
    const day=Number.isFinite(date.getTime())?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'):''
    return !archivedKeys.includes(pocketActivityArchiveKey(row)) && (category==='all'||pocketTransactionCategory(row)===category)
      &&(status==='all'||paymentReceiptOutcome({status:pocketActivityStatus(row)}).state===status)
      &&(!period.from||!!day&&day>=period.from)&&(!period.to||!!day&&day<=period.to)
  })
  const activeFilters=category!=='all'||status!=='all'||!!period.from||!!period.to
  const openFilters=()=>{setDraft({category,status,...period});setFilterOpen(true)}
  const exportStatement=async()=>{
    if(exporting)return
    setExporting(true);setExportError('')
    try{await downloadPocketStatement(transactions,statementFormat,{...statementPeriod,kind:statementKind,includeBusiness:!!collectionId||incomingPos,title:collectionId?'Collection statement':incomingPos?'XPay statement':rail==='xstocks'?'XStocks statement':'Pocket statement',scope:collectionId?collectionTitle||'Collection payments':incomingPos?'XPay payments':rail==='xstocks'?'XStocks activity':statementKind==='local'?'Bank transfers & bills':'All activity'});setStatementOpen(false)}
    catch(reason){if(!(reason instanceof Error&&reason.name==='AbortError'))setExportError('Your statement could not be saved. Please try again.')}
    finally{setExporting(false)}
  }
  const groups: Array<{key:string;label:string;rows:PocketActivityRow[]}> = []
  const today=new Date();today.setHours(0,0,0,0)
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1)
  for(const row of visible){
    const date=new Date(row.ts);date.setHours(0,0,0,0)
    const key=Number.isFinite(date.getTime())?String(date.getTime()):'earlier'
    const label=key==='earlier'?'Earlier':date.getTime()===today.getTime()?'Today':date.getTime()===yesterday.getTime()?'Yesterday':date.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})
    const last=groups[groups.length-1]
    if(last?.key===key)last.rows.push(row);else groups.push({key,label,rows:[row]})
  }
  const selectedRow=currentPocketActivityRow(selected || (receiptReference ? rows.find(row=>[row.eventId,row.providerReference,row.bankOrderId,row.txHash].includes(receiptReference)) || null : null), rows)
  if(!authenticated)return <>{renderHeader?.(null)}<p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Sign in to view your transactions.</p></>
  const actions=<div className="flex items-center">
    <button type="button" aria-label="Filter transactions" aria-expanded={filterOpen} onClick={openFilters} className="relative flex h-11 w-11 items-center justify-center rounded-full"><Filter className="h-5 w-5"/>{activeFilters&&<span aria-label="Filters active" className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500"/>}</button>
    <button type="button" aria-label="Download statement" onClick={()=>{setExportError('');setStatementPeriod({from:'',to:''});setStatementKind('all');setStatementFormat('pdf');setStatementOpen(true)}} className="flex h-11 w-11 items-center justify-center rounded-full"><Deposit className="h-5 w-5"/></button>
  </div>
  return <div className="space-y-4">
    {renderHeader?renderHeader(actions):<header className="relative flex min-h-14 items-center justify-center">
      {!hideHeading&&<h1 className="text-base font-black">Activity</h1>}
      <div className="absolute right-0">{actions}</div>
    </header>}
    {activeFilters&&<div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"><span>{visible.length} transactions</span><button type="button" onClick={()=>{setCategory('all');setStatus('all');setPeriod({from:'',to:''})}} className="min-h-10 px-2 font-semibold">Clear filters</button></div>}
    {filterOpen&&<PocketBottomSheet title="Filter transactions" onClose={()=>setFilterOpen(false)}>
      <h2 className="mb-6 text-center text-base font-bold">Filter transactions</h2>
      <div className="space-y-5">
        <fieldset><legend className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Category</legend><div className="flex flex-wrap gap-2">{availableCategories.map(([key,label])=><button key={key} type="button" aria-pressed={draft.category===key} onClick={()=>setDraft(value=>({...value,category:key}))} className={`min-h-10 rounded-full px-4 text-xs font-medium ${draft.category===key?'bg-gray-950 text-white dark:bg-white dark:text-gray-950':'bg-gray-100 dark:bg-[#222]'}`}>{label}</button>)}</div></fieldset>
        <fieldset><legend className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Status</legend><div className="flex flex-wrap gap-2">{[['all','All statuses'],['successful','Successful'],['pending','Pending'],['failed','Failed'],['reversed','Reversed']].map(([key,label])=><button key={key} type="button" aria-pressed={draft.status===key} onClick={()=>setDraft(value=>({...value,status:key}))} className={`min-h-10 rounded-full px-4 text-xs font-medium ${draft.status===key?'bg-gray-950 text-white dark:bg-white dark:text-gray-950':'bg-gray-100 dark:bg-[#222]'}`}>{label}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-3">{(['from','to'] as const).map(key=><PocketDateField key={key} label={key==='from'?'From':'To'} value={draft[key]} onChange={date=>setDraft(value=>({...value,[key]:date}))}/>)}</div>
        {draft.from&&draft.to&&draft.from>draft.to&&<p role="alert" className="text-xs text-red-500">Choose an end date on or after the start date.</p>}
        <div className="flex gap-3"><button type="button" onClick={()=>setDraft({category:'all',status:'all',from:'',to:''})} className="h-12 flex-1 rounded-full bg-gray-100 text-sm font-semibold dark:bg-[#222]">Reset</button><button type="button" disabled={!!draft.from&&!!draft.to&&draft.from>draft.to} onClick={()=>{setCategory(draft.category);setStatus(draft.status);setPeriod({from:draft.from,to:draft.to});setFilterOpen(false)}} className="pocket-cta-primary flex-1">Apply filters</button></div>
      </div>
    </PocketBottomSheet>}
    {statementOpen&&<PocketBottomSheet title="Download statement" onClose={()=>setStatementOpen(false)} dismissible={!exporting}>
      <h2 className="mb-4 text-center text-base font-bold">Download statement</h2>
      {!collectionId&&!incomingPos&&rail==='stablecoins'&&<fieldset className="mb-5"><legend className="mb-2 text-xs text-gray-500">Include</legend><div className="flex gap-2">{(['all','local'] as const).map(kind=><button key={kind} type="button" disabled={exporting} aria-pressed={statementKind===kind} onClick={()=>setStatementKind(kind)} className={'min-h-11 flex-1 rounded-xl px-3 text-xs font-semibold '+(statementKind===kind?'bg-black text-white dark:bg-white dark:text-black':'bg-gray-100 dark:bg-[#222]')}>{kind==='all'?'All activity':'Bank transfers & bills'}</button>)}</div></fieldset>}
      <div className="grid grid-cols-2 gap-3">{(['from','to'] as const).map(key=><PocketDateField key={key} label={key==='from'?'From':'To'} value={statementPeriod[key]} onChange={date=>setStatementPeriod(value=>({...value,[key]:date}))}/>)}</div>
      <div className="my-5 flex gap-3">{(['pdf','csv'] as const).map(format=><button key={format} type="button" aria-pressed={statementFormat===format} onClick={()=>setStatementFormat(format)} className={'h-11 flex-1 rounded-full text-sm font-semibold '+(statementFormat===format?'bg-black text-white dark:bg-white dark:text-black':'bg-gray-100 dark:bg-[#222]')}>{format.toUpperCase()}</button>)}</div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{collectionId?'Payments for this collection only.':incomingPos?'XPay payments only.':rail==='xstocks'?'XStocks activity only.':'Available records for the dates you choose.'}</p>
      {!!statementPeriod.from&&!!statementPeriod.to&&statementPeriod.from>statementPeriod.to&&<p role="alert" className="mt-3 text-xs text-red-500">End date must be on or after start date.</p>}
      {exportError&&<p role="alert" className="mt-4 text-center text-xs text-red-500">{exportError}</p>}
      <button type="button" disabled={!transactions.length||busy||exporting||!!statementPeriod.from&&!!statementPeriod.to&&statementPeriod.from>statementPeriod.to} onClick={()=>void exportStatement()} className="pocket-cta-primary mt-6 w-full">{exporting?'Preparing statement...':'Download '+statementFormat.toUpperCase()}</button>
    </PocketBottomSheet>}
    {busy&&!transactions.length?<PocketRecentActivitySkeleton/>:!visible.length?<p className="py-12 text-center text-xs text-gray-500 dark:text-gray-400">{error&&!transactions.length?error:'No transactions to show.'}</p>:<div aria-label="Transactions">
      {groups.map(group=><section key={group.key} data-pocket-activity-day className="mb-5"><h2 className="mb-2 px-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{group.label}</h2><div className="rounded-2xl bg-gray-50 px-3 dark:bg-[#141414]">{group.rows.map(row=>{
        const status=pocketActivityStatus(row),outcome=paymentReceiptOutcome({status})
        const incoming=isIncomingPosPayment(row)||row.direction==='in'||['refunded','reversed'].includes(pocketActivityStatus(row))
        const Icon=pocketActivityIcon(row)
        const title=(collectionId?row.payer:undefined)||pocketBankRecipientLabel(row)||row.activityLabel||row.memo||(incoming?'USDC received':'Payment')
        const detail=pocketBankRecipientLabel(row)?[row.bankName,'Bank transfer'].filter(Boolean).join(' / '):new Date(row.ts).toLocaleDateString(undefined,{day:'numeric',month:'short'})
        return <button key={row.eventId+':'+row.txHash} type="button" onClick={()=>{setSelected(row)}} className="flex w-full items-center gap-3 py-4 text-left" data-pocket-transaction-row>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{title}</span><span className="mt-1 block truncate text-[11px] text-gray-500 dark:text-gray-400">{detail}</span></span>
          <span className="shrink-0 text-right"><span className={`block text-xs font-semibold tabular-nums ${incoming?'text-emerald-600 dark:text-emerald-400':''}`}>{row.source==='wallet-swap'?'Swap':(incoming?'+':'-')+pocketActivityAmount(row)}</span>{(!row.assetSymbol || row.assetSymbol === 'USDC') && row.source !== 'wallet-swap' && <PocketLocalEquivalent recordedAmount={row.amountNgn} recordedCurrency={row.fiatCurrency} amount={Number(row.amount)} className="mt-1 text-[10px] font-normal text-gray-500 dark:text-gray-400" />}<span className={`mt-1 block text-[10px] capitalize ${outcome.state==='failed'?'text-red-600 dark:text-red-400':outcome.state==='successful'?'text-emerald-600 dark:text-emerald-400':'text-amber-600 dark:text-amber-400'}`}>{status}</span></span>
        </button>
      })}</div></section>)}
    </div>}
    {selectedRow&&<PocketActivityReceipt row={selectedRow} onClose={closeReceipt} onRefund={onRefund}>{selectedRow.bridge&&<PocketBridgeActivityDetails bridge={selectedRow.bridge} checking={bridgeChecking?.(selectedRow.bridge.id)||false} message={bridgeMessages?.[selectedRow.bridge.id]||''} onCheck={()=>{if(selectedRow.bridge)void onBridgeCheck?.(selectedRow.bridge)}} onNewBridge={selectedRow.paymentFunding?.length ? undefined : onNewBridge}/>}</PocketActivityReceipt>}
  </div>
}

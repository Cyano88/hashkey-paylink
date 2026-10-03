import {useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import ArcTradeReviewOperationsPanel from './ArcTradeReviewOperationsPanel'
import XStocksReviewOperationsPanel from './XStocksReviewOperationsPanel'
export default function TradeReviewOperationsPanel({workspaceId}:{workspaceId:string}){
  const [rail,setRail]=useState<'xlayer'|'arc'>('xlayer'),[busy,setBusy]=useState(false),{user}=usePrivy()
  return <>
    <div aria-label="Trade payment network" className="mt-6 flex flex-wrap gap-2">{(['xlayer','arc'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={rail===value} onClick={()=>setRail(value)} className={'min-h-11 rounded-full border px-4 text-sm disabled:opacity-40 '+(rail===value?'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950':'border-gray-200 dark:border-white/15')}>{value==='arc'?'USDC on Arc':'xStocks on XLayer'}</button>)}</div>
    {rail==='arc'?<ArcTradeReviewOperationsPanel key={`${workspaceId}:${user?.id}:arc`} workspaceId={workspaceId} onBusyChange={setBusy}/>:<XStocksReviewOperationsPanel key={`${workspaceId}:${user?.id}:xlayer`} workspaceId={workspaceId} onBusyChange={setBusy}/>}
  </>
}

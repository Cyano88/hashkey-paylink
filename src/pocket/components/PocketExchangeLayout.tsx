import {pocketAmountKeyDown} from './PocketAmountKeypad'
import type {ReactNode} from 'react'
import {PocketSkeletonBar} from './PocketContentSkeletons'

/** Shared exchange layout; asset/network selection remains in Pocket sheets. */
export default function PocketExchangeLayout(p:{amountHint?:string;source:ReactNode;destination:ReactNode;available:ReactNode;amount:string;onAmount(value:string):void;amountLabel:string;disabled:boolean;output?:string;outputAsset?:string;loading?:boolean;onMax?():void;maxDisabled?:boolean;decimals?:number}){
 return <div className="space-y-3">
  <div className="space-y-2">
   <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400"><span>From</span><span className="flex items-center gap-2">Available {p.available}{p.onMax&&<button type="button" disabled={p.disabled||p.maxDisabled} onClick={p.onMax} className="font-semibold text-gray-950 disabled:opacity-40 dark:text-white">Max</button>}</span></div>
   <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4"><div className="min-w-0">{p.source}</div><div className="min-w-0"><input aria-label={p.amountLabel} readOnly inputMode="none" onKeyDown={e=>pocketAmountKeyDown(e,p.amount,p.onAmount,p.decimals)} disabled={p.disabled} value={p.amount} onChange={e=>p.onAmount(e.target.value)} placeholder="0.00" className="min-w-0 w-full border-0 bg-transparent py-2 text-right text-[clamp(20px,6vw,30px)] font-semibold tabular-nums text-gray-950 outline-none focus:ring-0 dark:text-white"/>{p.amountHint&&<p role="status" className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{p.amountHint}</p>}</div></div>
  </div>
  <div aria-hidden="true" className="flex items-center gap-3"><span className="h-px flex-1 bg-gray-100 dark:bg-white/10"/><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4v16m-6-6 6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className="h-px flex-1 bg-gray-100 dark:bg-white/10"/></div>
  <div className="space-y-2"><p className="text-xs text-gray-500 dark:text-gray-400">To</p><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4"><div className="min-w-0">{p.destination}</div><div className="min-w-0 text-right" aria-label="You receive" aria-live="polite">{p.loading?<span role="status" aria-label="Updating amount"><PocketSkeletonBar className="ml-auto h-8 w-24"/></span>:<><p className="break-words text-[clamp(20px,6vw,30px)] font-semibold tabular-nums">{p.output||'0.00'}</p>{p.outputAsset&&<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{p.outputAsset}</p>}</>}</div></div></div>
 </div>
}

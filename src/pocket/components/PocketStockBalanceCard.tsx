import {useState} from 'react'
import {ChevronRight,Eye,EyeOff,QrCode} from './PocketIcons'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'
import {formatStockQuantity} from '../lib/pocketStockDisplay'

type Props={total:number|null;cash:number|null;investments:number|null;gas:number|null;loading:boolean;visible:boolean;onToggle:()=>void;onScan:()=>void;localEquivalent?:string;staleLabel?:string;walletMissing?:boolean}
export default function PocketStockBalanceCard({total,cash,investments,gas,loading,visible,onToggle,onScan,localEquivalent,staleLabel,walletMissing}:Props){
 const [index,setIndex]=useState(0)
 const entries=[{label:'Spendable',value:cash,unit:'USDC'},{label:'Stocks invested',value:investments,unit:'USD'},{label:'Transaction fees',value:gas,unit:'OKB'}]
 const entry=entries[index]
 const unavailable=walletMissing?'Open wallet':'Unavailable'
 return <section data-pocket-balance-card className="overflow-hidden rounded-[26px] bg-gray-950 px-5 py-4 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
  <div className="relative">
   <div className="min-w-0 text-center">
    <div className="flex items-center justify-center px-12"><div className="relative"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Total value</p><button type="button" onClick={onToggle} className="absolute left-full top-1/2 ml-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-white/65 hover:bg-white/10 dark:text-gray-500 dark:hover:bg-gray-950/[0.06]" aria-label={visible?'Hide balances':'Show balances'}>{visible?<Eye className="h-3.5 w-3.5"/>:<EyeOff className="h-3.5 w-3.5"/>}</button></div></div>
    <div className="mt-1.5">{visible&&total===null&&loading?<span role="status" aria-label="Loading balances" className="mx-auto block h-10 w-44 animate-pulse rounded-xl bg-white/15 dark:bg-gray-950/10"/>:<p className="min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight"><span className="relative inline-block"><span data-pocket-total-amount>{!visible?'....':total===null?'—':formatPocketDisplayAmount(total)}</span><span className="absolute bottom-1 left-full ml-1.5 whitespace-nowrap text-xs font-medium tracking-normal opacity-50">USD</span></span></p>}</div>
    <div className="mt-1 flex h-4 items-center justify-center text-xs font-semibold tabular-nums leading-4 text-white/55 dark:text-gray-500">{!visible?null:staleLabel||(total===null&&!loading?unavailable:localEquivalent)}</div>
   </div>
   <div className="absolute right-0 top-0 flex items-center gap-1"><button type="button" onClick={onScan} className="flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white dark:text-gray-500 dark:hover:bg-gray-950/[0.06] dark:hover:text-gray-950"><QrCode className="h-5 w-5"/><span className="text-[9px] font-black uppercase tracking-wide">Scan</span></button></div>
  </div>
  <div className="mt-4 flex items-center justify-center gap-2"><button type="button" aria-label={entry.label+'. Show '+entries[(index+1)%entries.length].label} onClick={()=>setIndex((index+1)%entries.length)} className="flex h-14 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold"><span className="relative">{entry.label}<ChevronRight className="absolute left-full top-1/2 ml-1 h-3.5 w-3.5 -translate-y-1/2"/></span></button></div>
  <div aria-live="polite" className="mt-3 border-t border-white/10 pt-3 text-center dark:border-gray-950/10">{visible&&entry.value===null&&loading?<span role="status" aria-label={'Loading '+entry.label.toLowerCase()} className="mx-auto block h-6 w-28 animate-pulse rounded-lg bg-white/10 dark:bg-gray-950/[0.08]"/>:<p className="text-lg font-semibold tabular-nums tracking-tight"><span className="relative inline-block"><span data-pocket-detail-amount>{!visible?'....':entry.value===null?unavailable:entry.unit==='OKB'?formatStockQuantity(entry.value):formatPocketDisplayAmount(entry.value)}</span><span className="absolute bottom-0.5 left-full ml-1 whitespace-nowrap text-[10px] font-medium tracking-normal opacity-50">{entry.value!==null||!visible?entry.unit:''}</span></span></p>}</div>
 </section>
}

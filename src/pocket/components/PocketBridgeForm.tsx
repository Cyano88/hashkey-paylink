import type {ReactNode} from 'react'
import PocketSelect, {type PocketSelectOption} from './PocketSelect'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'

type Props = {
  asset:'USDC'|'USDT'; hidden?:boolean; disabled:boolean
  source:string; destination:string; sources:PocketSelectOption[]; destinations:PocketSelectOption[]
  onSource(value:string):void; onDestination(value:string):void
  balance?:number; amount:string; onAmount(value:string):void; onMax():void; maxDisabled?:boolean
  quote?:{receive:string;fee:string;minimumReceive?:string}|null
  children:ReactNode
}

/** One visible form for both bridge rails; provider-specific execution stays outside. */
export default function PocketBridgeForm(p:Props){
  return <section hidden={p.hidden} className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-[#262626] dark:bg-[#0D0D0D] dark:shadow-none">
    <div className="grid grid-cols-2 gap-3">
      <div><p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">From</p><PocketSelect disabled={p.disabled} showNetworkBalances={p.asset==='USDC'} value={p.source} options={p.sources} onChange={p.onSource} ariaLabel="Select source network"/></div>
      <div><p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">To</p><PocketSelect disabled={p.disabled} showNetworkBalances={p.asset==='USDC'} value={p.destination} options={p.destinations} onChange={p.onDestination} ariaLabel="Select destination network"/></div>
    </div>
    <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#121212]"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Available</span><span className="text-sm font-semibold tabular-nums">{p.balance===undefined?'—':formatPocketDisplayAmount(p.balance)+' '+p.asset}</span></div>
    <label className="block"><span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Amount</span><span className="mt-2 flex gap-2"><input type="text" aria-label={p.asset+' bridge amount'} inputMode="decimal" disabled={p.disabled} value={p.amount} onChange={e=>p.onAmount(e.target.value)} placeholder="0.00" className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-semibold outline-none dark:border-[#262626] dark:bg-[#121212]"/><button type="button" disabled={p.disabled||p.maxDisabled} onClick={p.onMax} className="rounded-2xl border border-gray-200 px-4 text-xs font-semibold dark:border-[#262626]">Max</button></span></label>
    {p.quote&&<div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-xs dark:bg-[#121212]">
      <div className="flex justify-between"><span className="text-gray-500">You receive</span><b>{formatPocketDisplayAmount(p.quote.receive)} {p.asset}</b></div>
      {p.quote.minimumReceive&&<div className="flex justify-between"><span className="text-gray-500">Minimum received</span><b>{formatPocketDisplayAmount(p.quote.minimumReceive)} {p.asset}</b></div>}
      <div className="flex justify-between"><span className="text-gray-500">Bridge fee</span><b>{formatPocketDisplayAmount(p.quote.fee)} {p.asset}</b></div>
    </div>}
    {p.children}
  </section>
}

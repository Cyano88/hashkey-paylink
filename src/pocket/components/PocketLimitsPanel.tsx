import {useState,type ReactNode} from 'react'
import {BILL_LIMITS_USD,ESIM_PER_ORDER_USD} from '../../lib/billLimits'
import PocketBillCountryLimits from './PocketBillCountryLimits'
import {PURCHASE_DAILY_USD} from '../../lib/purchaseLimits'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import type {PocketBillsLimitUsage} from '../api/pocketBillsClient'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
import PocketTransferAllowanceView from './PocketTransferAllowanceView'

export const limitCardClass='rounded-3xl bg-white p-5 dark:bg-[#0D0D0D]'
function BillLimit({title,detail,used,limit,airtime,getAccessToken}:{title:string;detail:ReactNode;used:number|null;limit:number;airtime:boolean;getAccessToken:()=>Promise<string|null>}){
 const [open,setOpen]=useState(false),display=usePocketLimitDisplay(),remaining=used===null?null:Math.max(0,limit-used)
 return <article className={limitCardClass}>
  <h3 className="text-sm font-semibold">{title}</h3>
  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span className="text-xl font-semibold tracking-tight">{display.fromUsd(limit)}</span><span className="text-xs text-gray-500">Daily allowance</span></div>
  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" aria-hidden="true"><div className="h-full rounded-full bg-blue-600" style={{width:used===null?'0%':Math.min(100,Math.max(0,used/limit*100))+'%'}}/></div>
  {remaining===null?<div role="status" aria-label="Loading today's usage" className="mt-3 h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-white/10"/>:<div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className="text-gray-500">{display.fromUsd(used!)} used</span><span className="font-medium">{display.fromUsd(remaining)} left</span></div>}
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="mt-4 min-h-10 w-full text-left text-xs font-semibold">{open?'Hide country limits':'View country limits'} <span aria-hidden="true">{open?'−':'+'}</span></button>
  {open&&<PocketBillCountryLimits airtime={airtime} getAccessToken={getAccessToken}/>}
 </article>
}
export default function PocketLimitsPanel({usage,bank,busy,error,onRefresh,getAccessToken}:{usage:PocketBillsLimitUsage|null;bank:PocketBankPayoutLimit|null;busy:boolean;error:string;onRefresh:()=>void;getAccessToken:()=>Promise<string|null>}){
 const display=usePocketLimitDisplay(),airtime=usage?.airtime??{perPaymentUsd:BILL_LIMITS_USD.airtimePerPayment,dailyLimitUsd:BILL_LIMITS_USD.airtimeDaily,usedTodayUsd:null},bills=usage?.otherBills??{dailyLimitUsd:BILL_LIMITS_USD.otherBillsDaily,usedTodayUsd:null}
 return <section className="space-y-5 pt-5 pb-4">
  <div className="flex items-center justify-between gap-3 px-1"><p className="text-xs text-gray-500 dark:text-gray-400">Resets at midnight · Lagos time</p><span className="rounded-full bg-gray-200/60 px-3 py-1 text-[11px] font-semibold dark:bg-white/10">{display.currency}</span></div>
  <article className={limitCardClass}>
   <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Online and QR purchases</h2><span className="text-[11px] text-gray-500">Basic verification</span></div>
   <p className="mt-4 text-[28px] font-semibold tracking-tight">{display.fromUsd(PURCHASE_DAILY_USD)}</p>
   <p className="mt-1 text-xs text-gray-500">Daily purchase allowance</p>
   <p className="mt-4 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400">One allowance across online stores and physical QR payments. Separate from personal transfers.</p>
  </article>
  <PocketTransferAllowanceView getAccessToken={getAccessToken} bank={bank}/>
  <div className="space-y-3"><h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500">Bill payments</h2>
   <BillLimit title="Airtime" detail={<>Up to {display.fromUsd(airtime.perPaymentUsd)} per payment · Country and network limits apply</>} airtime={true} getAccessToken={getAccessToken} used={airtime.usedTodayUsd} limit={airtime.dailyLimitUsd}/>
   <BillLimit title="Data, TV and electricity" detail="One shared allowance across services and countries" airtime={false} getAccessToken={getAccessToken} used={bills.usedTodayUsd} limit={bills.dailyLimitUsd}/>
  </div>
  <article className={limitCardClass}><h2 className="text-sm font-semibold">Travel eSIM</h2><p className="mt-4 text-xl font-semibold">{display.fromUsd(ESIM_PER_ORDER_USD)}</p><p className="mt-1 text-xs text-gray-500">Per order · Network fees shown separately</p><p className="mt-4 text-xs leading-5 text-gray-500">One plan per order. Separate from bill and bank-transfer allowances. No BVN verification required.</p></article>
  {error&&<div className="flex items-center justify-between gap-3 px-1 text-xs text-gray-500"><span>{error}</span><button disabled={busy} onClick={onRefresh} className="min-h-10 shrink-0 font-semibold text-gray-950 dark:text-white">Refresh</button></div>}
  <p className="px-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">Converted amounts are estimates and refresh with provider rates. Country, provider and product limits may be lower. Your final quote is checked before payment.</p>
 </section>
}

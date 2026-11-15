import {BILL_LIMITS_USD,ESIM_PER_ORDER_USD} from '../../lib/billLimits'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import usePocketVerifiedLevel, {type VerifiedProfile} from '../hooks/usePocketVerifiedLevel'
import type {PocketBillsLimitUsage} from '../api/pocketBillsClient'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
import PocketTransferAllowanceView from './PocketTransferAllowanceView'
import PocketBillCountryLimits from './PocketBillCountryLimits'
import {Phone,Wifi,Tv,Lightbulb,ChevronRight,Store,Landmark,Globe} from './PocketIcons'

export const LIMIT_PAGES={purchases:'Online and QR purchases',transfers:'Personal bank transfers',airtime:'Airtime',data:'Data',tv:'TV',electricity:'Electricity',esim:'Travel eSIM'} as const
export type PocketLimitPage=keyof typeof LIMIT_PAGES
export function pocketLimitPage(value:string|null):PocketLimitPage|null{return value&&!['purchases','transfers'].includes(value)&&Object.prototype.hasOwnProperty.call(LIMIT_PAGES,value)?value as PocketLimitPage:null}
const actions=[{id:'purchases',Icon:Store},{id:'transfers',Icon:Landmark},{id:'airtime',Icon:Phone},{id:'data',Icon:Wifi},{id:'tv',Icon:Tv},{id:'electricity',Icon:Lightbulb},{id:'esim',Icon:Globe}] as const
export default function PocketLimitsPanel({verifiedProfile,view=null,onSelect,usage,busy,error,onRefresh,getAccessToken}:{verifiedProfile?:VerifiedProfile;view?:PocketLimitPage|null;onSelect:(view:PocketLimitPage)=>void;usage:PocketBillsLimitUsage|null;bank:PocketBankPayoutLimit|null;busy:boolean;error:string;onRefresh:()=>void;getAccessToken:()=>Promise<string|null>}){
 const display=usePocketLimitDisplay(),verification=usePocketVerifiedLevel(getAccessToken,verifiedProfile),level=verification?.level
 if(!view||view==='purchases'||view==='transfers')return <section aria-label="Spending limit categories" className="mt-4 divide-y divide-gray-100 dark:divide-[#262626]">{actions.map(({id,Icon})=>id==='purchases'||id==='transfers'?<section key={id} aria-label={LIMIT_PAGES[id]} className="flex items-start gap-4 px-1 py-4">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
  <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-gray-950 dark:text-white">{LIMIT_PAGES[id]}</h2><PocketTransferAllowanceView purchases={id==='purchases'} verifiedLevel={level} getAccessToken={getAccessToken}/></div>
 </section>:<button key={id} type="button" onClick={()=>onSelect(id)} className="flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition active:scale-[0.99]">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-950 dark:text-white">{LIMIT_PAGES[id]}</span><span className="mt-1 block text-xs text-gray-500">{display.fromUsd(id==='airtime'?BILL_LIMITS_USD.airtimeDaily:id==='esim'?ESIM_PER_ORDER_USD:BILL_LIMITS_USD.otherBillsDaily)} {id==='esim'?'per order':['data','tv','electricity'].includes(id)?'shared daily':'daily'}</span></span>
  <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
 </button>)}</section>
 if(view==='esim')return <section className="pt-8"><p className="mt-4 text-3xl font-semibold tracking-tight">{display.fromUsd(ESIM_PER_ORDER_USD)}</p><p className="mt-2 text-xs text-gray-500">Per order</p><p className="mt-6 text-sm leading-6 text-gray-500">One plan per order. No local identity verification required. Network fees are shown separately.</p></section>
 const airtime=view==='airtime',bucket=airtime?usage?.airtime:usage?.otherBills,limit=bucket?.dailyLimitUsd??(airtime?BILL_LIMITS_USD.airtimeDaily:BILL_LIMITS_USD.otherBillsDaily)
 return <section className="pt-8">
  <p className="text-3xl font-semibold tracking-tight">{display.fromUsd(limit)}</p><p className="mt-2 text-xs text-gray-500">{airtime?'Daily allowance':'Shared daily allowance'}</p>
  <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-gray-500">{bucket?<><span>{display.fromUsd(bucket.usedTodayUsd)} used</span><span>{display.fromUsd(bucket.remainingTodayUsd)} left</span></>:<span role="status" aria-label="Loading today's usage" className="flex w-full animate-pulse justify-between"><span aria-hidden="true" className="h-3 w-24 rounded bg-gray-200/70 dark:bg-white/10"/><span aria-hidden="true" className="h-3 w-24 rounded bg-gray-200/70 dark:bg-white/10"/></span>}</div>
  {airtime&&<p className="mt-3 text-xs text-gray-500">Up to {display.fromUsd(BILL_LIMITS_USD.airtimePerPayment)} per payment</p>}
  {error&&<button disabled={busy} onClick={onRefresh} className="mt-3 min-h-10 text-xs text-gray-500">Refresh usage</button>}
  {!airtime&&<p className="mt-3 text-xs text-gray-500">Shared across data, TV and electricity.</p>}
  <PocketBillCountryLimits key={view} category={view} getAccessToken={getAccessToken}/>
 </section>
}

import {BILL_LIMITS_USD,ESIM_PER_ORDER_USD} from '../../lib/billLimits'
import {PURCHASE_DAILY_USD} from '../../lib/purchaseLimits'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import usePocketVerifiedLevel from '../hooks/usePocketVerifiedLevel'
import type {PocketBillsLimitUsage} from '../api/pocketBillsClient'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
import PocketTransferAllowanceView from './PocketTransferAllowanceView'
import PocketBillCountryLimits from './PocketBillCountryLimits'
import {Phone,Wifi,Tv,Lightbulb,ChevronRight,Store,Landmark,Globe} from './PocketIcons'

export const LIMIT_PAGES={purchases:'Online and QR purchases',transfers:'Personal bank transfers',airtime:'Airtime',data:'Data',tv:'TV',electricity:'Electricity',esim:'Travel eSIM'} as const
export type PocketLimitPage=keyof typeof LIMIT_PAGES
export function pocketLimitPage(value:string|null):PocketLimitPage|null{return value&&Object.prototype.hasOwnProperty.call(LIMIT_PAGES,value)?value as PocketLimitPage:null}
const actions=[{id:'purchases',Icon:Store},{id:'transfers',Icon:Landmark},{id:'airtime',Icon:Phone},{id:'data',Icon:Wifi},{id:'tv',Icon:Tv},{id:'electricity',Icon:Lightbulb},{id:'esim',Icon:Globe}] as const
const verifiedClass='inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
export default function PocketLimitsPanel({view=null,onSelect,usage,bank,busy,error,onRefresh,getAccessToken}:{view?:PocketLimitPage|null;onSelect:(view:PocketLimitPage)=>void;usage:PocketBillsLimitUsage|null;bank:PocketBankPayoutLimit|null;busy:boolean;error:string;onRefresh:()=>void;getAccessToken:()=>Promise<string|null>}){
 const display=usePocketLimitDisplay(),verification=usePocketVerifiedLevel(getAccessToken),level=verification?.level,verified=level==='basic'||level==='advanced'
 const badge=(id:string)=>verified&&(id==='purchases'||id==='transfers')?<span className={verifiedClass}>{id==='transfers'&&level==='advanced'?'Advanced verified':'Basic verified'}</span>:null
 if(!view)return <section aria-label="Spending limit categories" className="mt-4 divide-y divide-gray-100 dark:divide-[#262626]">{actions.map(({id,Icon})=><button key={id} type="button" onClick={()=>onSelect(id)} className="flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition active:scale-[0.99]">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-950 dark:text-white">{LIMIT_PAGES[id]}</span><span className="mt-1 block text-xs text-gray-500">{id==='transfers'?verification?<>{display.fromUsd(verification.dailyLimitUsd)} daily</>:'Verification allowance':<>{display.fromUsd(id==='purchases'?PURCHASE_DAILY_USD:id==='airtime'?BILL_LIMITS_USD.airtimeDaily:id==='esim'?ESIM_PER_ORDER_USD:BILL_LIMITS_USD.otherBillsDaily)} {id==='esim'?'per order':['data','tv','electricity'].includes(id)?'shared daily':'daily'}</>}</span>{verified&&(id==='purchases'||id==='transfers')&&<span className="mt-2 block">{badge(id)}</span>}</span>
  <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
 </button>)}</section>
 if(view==='transfers')return <div className="pt-6"><PocketTransferAllowanceView getAccessToken={getAccessToken} bank={bank}/></div>
 if(view==='purchases'||view==='esim')return <section className="pt-8">{view==='purchases'&&badge(view)}<p className="mt-4 text-3xl font-semibold tracking-tight">{display.fromUsd(view==='purchases'?PURCHASE_DAILY_USD:ESIM_PER_ORDER_USD)}</p><p className="mt-2 text-xs text-gray-500">{view==='purchases'?'Daily allowance':'Per order'}</p><p className="mt-6 text-sm leading-6 text-gray-500">{view==='purchases'?`One allowance across online stores and QR payments. ${verified?'':'Basic verification required. '}Resets at midnight, Lagos time.`:'One plan per order. No local identity verification required. Network fees are shown separately.'}</p></section>
 const airtime=view==='airtime',bucket=airtime?usage?.airtime:usage?.otherBills,limit=bucket?.dailyLimitUsd??(airtime?BILL_LIMITS_USD.airtimeDaily:BILL_LIMITS_USD.otherBillsDaily)
 return <section className="pt-8">
  <p className="text-3xl font-semibold tracking-tight">{display.fromUsd(limit)}</p><p className="mt-2 text-xs text-gray-500">{airtime?'Daily allowance':'Shared daily allowance'}</p>
  <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-gray-500">{bucket?<><span>{display.fromUsd(bucket.usedTodayUsd)} used</span><span>{display.fromUsd(bucket.remainingTodayUsd)} left</span></>:<span role="status" aria-label="Loading today's usage">Loading usage…</span>}</div>
  {airtime&&<p className="mt-3 text-xs text-gray-500">Up to {display.fromUsd(BILL_LIMITS_USD.airtimePerPayment)} per payment</p>}
  {error&&<button disabled={busy} onClick={onRefresh} className="mt-3 min-h-10 text-xs text-gray-500">Refresh usage</button>}
  {!airtime&&<p className="mt-3 text-xs text-gray-500">Shared across data, TV and electricity.</p>}
  <PocketBillCountryLimits key={view} category={view} getAccessToken={getAccessToken}/>
 </section>
}

import PocketVerificationBadge from './PocketVerificationBadge'
import {PocketSkeletonBar} from './PocketContentSkeletons'
import {PURCHASE_DAILY_USD} from '../../lib/purchaseLimits'
import {BILL_LIMITS_USD,ESIM_PER_ORDER_USD} from '../../lib/billLimits'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import usePocketVerifiedLevel, {type VerifiedProfile} from '../hooks/usePocketVerifiedLevel'
import type {PocketBillsLimitUsage} from '../api/pocketBillsClient'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
import PocketTransferAllowanceView from './PocketTransferAllowanceView'
import PocketPaymentCountryLimits from './PocketPaymentCountryLimits'
import PocketBillCountryLimits from './PocketBillCountryLimits'
import {Phone,Wifi,Tv,Lightbulb,ChevronRight,Store,Landmark,Globe} from './PocketIcons'

export const LIMIT_PAGES={purchases:'Online and QR purchases',transfers:'Personal transfers',airtime:'Airtime',data:'Data',tv:'TV',electricity:'Electricity',esim:'Travel eSIM'} as const
export type PocketLimitPage=keyof typeof LIMIT_PAGES
export function pocketLimitPage(value:string|null):PocketLimitPage|null{return value&&Object.prototype.hasOwnProperty.call(LIMIT_PAGES,value)?value as PocketLimitPage:null}
const actions=[{id:'purchases',Icon:Store},{id:'transfers',Icon:Landmark},{id:'airtime',Icon:Phone},{id:'data',Icon:Wifi},{id:'tv',Icon:Tv},{id:'electricity',Icon:Lightbulb},{id:'esim',Icon:Globe}] as const
export default function PocketLimitsPanel({verifiedProfile,view=null,onSelect,usage,busy,error,onRefresh,getAccessToken}:{verifiedProfile?:VerifiedProfile;view?:PocketLimitPage|null;onSelect:(view:PocketLimitPage)=>void;usage:PocketBillsLimitUsage|null;bank:PocketBankPayoutLimit|null;busy:boolean;error:string;onRefresh:()=>void;getAccessToken:()=>Promise<string|null>}){
 const display=usePocketLimitDisplay(),verification=usePocketVerifiedLevel(getAccessToken,verifiedProfile),level=verification?.level
 if(!view)return <section aria-label="Spending limit categories" className="mt-4 divide-y divide-gray-100 dark:divide-[#262626]">{actions.map(({id,Icon})=><button key={id} type="button" onClick={()=>onSelect(id)} className="flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition active:scale-[0.99]">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5"/></span>
  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-950 dark:text-white">{LIMIT_PAGES[id]}</span><span className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-xs leading-4 text-gray-500"><span>{id==='transfers'&&!verification?<PocketSkeletonBar className="h-3 w-28"/>:<>{display.fromUsd(id==='purchases'?PURCHASE_DAILY_USD:id==='transfers'?verification!.dailyLimitUsd:id==='airtime'?BILL_LIMITS_USD.airtimeDaily:id==='esim'?ESIM_PER_ORDER_USD:BILL_LIMITS_USD.otherBillsDaily)} {id==='esim'?'per purchase':['data','tv','electricity'].includes(id)?'shared daily':'daily'}</>}</span>{(id==='purchases'||id==='transfers')&&level&&level!=='none'&&<PocketVerificationBadge level={id==='transfers'&&level==='advanced'?'advanced':'basic'}/>}</span></span>
  <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
 </button>)}<p className="pt-4 text-[11px] text-gray-500">Daily limits reset at 00:00 UTC.</p></section>
 if(view==='purchases'||view==='transfers')return <div className="pt-6"><PocketTransferAllowanceView purchases={view==='purchases'} verifiedLevel={level} getAccessToken={getAccessToken}/><PocketPaymentCountryLimits purchases={view==='purchases'} getAccessToken={getAccessToken}/></div>
 if(view==='esim')return <section className="pt-6"><p className="text-xs text-gray-500">{display.fromUsd(ESIM_PER_ORDER_USD)} per purchase</p><p className="mt-6 text-sm leading-6 text-gray-500">One plan per purchase. Fees are shown before you pay.</p></section>
 const airtime=view==='airtime',bucket=airtime?usage?.airtime:usage?.otherBills,limit=bucket?.dailyLimitUsd??(airtime?BILL_LIMITS_USD.airtimeDaily:BILL_LIMITS_USD.otherBillsDaily)
 return <section className="pt-6">
  <p className="mt-1 text-xs text-gray-500">{display.fromUsd(limit)} daily</p>
  <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-gray-500">{bucket?<><span>{display.fromUsd(bucket.usedTodayUsd)} used</span><span>{display.fromUsd(bucket.remainingTodayUsd)} left</span></>:<span role="status" aria-label="Loading today's usage" className="flex w-full animate-pulse justify-between"><span aria-hidden="true" className="h-3 w-24 rounded bg-gray-200/70 dark:bg-white/10"/><span aria-hidden="true" className="h-3 w-24 rounded bg-gray-200/70 dark:bg-white/10"/></span>}</div>
  {airtime&&<p className="mt-3 text-xs text-gray-500">Up to {display.fromUsd(BILL_LIMITS_USD.airtimePerPayment)} per payment</p>}
  {error&&<button disabled={busy} onClick={onRefresh} className="mt-3 min-h-10 text-xs text-gray-500">Refresh limits</button>}
  {!airtime&&<p className="mt-3 text-xs text-gray-500">Shared across data, TV and electricity.</p>}
  <PocketBillCountryLimits key={view} category={view} getAccessToken={getAccessToken}/>
 </section>
}

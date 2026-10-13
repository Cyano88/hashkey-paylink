import PocketAmountKeypad from './PocketAmountKeypad'
import PocketExchangeLayout from './PocketExchangeLayout'
import { PocketQuoteSkeleton } from './PocketContentSkeletons'
import type {ReactNode} from 'react'
import PocketSelect, {type PocketSelectOption} from './PocketSelect'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'

type Props = {
  asset:'USDC'|'USDT'; hidden?:boolean; disabled:boolean
  source:string; destination:string; sources:PocketSelectOption[]; destinations:PocketSelectOption[]
  onSource(value:string):void; onDestination(value:string):void
  balance?:number; amount:string; onAmount(value:string):void; onMax():void; maxDisabled?:boolean
  quote?:{receive:string;fee:string;minimumReceive?:string;total?:string}|null
  quoteLoading?:boolean
  children:ReactNode
}

/** One visible form for both bridge rails; provider-specific execution stays outside. */
export default function PocketBridgeForm(p:Props){
  if(p.hidden)return null
  return <section hidden={p.hidden} className="flex min-h-0 flex-1 flex-col gap-3 bg-transparent">
    <PocketExchangeLayout
      source={<PocketSelect buttonClassName="border-0 bg-gray-50 dark:bg-[#181818]" showUpcomingXLayer disabled={p.disabled} networkBalanceAsset={p.asset} value={p.source} options={p.sources} onChange={p.onSource} ariaLabel="Select source network"/>}
      destination={<PocketSelect buttonClassName="border-0 bg-gray-50 dark:bg-[#181818]" showUpcomingXLayer disabled={p.disabled} networkBalanceAsset={p.asset} value={p.destination} options={p.destinations} onChange={p.onDestination} ariaLabel="Select destination network"/>}
      available={p.balance===undefined?'?':formatPocketDisplayAmount(p.balance)+' '+p.asset}
      amount={p.amount} amountLabel={p.asset+' bridge amount'} onAmount={p.onAmount} disabled={p.disabled} onMax={p.onMax} maxDisabled={p.maxDisabled}
      output={p.quote?formatPocketDisplayAmount(p.quote.receive):undefined} outputAsset={p.asset} loading={p.quoteLoading}
    />

    {p.quote&&<div className="space-y-1 text-xs">
      {p.quote.minimumReceive&&<div className="flex justify-between"><span className="text-gray-500">Minimum received</span><b>{formatPocketDisplayAmount(p.quote.minimumReceive)} {p.asset}</b></div>}
      <div className="flex justify-between"><span className="text-gray-500">Fee</span><b>{formatPocketDisplayAmount(p.quote.fee)} {p.asset}</b></div>
      {p.quote.total&&<div className="flex justify-between"><span className="text-gray-500">Total</span><b>{formatPocketDisplayAmount(p.quote.total)} {p.asset}</b></div>}
      {Number(p.amount)>0&&Number(p.quote.fee)/Number(p.amount)>0.05&&<p role="status" className="pt-1 text-xs text-gray-500 dark:text-gray-400">The fee is high for this amount. You can still proceed.</p>}
    </div>}
    <div className="mt-auto shrink-0 space-y-2">{p.children}<PocketAmountKeypad value={p.amount} onChange={p.onAmount} disabled={p.disabled}/></div>
  </section>
}

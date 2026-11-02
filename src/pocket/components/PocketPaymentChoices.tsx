import PocketSelect from './PocketSelect'
import CheckoutPaymentMethods from '../../components/CheckoutPaymentMethods'
import PocketNetworkMark from './PocketNetworkMark'
import {Landmark} from './PocketIcons'
import {PocketPaymentMethodIcon} from './PocketWebPaymentIdentity'
import {xpayDestinationDetail,type XPayDestination} from '../lib/pocketUnifiedXPay'
const names:Record<string,string>={base:'Base',arc:'Arc',arbitrum:'Arbitrum',solana:'Solana',ethereum:'Ethereum',polygon:'Polygon',xlayer:'X Layer',bsc:'BNB Chain'}
export default function PocketPaymentChoices({destinations,value,onChange,network,onNetworkChange}:{destinations:XPayDestination[];value:string;onChange:(id:string)=>void;network:string;onNetworkChange:(network:string)=>void}){
 const selected=destinations.find(d=>d.id===value)
 const choices=<div className="space-y-3">
  <fieldset aria-label="Payment options" className="space-y-3">
   {destinations.map(d=><label key={d.id} className={'flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border p-4 '+(value===d.id?'border-gray-950 bg-gray-50 dark:border-white dark:bg-white/5':'border-gray-200 dark:border-[#262626]')}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-[#121212]">{d.kind==='bank'?<Landmark className="h-5 w-5"/>:d.kind==='xstocks'?<PocketNetworkMark network="xlayer"/>:<PocketPaymentMethodIcon className="h-5 w-5"/>}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{d.kind==='bank'?'Local currency':d.assets.join(' / ')}{d.kind==='bank'&&<span className="ml-2 text-xs text-gray-500">{d.currency}</span>}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{xpayDestinationDetail(d)}</span></span>
    <input aria-label={d.kind==='bank'?'Merchant receives '+d.currency:d.assets.join(' / ')+' on '+(d.kind==='xstocks'?'X Layer':'selected networks')} className="h-4 w-4 shrink-0 accent-black dark:accent-white" type="radio" name="destination" checked={value===d.id} onChange={()=>onChange(d.id)}/>
   </label>)}
  </fieldset>
  {selected?.kind==='stablecoins'&&<div className="pt-1"><p className="mb-2 text-xs font-medium text-gray-500">Network</p><PocketSelect ariaLabel="Payment network" showNetworkBalances={false} layer={95} value={selected.networks?.includes(network)?network:selected.networks?.[0]||'base'} options={(selected.networks||['base']).map(value=>({value,label:names[value]||value}))} onChange={onNetworkChange}/></div>}
 </div>
 const hasStocks=destinations.some(d=>d.kind==='xstocks'&&d.assets.some(asset=>!['USDC','USDT','USDe','USDG'].includes(asset)))
 return hasStocks?choices:<CheckoutPaymentMethods>{choices}</CheckoutPaymentMethods>
}

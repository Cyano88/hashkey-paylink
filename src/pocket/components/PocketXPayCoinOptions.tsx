import {ChevronRightIcon} from '@heroicons/react/24/outline'
import {XPAY_COINS,type XPayCoin} from '../lib/xpayStablecoinOptions'
const icons={USDC:'/brand/usdc-circle-logo.png',USDT:'/brand/usdt.svg',USDe:'/brand/usde.svg',USDG:'/brand/usdg.png'}
export default function PocketXPayCoinOptions({onSelect}:{onSelect:(coin:XPayCoin)=>void}){
 return <div aria-label="Stablecoins" className="divide-y divide-gray-100 dark:divide-white/10">{XPAY_COINS.map(coin=><button key={coin} onClick={()=>onSelect(coin)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left"><img src={icons[coin]} alt="" className="h-7 w-7 object-contain"/><span className="flex-1 text-sm font-semibold">{coin}</span><ChevronRightIcon className="h-5 w-5"/></button>)}</div>
}

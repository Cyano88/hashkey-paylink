import {useMemo,useState} from 'react'
import PocketArcTokenPicker from '../../components/PocketArcTokenPicker'
import usePocketStockQuotes from '../../hooks/usePocketStockQuotes'
import {stockPickerTokens} from '../../lib/pocketStockPickerTokens'
import {formatStockQuantity} from '../../lib/pocketStockDisplay'
import type {StockBalanceSnapshot} from '../../lib/pocketXStocksWallet'
import type {MultiGiftAsset} from './pocketMultiGift'
const dollars=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value)
export default function PocketGiftStockPicker({assets,value,snapshot,balancesLoading=false,balanceStale=false,onChange}:{assets:readonly MultiGiftAsset[];value:string;snapshot?:StockBalanceSnapshot|null;balancesLoading?:boolean;balanceStale?:boolean;onChange(token:string):void}){
 const [visible,setVisible]=useState<string[]>([])
 const quotes=usePocketStockQuotes([...visible,value].filter(Boolean))
 const tokens=useMemo(()=>{
  const allowed=new Map(assets.map(a=>[a.token.toLowerCase(),a]))
  return stockPickerTokens(snapshot).filter(t=>allowed.has(t.address.toLowerCase())).map(t=>{
   const key=t.address.toLowerCase(),quote=quotes.displayQuotes[key],stale=quote&&!quotes.quotes[key]
   return {...t,decimals:allowed.get(key)!.decimals,priceLabel:quote?dollars(quote.usd)+' each'+(stale?' (last known)':''):quotes.busy?'Loading price...':'Price unavailable',holdingLabel:t.balance===null?'Holding unavailable':formatStockQuantity(t.balance)+' held',holdingValueLabel:t.balance!==null&&quote?'~ '+dollars(Number(t.balance)*quote.usd)+(stale||balanceStale?' (last known)':''):undefined}
  })
 },[assets,snapshot,quotes.displayQuotes,quotes.quotes,quotes.busy,balanceStale])
 const selected=tokens.find(t=>t.address.toLowerCase()===value.toLowerCase())
 return <><PocketArcTokenPicker label="Gift stock" value={value} excluded="" tokens={tokens} networkLabel="X Layer" clean initialLimit={30} resultLimit={30} balancesLoading={balancesLoading} onVisibleTokensChange={setVisible} onChange={t=>onChange(t.address)} discover={async()=>{throw Error('Choose a supported gift stock.')}}/>{selected&&<div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"><span>{balancesLoading?'Loading holding...':selected.holdingLabel}{balanceStale?' (last known)':''}</span><span>{selected.priceLabel}</span></div>}</>
}

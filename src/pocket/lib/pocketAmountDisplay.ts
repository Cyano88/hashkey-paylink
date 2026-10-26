import {formatPocketDisplayAmount} from './pocketMoney'
import {formatStockQuantity} from './pocketStockDisplay'

/** Display only: never use rounded text for Max, quotes, approvals or transactions. */
export function formatPocketAssetAmount(value:string|number,symbol:string){
 if(!Number.isFinite(Number(value)))return '\u2014'
 const asset=symbol.toUpperCase()
 if(['USD','EUR','NGN','UGX'].includes(asset))return formatPocketFiatValue(value,asset)
 return ['USDC','EURC','USDT','USDT0','USDE'].includes(asset)?formatPocketDisplayAmount(value):formatStockQuantity(value)
}
export function formatPocketExchangeLabel(label:string){
 const match=label.match(/^([0-9]+(?:\.[0-9]+)?) ([A-Za-z0-9]+) (?:to|\u2192) ([0-9]+(?:\.[0-9]+)?) ([A-Za-z0-9]+)$/)
 return match?formatPocketAssetAmount(match[1],match[2])+' '+match[2]+' \u2192 '+formatPocketAssetAmount(match[3],match[4])+' '+match[4]:label
}

const fiatFormats=new Map<string,Intl.NumberFormat>()
export function formatPocketFiatValue(value:string|number,currency:string){
 if(!Number.isFinite(Number(value)))return '\u2014'
 let formatter=fiatFormats.get(currency)
 if(!formatter){const digits=new Intl.NumberFormat('en-US',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;formatter=new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});fiatFormats.set(currency,formatter)}
 return formatter.format(Number(value))
}

import type {PocketFxQuote} from './fx-quote.js'

export function cashNotificationBody(credit:string,currency:'USDC'|'NGN'|'UGX'|undefined,quote?:PocketFxQuote,now=Date.now()){
  const fallback='Your cash balance was topped up.'
  const amount=Number(credit)
  if(!Number.isFinite(amount)||amount<=0||!currency)return fallback
  if(currency==='USDC'){
    const text=amount<0.01?'Less than $0.01':amount.toLocaleString('en-US',{style:'currency',currency:'USD'})
    return text+' added to your cash balance.'
  }
  if(!quote||quote.currency!==currency||(quote.asset??'USDC')!=='USDC'||quote.amount!=='1'||quote.side!=='sell'||quote.stale||!(quote.expiresAt>now)||!Number.isFinite(quote.rate)||quote.rate<=0)return fallback
  const local=amount*quote.rate
  if(!Number.isFinite(local))return fallback
  const formatter=new Intl.NumberFormat(currency==='NGN'?'en-NG':'en-UG',{style:'currency',currency,currencyDisplay:'narrowSymbol',maximumFractionDigits:0})
  return (local<1?'Less than '+formatter.format(1):'About '+formatter.format(local))+' added to your cash balance.'
}

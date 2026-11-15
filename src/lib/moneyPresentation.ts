/** Presentation only. Never parse this output into quotes or transaction amounts. */
const fiat = (()=>{try{return (Intl as typeof Intl & {supportedValuesOf:(key:string)=>string[]}).supportedValuesOf('currency')}catch{return ['USD','NGN','UGX','EUR','GBP','KES','GHS','ZAR','CAD','AUD','JPY','CHF']}})()
const codes=[...new Set([...fiat,'USDC','USDT','USDT0','USDe','USDG','EURC','ETH','WETH','BTC','WBTC','SOL','BNB','POL','OKB'])].sort((a,b)=>b.length-a.length).join('|')
const number=String.raw`[+\-\u2212]?(?:<|~)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`
const suffix=new RegExp(String.raw`(?<![\w.])(${number})\s+(${codes})(?!\w)`,'gi')
const prefix=new RegExp(String.raw`(?<![\w.])([+\-\u2212])?(${codes})\s+(${number}|[\u2014\u2013*]+)(?![\w.])`,'gi')
export function currencyFirst(label:string):string {
 return label.replace(new RegExp(String.raw`\u20a6\s*(${number})`,'g'),'NGN $1').replace(suffix,(_,amount:string,code:string)=>code+' '+amount).replace(prefix,(_,sign:string,code:string,amount:string)=>code+' '+(sign||'')+amount)
}
export function moneyParts(label:string):Array<{text:string;currency?:boolean}>{
 const value=currencyFirst(label),pattern=new RegExp(String.raw`(?<![\w.])(${codes})(?=\s+(?:${number}|[\u2014\u2013*]+)(?![\w.]))`,'gi'),parts:Array<{text:string;currency?:boolean}>=[]
 let at=0
 for(const match of value.matchAll(pattern)){if(match.index!>at)parts.push({text:value.slice(at,match.index)});parts.push({text:match[0],currency:true});at=match.index!+match[0].length}
 if(at<value.length)parts.push({text:value.slice(at)})
 return parts
}
export function exactMoney(amount:string,currency:string){
 if(!/^-?\d+(?:\.\d+)?$/.test(amount))return currency+' '+amount
 const [integer,fraction='']=amount.split('.'),decimals=fraction.replace(/0+$/,'').padEnd(2,'0')
 return currency+' '+integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+decimals
}

import type {PocketActivityRow} from '../../src/pocket/models/pocketActivity.js'
export function supportPaymentAmount(row:PocketActivityRow){
 const currency=row.fiatCurrency||(row.amountNgn&&row.source==='bills'?'NGN':undefined)
 const local=Number(row.amountNgn)
 const usdc=Number(row.amount)
 const format=(amount:number)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:6}).format(amount)
 if(currency&&Number.isFinite(local)&&local>0)return (currency==='NGN'?'₦':'UGX ')+format(local)+' · '+(Number.isFinite(usdc)?format(usdc):row.amount)+' USDC'
 return (Number.isFinite(usdc)?format(usdc):row.amount)+' '+(row.assetSymbol||'USDC')
}
export function supportPaymentLabel(row:PocketActivityRow){
 const bank=row.source?.replace(/_/g,'-').startsWith('bank-')
 const kind=bank?'Bank transfer':row.source==='bills'?({airtime:'Airtime',data:'Data',electricity:'Electricity',tv:'TV'}[row.billCategory||'airtime']):row.source==='gift'?'Gift':row.direction==='in'?'Incoming':'Outgoing'
 return kind+' · '+supportPaymentAmount(row)
}
export function supportEvidenceTime(value?:string):number{
 if(!value)return NaN
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))return Date.parse(value)
 const m=value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})\s+(\d{1,2}):(\d{2})\s*(UTC|WAT|EAT)$/i)
 if(!m)return NaN
 const hour=Number(m[4]),minute=Number(m[5]),day=Number(m[1]),month=Number(m[2]),year=Number(m[3])
 const d=new Date(Date.UTC(year,month-1,day,hour,minute))
 if(hour>23||minute>59||d.getUTCDate()!==day||d.getUTCMonth()!==month-1)return NaN
 return d.getTime()-({UTC:0,WAT:1,EAT:3}[m[6].toUpperCase()]||0)*3600000
}

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityStatus } from './pocketReceipt'
import { personalPocketActivity, pocketBankRecipientLabel } from './pocketPurchaseKind'
import { statementPdf } from './pocketStatementPdf'
export type StatementOptions = { title?: string; scope?: string; from?: string; to?: string; includeBusiness?: boolean }
export function statementRows(rows: PocketActivityRow[], options: StatementOptions = {}) {
 if(options.from && options.to && options.from > options.to) throw new Error('Choose an end date on or after the start date.')
 return (options.includeBusiness ? rows : personalPocketActivity(rows)).filter(row=>{
  const date=new Date(row.ts);if(!Number.isFinite(date.getTime()))return false
  const day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')
  return (!options.from||day>=options.from)&&(!options.to||day<=options.to)
 }).sort((a,b)=>b.ts-a.ts)
}
function cell(value:unknown) { const text=String(value??'').replace(/[\r\n]+/g,' ');return '"'+(/^[\s]*[=+@-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"' }
export function pocketStatementCsv(input:PocketActivityRow[],options:StatementOptions={}) {
 const rows=statementRows(input,options)
 return '\uFEFF'+[
 [options.title||'Pocket transaction statement'],['Scope',options.scope||'Pocket personal activity'],
 ['Period (local dates)',options.from||'Earliest available',options.to||'Latest available'],
 ['Coverage','Available recorded activity only. Not a certified account balance statement.'],
 ['Generated at (UTC)',new Date().toISOString()],[],
 ['Date (UTC)','Description','Direction','Status','Token amount','Asset','Local amount','Local currency','Network','Reference','Transaction hash'],
 ...rows.map(row=>[new Date(row.ts).toISOString(),(options.title==='Collection statement'?row.payer:undefined)||pocketBankRecipientLabel(row)||row.activityLabel||row.memo||row.payer||'Transaction',row.direction||'',pocketActivityStatus(row),row.amount,row.assetSymbol||'USDC',row.amountNgn||'',row.amountNgn?row.fiatCurrency||'NGN':'',row.chain,row.providerReference||row.eventId,row.txHash])
 ].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
const native=registerPlugin<{saveCsv(o:{name:string;content:string}):Promise<{cancelled?:boolean}>;savePdf(o:{name:string;base64:string}):Promise<{cancelled?:boolean}>}>('PocketStatement')
export async function downloadPocketStatement(input:PocketActivityRow[],format:'csv'|'pdf'='csv',options:StatementOptions={}) {
 const rows=statementRows(input,options),name=`pocket-statement-${options.from||'available'}-${options.to||new Date().toISOString().slice(0,10)}.${format}`
 const content=format==='csv'?pocketStatementCsv(rows,{...options,includeBusiness:true}):''
 const blob=format==='pdf'?await statementPdf(rows,options):new Blob([content],{type:'text/csv;charset=utf-8'})
 if(Capacitor.getPlatform()==='android') {
  const result=format==='csv'?await native.saveCsv({name,content}):await native.savePdf({name,base64:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})})
  if(result?.cancelled)throw new DOMException('Save cancelled','AbortError')
 }else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
}

import {checkoutNetworkNames} from './checkout-receipts.js'
import type {BusinessReport} from './receipt-business-report.js'
import {receiptPresentationEmail,receiptPresentationPdf,type ReceiptPresentation} from './receipt-presentation.js'
import {receiptMoney} from '../src/lib/receiptIdentity.js'
const date=(r:BusinessReport,time:number)=>new Intl.DateTimeFormat('en-GB',{timeZone:r.timeZone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(time)
const title=(r:BusinessReport)=>(r.frequency==='weekly'?'Weekly':'Daily')+' activity summary'
export function businessSummaryPresentation(r:BusinessReport):ReceiptPresentation{
 return {brandName:r.name,logoUrl:r.brandImageUrl,title:title(r),headline:r.audience==='seller'?'Your marketplace earnings':r.name+' activity',date:date(r,r.from)+' to '+date(r,r.to),sections:[...(['period','current'] as const).flatMap(section=>{const metrics=r.metrics.filter(m=>m.section===section);return metrics.length?[{title:section==='period'?'Period activity':'Current balances at '+date(r,r.generatedAt),rows:metrics.map(m=>[m.label,receiptMoney(m.amount,m.asset)+' ('+(checkoutNetworkNames[m.network.toLowerCase()]||m.network)+')'] as [string,string])}]:[]}),{title:'Report details',rows:[['Reporting timezone',r.timeZone],...(r.sellerId?[['Seller reference',r.sellerId] as [string,string]]:[]),['Pending or review operations',String(r.pendingOperations)]]}],url:r.audience==='seller'?'https://app.hashpaylink.com/home/activity':'https://developer.hashpaylink.com/?project='+encodeURIComponent(r.projectId)+'&environment=live',linkLabel:'View your activity',note:'Your PDF summary is attached. Individual payment, funding, refund and withdrawal receipts remain in your activity.'}
}
export function businessSummaryEmail(r:BusinessReport){return {subject:r.name+' - '+title(r),...receiptPresentationEmail(businessSummaryPresentation(r)),context:'business activity summary',fromName:r.name+' via Hash PayLink'}}
export function businessSummaryPdf(r:BusinessReport):Promise<Buffer>{return receiptPresentationPdf(businessSummaryPresentation(r))}

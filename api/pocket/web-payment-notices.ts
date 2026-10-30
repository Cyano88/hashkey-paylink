import {readStockCheckoutBranding} from '../hosted-stock-checkouts.js'
import {readDurableJson} from '../render-durable-store.js'
import type {StockNotice} from './xstocks-notifications-store.js'
import type {XPayPayment} from '../../src/pocket/lib/pocketXPay.js'
type Payment=XPayPayment&{owner:string;merchantOwner:string}
export function withWebPaymentDetails(notices:StockNotice[],owner:string,payments:Payment[]):StockNotice[]{
 return notices.map(n=>{
  const t=n.transfer
  if(n.owner!==owner||!t||!n.hash)return n
  const p=payments.find(p=>p.status==='paid'&&/^chkx_[a-f0-9]{24}$/.test(p.merchantId)&&p.hash?.toLowerCase()===n.hash!.toLowerCase()&&p.token.toLowerCase()===t.token.toLowerCase()&&p.payer.toLowerCase()===t.from.toLowerCase()&&p.recipient.toLowerCase()===t.to.toLowerCase()&&p.amount===t.amount&&(t.direction==='out'?p.owner===owner:p.merchantOwner===owner))
  return p?{...n,webPayment:{merchantId:p.merchantId,merchantName:p.merchantName,merchantImageUrl:p.merchantImageUrl,receiptId:p.id},title:'Web payment '+(t.direction==='in'?'received':'sent')}:n
 })
}
export async function enrichWebPaymentNotices(notices:StockNotice[],owner:string){
 if(!notices.some(n=>n.transfer&&n.hash))return notices
 const store=await readDurableJson<{payments:Record<string,Payment>}>('hashpaylink:pocket-xpay:v1')
 const matched=withWebPaymentDetails(notices,owner,Object.values(store?.payments||{}))
 const brands=await readStockCheckoutBranding(matched.flatMap(n=>n.webPayment?[n.webPayment.merchantId]:[]))
 return matched.map(n=>n.webPayment?{...n,webPayment:{...n.webPayment,...brands[n.webPayment.merchantId]}}:n)
}

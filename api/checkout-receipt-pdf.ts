import {createHash} from 'node:crypto'
import {readDurableJson} from './render-durable-store.js'
import {readReceiptCheckout,readCheckoutReceipt,checkoutBillingReceipt} from './checkout-receipts.js'
import {readDeveloperReceiptSettings} from './developer-receipt-settings.js'
import {billingReceiptPdf} from './billing-document.js'

type ReceiptFiles={jobs:Record<string,{input:{attachments?:Array<{content_type?:string;content:string}>}}>}
const defaults={readReceipt:readCheckoutReceipt,readFiles:()=>readDurableJson<ReceiptFiles>('hashpaylink:checkout-receipt-emails:v1'),readCheckout:readReceiptCheckout,readSettings:readDeveloperReceiptSettings,render:billingReceiptPdf}
/** The existing public receipt identifier grants access to the same document, never email metadata. */
export async function downloadCheckoutReceiptPdf(id:string,d=defaults):Promise<Buffer|undefined>{
 if(!/^[a-zA-Z0-9_.-]{8,1024}$/.test(id))return
 const receipt=await d.readReceipt(id)
 if(!receipt||receipt.status!=='confirmed')return
 const key=createHash('sha256').update(receipt.receiptId).digest('hex')
 const file=(await d.readFiles())?.jobs?.[key]?.input.attachments?.find(a=>a.content_type==='application/pdf')
 if(file)return Buffer.from(file.content,'base64')
 const checkout=receipt.merchantId?await d.readCheckout(receipt.merchantId):undefined
 const settings=checkout?await d.readSettings(checkout.partnerId):undefined
 return d.render(checkoutBillingReceipt(receipt,checkout?.partnerId,settings))
}

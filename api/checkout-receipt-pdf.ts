import {createHash} from 'node:crypto'
import {readDurableJson} from './render-durable-store.js'
import {readStockCheckout,readStockCheckoutReceipt} from './hosted-stock-checkouts.js'
import {readDeveloperReceiptSettings} from './developer-receipt-settings.js'
import {billingReceiptPdf} from './billing-document.js'

type ReceiptFiles={jobs:Record<string,{input:{attachments?:Array<{content_type?:string;content:string}>}}>}
const defaults={readReceipt:readStockCheckoutReceipt,readFiles:()=>readDurableJson<ReceiptFiles>('hashpaylink:checkout-receipt-emails:v1'),readCheckout:readStockCheckout,readSettings:readDeveloperReceiptSettings,render:billingReceiptPdf}
/** The existing public receipt identifier grants access to the same document, never email metadata. */
export async function downloadCheckoutReceiptPdf(id:string,d=defaults):Promise<Buffer|undefined>{
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))return
 const receipt=await d.readReceipt(id)
 if(!receipt||receipt.status!=='confirmed')return
 const key=createHash('sha256').update(id).digest('hex')
 const file=(await d.readFiles())?.jobs?.[key]?.input.attachments?.find(a=>a.content_type==='application/pdf')
 if(file)return Buffer.from(file.content,'base64')
 const checkout=receipt.merchantId?await d.readCheckout(receipt.merchantId,true):undefined
 const settings=checkout?await d.readSettings(checkout.partnerId):undefined
 return d.render({id:receipt.receiptId,merchant:receipt.recipient||receipt.brandName||'Merchant',merchantLogoUrl:receipt.brandImageUrl,description:receipt.memo,amount:receipt.amount,asset:receipt.asset,network:'X Layer',paidAt:new Date(receipt.createdAt).toISOString(),timeZone:settings?.timeZone||'UTC',paymentMethod:'wallet',receiptUrl:'https://app.hashpaylink.com/receipt/'+encodeURIComponent(id)})
}

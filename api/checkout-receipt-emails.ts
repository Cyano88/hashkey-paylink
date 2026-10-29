import{readDeveloperReceiptSettings}from'./developer-receipt-settings.js'
import {createHash,randomUUID} from 'node:crypto'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {readStockCheckout,readStockCheckoutReceipt} from './hosted-stock-checkouts.js'
import {billingReceiptPdf,receiptEmail,type BillingReceipt} from './billing-document.js'
import {sendTransactionalEmail,type SendEmailInput} from './email-provider.js'
const KEY='hashpaylink:checkout-receipt-emails:v1'
type Job={id:string;input:SendEmailInput;state:'pending'|'sent'|'review'|'canceled';projectId?:string;createdAt:number;attempts:number;nextAt:number;firstAttemptAt?:number;lease?:string;leaseUntil?:number;providerId?:string}
type Store={jobs:Record<string,Job>}
const normalized=(s?:Store):Store=>({jobs:s?.jobs||{}})
const defaults={enabled:()=>process.env.CHECKOUT_RECEIPT_EMAIL_ENABLED==='true'&&hasRenderDurableStore(),from:()=>process.env.RECEIPT_FROM_EMAIL||process.env.ALERT_FROM_EMAIL||'',now:Date.now,read:async()=>normalized(await readDurableJson<Store>(KEY)),mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(KEY,s=>fn(normalized(s))),send:sendTransactionalEmail,canSend:async(projectId:string)=>Boolean(await readDeveloperReceiptSettings(projectId))}
export async function queueCheckoutReceiptEmail(to:string,receipt:BillingReceipt,d=defaults){
 if(!d.enabled()||!d.from())return
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||/\r|\n/.test(to)||to.length>254)throw Error('Verified purchaser email required.')
 const id=createHash('sha256').update(receipt.id).digest('hex')
 if((await d.read()).jobs[id])return
 const pdf=await billingReceiptPdf(receipt),copy=receiptEmail(receipt)
 const input:SendEmailInput={to,fromEmail:d.from(),fromName:receipt.merchant+' via Hash PayLink',...(receipt.supportEmail?{replyTo:receipt.supportEmail}:{}),...copy,context:'checkout receipt',idempotencyKey:'checkout-receipt/'+id,attachments:[{filename:'Receipt-'+receipt.id+'.pdf',content:pdf.toString('base64'),content_type:'application/pdf'}]}
 await d.mutate(s=>{s.jobs[id]??={id,projectId:receipt.projectId,input,state:'pending',createdAt:d.now(),attempts:0,nextAt:d.now()};return s})
}
export async function drainCheckoutReceiptEmails(d=defaults){
 if(!d.enabled())return
 for(const item of Object.values((await d.read()).jobs).filter(j=>j.state==='pending'&&j.nextAt<=d.now()).slice(0,10)){
  const lease=randomUUID();let claimed:Job|undefined
  await d.mutate(s=>{const j=s.jobs[item.id];if(!j||j.state!=='pending'||j.nextAt>d.now()||(j.leaseUntil||0)>d.now())return s
   // Resend keeps idempotency for 24h. Never replay an uncertain request beyond that window.
   if(j.firstAttemptAt!==undefined&&d.now()-j.firstAttemptAt>20*60*60_000){j.state='review';return s}
   j.firstAttemptAt??=d.now();j.lease=lease;j.leaseUntil=d.now()+60_000;j.attempts++;claimed=structuredClone(j);return s})
  if(!claimed)continue
  if(claimed.projectId&&d.canSend&&!await d.canSend(claimed.projectId)){await d.mutate(s=>{const j=s.jobs[item.id];if(j.lease===lease){j.state='canceled';j.leaseUntil=0}return s});continue}
  try{const providerId=await d.send(claimed.input);await d.mutate(s=>{const j=s.jobs[item.id];if(j.lease===lease){j.state='sent';j.providerId=providerId;j.leaseUntil=0}return s})}
  catch{await d.mutate(s=>{const j=s.jobs[item.id];if(j.lease===lease){j.leaseUntil=0;j.nextAt=d.now()+Math.min(60*60_000,30_000*2**Math.min(j.attempts,7));if(j.attempts>=12)j.state='review'}return s})}
 }
}
/** Reads server-owned payment identity; public checkout input cannot choose the recipient. */
export async function reconcileCheckoutReceiptEmails(){
 if(!defaults.enabled())return
 const store=await readDurableJson<{payments:Record<string,{id:string;status:string;merchantId:string;payer:string;createdAt:number;receiptEmail?:string}>}>('hashpaylink:pocket-xpay:v1')
 const queued = (await defaults.read()).jobs;let prepared=0
 for(const p of Object.values(store?.payments||{}).filter(p=>p.status==='paid'&&p.receiptEmail&&/^chkx_[a-f0-9]{24}$/.test(p.merchantId)).sort((a,b)=>a.createdAt-b.createdAt)){
  if(queued[createHash('sha256').update(p.id).digest('hex')])continue
  if(prepared>=50)break
  try{
  const checkout=await readStockCheckout(p.merchantId,true);if(!checkout)continue
  const settings=await readDeveloperReceiptSettings(checkout.partnerId)
  if(!settings||p.createdAt<Date.parse(settings.enabledAt!))continue
  const r=await readStockCheckoutReceipt(p.id)
  if(!r||r.payer.toLowerCase()!==p.payer.toLowerCase())continue
  await queueCheckoutReceiptEmail(p.receiptEmail!,{id:r.receiptId,projectId:checkout.partnerId,merchant:r.recipient||'Merchant',merchantLogoUrl:r.brandImageUrl,supportEmail:settings.supportEmail,timeZone:settings.timeZone,description:r.memo,amount:r.amount,asset:r.asset,network:'X Layer',paidAt:new Date(r.createdAt).toISOString(),paymentMethod:'wallet',receiptUrl:'https://app.hashpaylink.com/receipt/'+encodeURIComponent(r.receiptId)});prepared++
  }catch{console.warn('[receipt-email] receipt preparation deferred')}
 }
 await drainCheckoutReceiptEmails()
}

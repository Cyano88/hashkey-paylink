import{receiptBrandImage}from'./receipt-brand-image.js'
import PDFDocument from 'pdfkit'
import {createRequire} from 'node:module'
import {formatPocketDisplayAmount} from '../src/pocket/lib/pocketMoney.js'
export type BillingReceipt={id:string;projectId?:string;merchant:string;merchantLogoUrl?:string;supportEmail?:string;timeZone?:string;description:string;amount:string;asset:string;network:string;paidAt:string;paymentMethod:'wallet';receiptUrl:string}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export const receiptAmount=(r:BillingReceipt)=>formatPocketDisplayAmount(r.amount)+' '+r.asset
export const receiptPdfUrl=(id:string)=>'https://app.hashpaylink.com/api/receipt?id='+encodeURIComponent(id)+'&format=pdf'
export function receiptPaidDate(r:BillingReceipt){
 return new Intl.DateTimeFormat('en-GB',{timeZone:r.timeZone||'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(r.paidAt))
}
export function receiptEmail(r:BillingReceipt){
 const amount=receiptAmount(r),date=receiptPaidDate(r)
 const prefix=r.merchant+' order ',reference=r.description.startsWith(prefix)?r.description.slice(prefix.length):''
 const order=/^[a-z0-9-]{1,64}$/i.test(reference)?'Order #'+reference.toUpperCase():''
 const support=r.supportEmail&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(r.supportEmail)?r.supportEmail:''
 const logo=r.merchantLogoUrl&&/^https:\/\//i.test(r.merchantLogoUrl)
 const header=logo?`<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr><td bgcolor="#faf8f2" style="padding:10px 14px;border-radius:10px;background:#faf8f2"><img src="${escape(r.merchantLogoUrl!)}" alt="${escape(r.merchant)}" width="160" style="display:block;max-width:100%;height:auto;border:0"></td></tr></table>`:`<p style="margin:0 0 18px;font-size:20px;font-weight:700">${escape(r.merchant)}</p>`
 const supportHtml=support?`<p style="margin:22px 12px 0;text-align:center;font-size:13px;line-height:1.7;color:#667085">Questions? Contact <a href="mailto:${escape(support)}" style="color:inherit;font-weight:600;text-decoration:none">${escape(support)}</a>.</p>`:''
 const downloadUrl=receiptPdfUrl(r.id)
 const text=`Receipt from ${r.merchant}\n${amount} paid on ${date}\n${order||r.description}\nPayment method: Wallet payment\nNetwork: ${r.network}\nReceipt reference: ${r.id}\nDownload receipt: ${downloadUrl}\nYour PDF receipt is attached.${support?'\nMerchant support: '+support:''}\nPowered by Hash PayLink`
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17181c"><main style="max-width:520px;margin:0 auto;padding:24px 16px">
${header}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:18px"><tr><td style="padding:24px">
<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#667085">Receipt from ${escape(r.merchant)}</p>
<h1 style="margin:0 0 10px;font-size:32px;line-height:1.2;letter-spacing:-0.5px">${escape(amount)}</h1>
<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#667085">Paid on ${escape(date)}</p>
<p style="margin:0 0 14px;font-size:16px;font-weight:700;line-height:1.5">${escape(order||r.description)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;line-height:1.6"><tr><td style="padding:4px 12px 4px 0;color:#667085">Payment method</td><td align="right" style="padding:4px 0">Wallet payment</td></tr><tr><td style="padding:4px 12px 4px 0;color:#667085">Network</td><td align="right" style="padding:4px 0">${escape(r.network)}</td></tr></table>
<div style="border-top:1px solid #e5e7eb;margin-top:20px;padding-top:14px"><p style="margin:0 0 5px;font-size:11px;color:#667085">Receipt reference</p><p style="margin:0;font-family:monospace;font-size:10px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;color:#667085">${escape(r.id)}</p></div>
</td></tr><tr><td style="border-top:1px solid #e5e7eb;padding:14px 24px;text-align:center"><a href="${escape(downloadUrl)}" style="display:inline-block;padding:10px 12px;color:#667085;text-decoration:none;font-size:14px;line-height:20px;font-weight:600"><span aria-hidden="true" style="margin-right:8px">&#8595;</span>Download receipt</a></td></tr></table>${supportHtml}<p style="margin:22px 0 0;color:#8a8f98;text-align:center;font-size:13px;line-height:20px">Powered by <strong style="font-weight:700;letter-spacing:-0.2px">Hash PayLink</strong></p></main></body></html>`
 return {subject:`Receipt from ${r.merchant}`,text,html}
}

export async function billingReceiptPdf(r:BillingReceipt):Promise<Buffer>{
 const require=createRequire(import.meta.url),font=require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')
 const logo=await receiptBrandImage(r.merchantLogoUrl)
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'LETTER',margin:48,info:{Title:'Receipt from '+r.merchant,CreationDate:new Date(r.paidAt),ModDate:new Date(r.paidAt)}}),chunks:Buffer[]=[]
  doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)))
  doc.font(font);let hasLogo=false
  if(logo)try{doc.image(logo,52,46,{fit:[180,44],valign:'center'});hasLogo=true}catch{}
  if(!hasLogo)doc.fillColor('#17181c').fontSize(20).text(r.merchant,52,52,{width:330,height:55})
  doc.roundedRect(438,54,108,26,13).fill('#f3f4f6');doc.fillColor('#374151').fontSize(8).text('WEB PAYMENT',448,62,{width:88,align:'center'})
  doc.roundedRect(235,125,142,40,20).fill('#f3f4f6');doc.fillColor('#16803d').fontSize(15).text('Successful',235,136,{width:142,align:'center'})
  doc.fillColor('#667085').fontSize(11).text(receiptPaidDate(r),52,179,{width:508,align:'center'})
  doc.fillColor('#17181c').fontSize(34).text(receiptAmount(r),52,215,{width:508})
  doc.moveTo(52,278).lineTo(560,278).strokeColor('#e5e7eb').stroke()
  let y=308
  for(const[label,value]of[['Merchant',r.merchant],['Type','Wallet payment'],['Network',r.network],['Description',r.description]]){
   doc.fillColor('#667085').fontSize(10).text(label.toUpperCase(),52,y,{width:150});doc.fillColor('#17181c').fontSize(11).text(value,230,y,{width:330,align:'right'});y+=Math.max(42,doc.heightOfString(value,{width:330})+18)
  }
  doc.moveTo(52,y).lineTo(560,y).strokeColor('#e5e7eb').stroke();y+=20
  doc.fillColor('#667085').fontSize(10).text('RECEIPT REFERENCE',52,y,{width:160});doc.fillColor('#374151').fontSize(9).text(r.id,220,y,{width:340,align:'right'})
  doc.fillColor('#667085').fontSize(10).text('Powered by Hash PayLink',52,728,{width:508,align:'center'});doc.end()
 })
}

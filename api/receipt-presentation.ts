import {currencyFirst,moneyParts} from '../src/lib/moneyPresentation.js'
import {paymentTagline as receiptTagline} from '../src/lib/brandCopy.js'
import PDFDocument from 'pdfkit'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {receiptBrandImage} from './receipt-brand-image.js'
import {receiptIconPaths,type ReceiptIconKind} from '../src/lib/receiptIdentity.js'

export type ReceiptSection={title?:string;rows:Array<readonly [string,string]>}
export type ReceiptPresentation={brandName:string;logoUrl?:string;icon?:ReceiptIconKind;title:string;headline:string;amount?:string;amountLabel?:string;date?:string;sections:ReceiptSection[];reference?:string;url?:string;linkLabel?:string;supportEmail?:string;note?:string}
export {receiptTagline}
export const receiptFallbackLogo='https://app.hashpaylink.com/hash-logo-transparent.png'
const esc=(s:string)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const moneyHtml=(value:string)=>moneyParts(value).map(p=>p.currency?'<span style="font-family:inherit;font-size:.85em;font-weight:500">'+esc(p.text)+'</span>':esc(p.text)).join('')
const moneyView=(r:ReceiptPresentation):ReceiptPresentation=>({...r,amount:r.amount?currencyFirst(r.amount):undefined,sections:r.sections.map(s=>({...s,rows:s.rows.map(([k,v])=>[k,currencyFirst(v)] as const)}))})
const https=(s?:string)=>{try{const u=new URL(s||'');return u.protocol==='https:'&&!u.username&&!u.password?u.toString():undefined}catch{return}}
const support=(s?:string)=>s&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)?s:undefined
export function receiptPresentationEmail(r:ReceiptPresentation){
 r=moneyView(r)
 const logo=https(r.logoUrl),url=https(r.url),email=support(r.supportEmail)
 const text=[r.brandName,r.title,r.headline,r.amountLabel,r.amount,r.date,...r.sections.flatMap(s=>[s.title,...s.rows.map(([k,v])=>k+': '+v)]),r.reference?'Receipt reference: '+r.reference:undefined,url?(r.linkLabel||'View receipt')+': '+url:undefined,r.note||'Your PDF receipt is attached.',email?'Support: '+email:undefined,'Powered by Hash PayLink',receiptTagline].filter(Boolean).join('\n')
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;color:#17212b;font-family:Arial,sans-serif;font-variant-numeric:tabular-nums"><main style="max-width:560px;margin:0 auto;padding:28px 16px;box-sizing:border-box"><div data-receipt-content style="background:#ffffff;border:1px solid #e6e9ed;border-radius:16px;overflow:hidden"><header style="padding:28px 24px;text-align:center;background:#f8fafb"><img src="${esc(logo||receiptFallbackLogo)}" alt="${esc(logo?r.brandName:'Hash PayLink')}" width="${logo?'144':'40'}" style="max-width:144px;max-height:48px;width:auto;height:auto;display:inline-block;border:0"><p style="font-size:12px;color:#667085;margin:18px 0 12px">${r.icon?`<img src="https://app.hashpaylink.com/brand/receipt-${r.icon}.png" alt="" width="20" height="20" style="vertical-align:middle;margin-right:7px;border:0">`:""}${esc(r.title)}</p><h1 style="margin:0;font-size:20px;font-weight:500;line-height:1.5;overflow-wrap:anywhere">${esc(r.headline)}</h1>${r.amountLabel?`<p style="font-size:12px;color:#667085;margin:16px 0 0">${esc(r.amountLabel)}</p>`:''}${r.amount?`<p data-receipt-amount style="margin:16px 0 0;font-size:32px;line-height:1.25;font-weight:700;overflow-wrap:anywhere">${moneyHtml(r.amount)}</p>`:''}${r.date?`<p style="margin:14px 0 0;color:#667085;font-size:12px;line-height:1.6">${esc(r.date)}</p>`:''}</header><div style="padding:8px 24px 24px">${r.sections.map(s=>`${s.title?`<h2 style="font-size:14px;margin:24px 0 10px">${esc(s.title)}</h2>`:''}<table aria-label="${esc(s.title||'Transaction details')}" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;font-size:13px;line-height:1.6">${s.rows.map(([k,v])=>`<tr><td style="width:38%;padding:12px 12px 12px 0;border-bottom:1px solid #edf0f2;color:#667085;vertical-align:top;overflow-wrap:anywhere">${esc(k)}</td><td style="padding:12px 0;border-bottom:1px solid #edf0f2;text-align:right;vertical-align:top;overflow-wrap:anywhere;word-break:break-word">${moneyHtml(v)}</td></tr>`).join('')}</table>`).join('')}${r.reference?`<div style="padding-top:20px"><p style="font-size:11px;color:#667085;margin:0 0 6px">Receipt reference</p><p style="font-family:monospace;font-size:10px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;color:#667085;margin:0">${esc(r.reference)}</p></div>`:''}${url?`<p style="text-align:center;margin:24px 0 16px"><a href="${esc(url)}" style="display:inline-block;border-radius:8px;padding:12px 24px;background:#17212b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${esc(r.linkLabel||'View receipt')}</a></p>`:''}<p style="font-size:12px;color:#667085;line-height:1.6;text-align:center;margin:18px 0 0">${esc(r.note||'Your PDF receipt is attached.')}</p>${email?`<p style="font-size:12px;text-align:center;margin:16px 0 0"><a href="mailto:${esc(email)}" style="color:#475467">Contact ${esc(r.brandName)}</a></p>`:''}</div></div><footer data-receipt-powered-by style="padding:24px 8px;text-align:center;color:#667085;font-size:12px;line-height:1.8">Powered by <strong>Hash PayLink</strong><br>${receiptTagline}</footer></main></body></html>`
 return {html,text}
}
export async function receiptPresentationPdf(r:ReceiptPresentation):Promise<Buffer>{
 r=moneyView(r)
 const font=createRequire(import.meta.url).resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')
 const merchantLogo=await receiptBrandImage(https(r.logoUrl))
 const fallback=await readFile(new URL('../public/hash-logo-transparent.png',import.meta.url)).catch(()=>undefined)
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:r.title}}),chunks:Buffer[]=[]
  doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);doc.font(font)
  let shown=false
  for(const logo of [merchantLogo,fallback]){if(!logo)continue;try{doc.image(logo,48,44,{fit:[150,44]});shown=true;break}catch{}}
  if(!shown)doc.fontSize(16).text('Hash PayLink',48,48)
  const drawMoney=(value:string,x:number,y:number,width:number,size:number,align:'left'|'right'='left')=>{
   const parts=moneyParts(value);if(!parts.some(p=>p.currency))return false
   let used=0;for(const p of parts){doc.fontSize((p.currency?Math.max(9,size*.72):size));used+=doc.widthOfString(p.text)}
   if(used>width)return false
   let at=align==='right'?x+width-used:x
   for(const p of parts){const n=(p.currency?Math.max(9,size*.72):size);doc.fontSize(n).text(p.text,at,y+(size-n)*.8,{lineBreak:false});at+=doc.widthOfString(p.text)}
   doc.fontSize(size);return true
  }
  let y=100
  const text=(value:string,size:number,color='#17212b')=>{doc.fontSize(size).fillColor(color);const h=doc.heightOfString(value,{width:499});if(!drawMoney(value,48,y,499,size))doc.text(value,48,y,{width:499});y+=h+10}
  const room=(height:number)=>{if(y+height>745){doc.addPage();y=52}}
  if(r.icon){doc.save().translate(523,y-2).scale(.8).path(receiptIconPaths[r.icon]);if(r.icon==='wallet')doc.fill('#475467');else doc.lineWidth(1.5).stroke('#475467');doc.restore()}
  text(r.title,11,'#667085');text(r.headline,20);if(r.amountLabel)text(r.amountLabel,10,'#667085');if(r.amount)text(r.amount,32);if(r.date)text(r.date,10,'#667085');y+=8
  for(const section of r.sections){
   if(section.title){room(65);text(section.title,12)}
   for(const[label,value]of section.rows){
    doc.fontSize(10);const height=Math.max(doc.heightOfString(label,{width:180}),doc.heightOfString(value,{width:295}))+18;room(height)
    doc.fillColor('#667085').text(label,48,y,{width:180});doc.fillColor('#17212b');if(!drawMoney(value,252,y,295,10,'right'))doc.text(value,252,y,{width:295,align:'right'});y+=height
    doc.moveTo(48,y-10).lineTo(547,y-10).strokeColor('#edf0f2').stroke()
   }
  }
  if(r.reference){doc.fontSize(9);room(doc.heightOfString(r.reference,{width:499})+45);y+=12;text('Receipt reference',9,'#667085');text(r.reference,9,'#475467')}
  const email=support(r.supportEmail);if(email){room(50);text('Support: '+email,10,'#667085')}
  const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.fontSize(9).fillColor('#667085').text('Powered by Hash PayLink',48,781,{width:499,align:'center',lineBreak:false});doc.fontSize(8).text(receiptTagline,48,797,{width:499,align:'center',lineBreak:false})}
  doc.end()
 })
}

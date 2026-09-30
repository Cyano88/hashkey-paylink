import type { PocketActivityRow } from '../models/pocketActivity'
import type { StatementOptions } from './pocketStatement'
import { pocketActivityStatus } from './pocketReceipt'
import { pocketBankRecipientLabel } from './pocketPurchaseKind'
import { drawPocketMark } from '../../lib/paymentReceiptPdf'
export async function statementPdf(rows:PocketActivityRow[],options:StatementOptions={}) {
 await document.fonts.ready
 const images:string[]=[],pages=Math.max(1,Math.ceil(rows.length/7)),font=getComputedStyle(document.body).fontFamily
 for(let page=0;page<pages;page++) {
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF could not be prepared.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754)
  const line=(text:string,x:number,y:number,size=22,bold=false,width=1100)=>{ctx.fillStyle='#111';ctx.font=`${bold?700:400} ${size}px ${font}`;let value=text;while(ctx.measureText(value).width>width&&value.length>1)value=value.slice(0,-2);ctx.fillText(value===text?value:value+'...',x,y)}
  drawPocketMark(ctx,70,75,64);line('Pocket',152,122,36,true)
  ctx.textAlign='right';line('Transaction statement',1170,109,30,true,650);line('By Hash PayLink',1170,145,19,false,600);ctx.textAlign='left'
  line(options.title||'Pocket activity',70,235,28,true)
  line((options.from||'Earliest available')+' / '+(options.to||'Latest available')+' / Local dates',70,277,20)
  ctx.fillStyle='#f5f5f5';ctx.fillRect(70,309,1100,119)
  line(options.scope||'Personal transactions',94,348,22,true,1050)
  line(rows.length+' records / Generated '+new Date().toISOString().slice(0,10)+' UTC',94,386,19)
  rows.slice(page*7,page*7+7).forEach((row,index)=>{
   const y=480+index*148
   const description=(options.title==='Collection statement'?row.payer:undefined)||pocketBankRecipientLabel(row)||row.activityLabel||row.memo||row.payer||'Transaction'
   line(description,70,y,23,true,750)
   ctx.textAlign='right';line(row.amount+' '+(row.assetSymbol||'USDC'),1170,y,23,true,320);ctx.textAlign='left'
   line(new Date(row.ts).toISOString().replace('T',' ').slice(0,19)+' UTC / '+(row.direction==='in'?'Incoming':row.direction==='out'?'Outgoing':'Transfer'),70,y+32,18)
   ctx.textAlign='right';line(pocketActivityStatus(row),1170,y+32,18,false,310);ctx.textAlign='left'
   line((row.amountNgn?(row.fiatCurrency||'NGN')+' '+row.amountNgn+' / ':'')+row.chain+' / '+(row.providerReference||row.eventId),70,y+62,18)
   line(row.txHash||'No confirmed transaction hash',70,y+91,16)
   ctx.strokeStyle='#ececec';ctx.beginPath();ctx.moveTo(70,y+112);ctx.lineTo(1170,y+112);ctx.stroke()
  })
  if(!rows.length)line('No transactions in this date range.',70,490)
  line('Available recorded activity. Only successful records confirm completion.',70,1580,18)
  line('This export is not a certified account balance statement.',70,1610,18)
  line('pocket.hashpaylink.com',70,1690,18)
  ctx.textAlign='right';line(`Page ${page+1} of ${pages}`,1170,1690,18,false,300);ctx.textAlign='left'
  images.push(canvas.toDataURL('image/jpeg',0.92).split(',')[1])
 }
 const enc=new TextEncoder(),chunks:Uint8Array[]=[],offsets=[0];let size=0
 const append=(v:string|Uint8Array)=>{const bytes=typeof v==='string'?enc.encode(v):v;chunks.push(bytes);size+=bytes.length}
 const obj=(id:number,body:string|(()=>void))=>{offsets[id]=size;append(`${id} 0 obj\n`);typeof body==='string'?append(body):body();append('\nendobj\n')}
 append('%PDF-1.4\n')
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>')
 obj(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`)
 images.forEach((base64,i)=>{
  const id=3+i*3,bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0))
  obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`)
  obj(id+1,()=>{append(`<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);append(bytes);append('\nendstream')})
  const commands='q 595 0 0 842 0 0 cm /Im Do Q'
  obj(id+2,`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`)
 })
 const xref=size;append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
 offsets.slice(1).forEach(offset=>append(String(offset).padStart(10,'0')+' 00000 n \n'))
 append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
 return new Blob(chunks as BlobPart[],{type:'application/pdf'})
}
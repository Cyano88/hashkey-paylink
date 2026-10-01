import type { PocketActivityRow } from '../models/pocketActivity'
import type { StatementOptions } from './pocketStatement'
import { statementDate, statementDescription, statementStatus, statementSignedAmount, statementLocalAmount } from './pocketStatementPresentation'
import { drawPocketMark } from '../../lib/paymentReceiptPdf'
export async function statementPdf(rows:PocketActivityRow[],options:StatementOptions={}) {
 await document.fonts.ready
 const images:string[]=[],perPage=8,pages=Math.max(1,Math.ceil(rows.length/perPage)),font=getComputedStyle(document.body).fontFamily
 await Promise.all([400,600].map(weight=>document.fonts.load(`${weight} 23px ${font}`, 'Pocket \u20a6 USh + -')))
 for(let page=0;page<pages;page++) {
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF could not be prepared.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754)
  const line=(text:string,x:number,y:number,size=22,bold=false,width=1100,muted=false)=>{ctx.fillStyle=muted?'#666':'#111';ctx.font=`${bold?600:400} ${size}px ${font}`;let value=text;while(ctx.measureText(value+(value===text?'':'...')).width>width&&value.length>1)value=value.slice(0,-1);ctx.fillText(value===text?value:value+'...',x,y)}
  drawPocketMark(ctx,70,70,60);line('Pocket',148,114,34,true)
  ctx.textAlign='right';line(options.title||'Pocket statement',1170,111,27,true,640);ctx.textAlign='left'
  line(options.scope||'All activity',70,220,28,true)
  line((options.from?statementDate(options.from):'First available')+' to '+(options.to?statementDate(options.to):'Latest available'),70,263,21,false,1100,true)
  line(rows.length+' transactions',70,310,19,false,500,true)
  ctx.textAlign='right';line('Generated '+statementDate(Date.now()),1170,310,19,false,500,true);ctx.textAlign='left'
  ctx.fillStyle='#f5f5f5';ctx.fillRect(70,352,1100,54)
  line('Date',88,386,19,true,170);line('Details',280,386,19,true,540);ctx.textAlign='right';line('Amount',1152,386,19,true,290);ctx.textAlign='left'
  rows.slice(page*perPage,page*perPage+perPage).forEach((row,index)=>{
   const y=454+index*132
   line(statementDate(row.ts),88,y,20,false,170,true)
   const description=statementDescription(row,options.title==='Collection statement'),words=description.split(/\s+/),lines:string[]=[]
   ctx.font=`600 23px ${font}`;let part=''
   for(const word of words){const next=part?part+' '+word:word;if(part&&ctx.measureText(next).width>540){lines.push(part);part=word}else part=next}if(part)lines.push(part)
   line(lines[0]||'',280,y,23,true,540)
   if(lines.length>1)line(lines.slice(1).join(' '),280,y+28,23,true,540)
   line(statementStatus(row),280,y+(lines.length>1?58:35),19,false,540,true)
   ctx.textAlign='right';ctx.fillStyle='#111';ctx.font=`600 23px ${font}`;ctx.fillText(statementSignedAmount(row)+' '+(row.assetSymbol||'USDC'),1152,y,290)
   const local=statementLocalAmount(row);if(local)line(local,1152,y+35,19,false,290,true)
   ctx.textAlign='left';ctx.strokeStyle='#ececec';ctx.beginPath();ctx.moveTo(70,y+88);ctx.lineTo(1170,y+88);ctx.stroke()
  })
  if(!rows.length)line('No transactions in this date range.',70,490)
  line('Available activity. Pending and failed entries do not confirm payment.',70,1607,17,false,1100,true)
  line('pocket.hashpaylink.com',70,1680,18,false,750,true)
  ctx.textAlign='right';line(`Page ${page+1} of ${pages}`,1170,1680,18,false,300,true);ctx.textAlign='left'
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
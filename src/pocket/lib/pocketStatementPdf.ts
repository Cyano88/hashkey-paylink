import { pocketActivityReference } from './pocketReceipt'
import type { PocketActivityRow } from '../models/pocketActivity'
import type { StatementOptions } from './pocketStatement'
import { statementDate, statementDescription, statementStatus, statementSignedAmount, statementLocalAmount, statementTotals } from './pocketStatementPresentation'
import { drawPocketMark } from '../../lib/paymentReceiptPdf'
export async function statementPdf(rows:PocketActivityRow[],options:StatementOptions={}) {
 await document.fonts.ready
 const images:string[]=[],perPage=12,pages=Math.max(1,Math.ceil(rows.length/perPage)),font=getComputedStyle(document.body).fontFamily
 await Promise.all([400,600].map(weight=>document.fonts.load(`${weight} 23px ${font}`, 'Pocket \u20a6 USh + -')))
 const totals=statementTotals(rows)
 for(let page=0;page<pages;page++) {
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF could not be prepared.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754)
  const line=(text:string,x:number,y:number,size=22,bold=false,width=1100,muted=false)=>{ctx.fillStyle=muted?'#666':'#111';ctx.font=`${bold?600:400} ${size}px ${font}`;let value=text;while(ctx.measureText(value+(value===text?'':'...')).width>width&&value.length>1)value=value.slice(0,-1);ctx.fillText(value===text?value:value+'...',x,y)}
  drawPocketMark(ctx,70,70,60);line('Pocket',148,114,34,true)
  ctx.textAlign='right';line(options.title||'Pocket statement',1170,111,27,true,640);ctx.textAlign='left'

  line(options.accountName || 'Pocket account',70,194,25,true,620)
  if(options.pocketId)line('@'+options.pocketId.replace(/^@/,''),70,227,20,false,620,true)
  line(options.scope||'All activity',70,277,21,true,620)
  line((options.from?statementDate(options.from):'First available')+' to '+(options.to?statementDate(options.to):'Latest available'),70,310,19,false,620,true)
  ctx.fillStyle='#f6f6f6';ctx.fillRect(760,164,410,166)
  line('Confirmed USDC',782,193,18,true,360)
  line('Money in',782,231,18,false,140,true);line('Money out',782,267,18,false,140,true)
  ctx.textAlign='right';line('+'+totals.incoming,1148,231,19,true,210);line('-'+totals.outgoing,1148,267,19,true,210)
  line(rows.length+' records',1148,306,17,false,360,true);ctx.textAlign='left'
  ctx.fillStyle='#f2f2f2';ctx.fillRect(70,362,1100,46)
  line('Date',82,392,18,true,120);line('Description',218,392,18,true,300);line('Reference',544,392,18,true,260);line('Status',822,392,18,true,140);ctx.textAlign='right';line('Amount',1158,392,18,true,190);ctx.textAlign='left'
  // Wrap references in full so they remain usable for reconciliation and support.
  const wrap=(text:string,x:number,y:number,width:number,size:number,maxLines:number,bold=false)=>{
   ctx.font=`${bold?600:400} ${size}px ${font}`
   const lines:string[]=[];let part=''
   for(const char of text){if(part&&ctx.measureText(part+char).width>width){lines.push(part);part=char}else part+=char}if(part)lines.push(part)
   if(lines.length>maxLines){const smaller=Math.max(10,size-1);if(smaller<size){wrap(text,x,y,width,smaller,maxLines,bold);return}}
   lines.forEach((value,i)=>line(value,x,y+i*(size+4),size,bold,width))
  }
  rows.slice(page*perPage,page*perPage+perPage).forEach((row,index)=>{
   const y=443+index*91
   line(statementDate(row.ts),82,y,18,false,124,true)
   wrap(statementDescription(row,options.title==='Collection statement'),218,y,304,18,3,true)
   wrap(pocketActivityReference(row),544,y,254,15,4)
   wrap(statementStatus(row),822,y,136,16,3)
   ctx.textAlign='right';ctx.fillStyle='#111';ctx.font=`600 18px ${font}`;ctx.fillText(statementSignedAmount(row),1158,y,180)
   line(row.assetSymbol||'USDC',1158,y+23,15,false,180,true)
   const local=statementLocalAmount(row);if(local)line(local,1158,y+46,16,false,180,true)
   ctx.textAlign='left';ctx.strokeStyle='#ececec';ctx.beginPath();ctx.moveTo(70,y+68);ctx.lineTo(1170,y+68);ctx.stroke()
  })
  if(!rows.length)line('No transactions in this date range.',70,490)
  line('Available activity. Pending and failed entries do not confirm payment.',70,1607,17,false,1100,true)
  line('pocket.hashpaylink.com ? Generated '+statementDate(Date.now()),70,1680,18,false,750,true)
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
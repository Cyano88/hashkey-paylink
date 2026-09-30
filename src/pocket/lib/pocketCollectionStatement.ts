import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityStatus } from './pocketReceipt'

export type CollectionRecord = {eventId:string; title:string; kind:'bank'|'usdc'; paymentUrl:string; createdAt:number; updatedAt:number; deletedAt?:number}
export function collectionPayments(collection:CollectionRecord, rows:PocketActivityRow[]) {
 return rows.filter(row=>collection.kind==='bank' ? row.merchantId===collection.eventId || row.eventId==='ngpos-'+collection.eventId : row.eventId===collection.eventId).sort((a,b)=>b.ts-a.ts)
}
function cell(value:unknown) {
 const text=String(value??'').replace(/[\r\n]+/g,' ')
 return '"'+(/^[\s]*[=+@-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"'
}
export function collectionStatementCsv(collection:CollectionRecord, input:PocketActivityRow[]) {
 const rows=collectionPayments(collection,input)
 return '\uFEFF'+[
 ['Pocket collection statement'],['Collection',collection.title],['Collection ID',collection.eventId],['Generated at (UTC)',new Date().toISOString()],
 ['Date (UTC)','Payer','Status','USDC amount','Local amount','Currency','Network','Reference','Transaction hash'],
 ...rows.map(r=>[new Date(r.ts).toISOString(),r.payer,pocketActivityStatus(r),r.amount,r.amountNgn||'',r.amountNgn?r.fiatCurrency||'NGN':'',r.chain,r.providerReference||r.eventId,r.txHash]),
 ].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
const native=registerPlugin<{saveCsv(o:{name:string;content:string}):Promise<{cancelled?:boolean}>;savePdf(o:{name:string;base64:string}):Promise<{cancelled?:boolean}>}>('PocketStatement')
function saveBrowser(blob:Blob,name:string) {
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
// Rasterize text with Pocket's font to preserve international names in downloaded PDFs.
async function collectionPdf(collection:CollectionRecord,input:PocketActivityRow[]) {
 await document.fonts.ready
 const rows=collectionPayments(collection,input),images:string[]=[]
 const pages=Math.max(1,Math.ceil(rows.length/8))
 const font=getComputedStyle(document.body).fontFamily
 for(let page=0;page<pages;page++) {
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF could not be prepared.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.fillStyle='#111'
  const line=(value:string,x:number,y:number,size=24,bold=false)=>{ctx.font=`${bold?700:400} ${size}px ${font}`;ctx.fillText(value,x,y,1100)}
  line('Pocket',70,85,38,true);line('Collection statement',70,143,30,true)
  line(collection.title,70,193,26);line(collection.eventId,70,232,18)
  line('Generated '+new Date().toISOString().slice(0,10)+' (UTC)',70,273,18)
  rows.slice(page*8,page*8+8).forEach((r,index)=>{
   const y=335+index*160
   line(new Date(r.ts).toISOString().replace('T',' ').slice(0,19)+' UTC',70,y,20)
   line(pocketActivityStatus(r),880,y,20,true)
   line(r.payer||'Payer',70,y+32,22,true)
   line(r.amount+' USDC'+(r.amountNgn?' / '+r.amountNgn+' '+(r.fiatCurrency||'NGN'):''),70,y+64,24,true)
   line(r.chain+' / '+(r.providerReference||r.eventId),70,y+95,17)
   line(r.txHash||'No confirmed transaction hash',70,y+122,16)
   ctx.strokeStyle='#eee';ctx.beginPath();ctx.moveTo(70,y+140);ctx.lineTo(1170,y+140);ctx.stroke()
  })
  if(!rows.length)line('No payments recorded.',70,360)
  line(`Page ${page+1} of ${pages} / ${rows.length} records`,70,1680,18)
  images.push(canvas.toDataURL('image/jpeg',0.9).split(',')[1])
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
export async function downloadCollectionStatement(collection:CollectionRecord,rows:PocketActivityRow[],format:'csv'|'pdf') {
 const name=`pocket-statement-${new Date().toISOString().slice(0,10)}.${format}`
 if(format==='csv') {
  const content=collectionStatementCsv(collection,rows)
  if(Capacitor.getPlatform()==='android'){const result=await native.saveCsv({name,content});if(result?.cancelled)throw new DOMException('Save cancelled','AbortError')}
  else saveBrowser(new Blob([content],{type:'text/csv;charset=utf-8'}),name)
 } else {
  const blob=await collectionPdf(collection,rows)
  if(Capacitor.getPlatform()==='android') {
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})
   const result=await native.savePdf({name,base64});if(result?.cancelled)throw new DOMException('Save cancelled','AbortError')
  } else saveBrowser(blob,name)
 }
}

import PDFDocument from 'pdfkit'
import type {BusinessReport} from './receipt-business-report.js'
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const date=(r:BusinessReport,time:number)=>new Intl.DateTimeFormat('en-GB',{timeZone:r.timeZone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(time)
const title=(r:BusinessReport)=>(r.frequency==='weekly'?'Weekly':'Daily')+' sales summary'
export function businessSummaryEmail(r:BusinessReport){
 const heading=title(r),period=date(r,r.from)+' to '+date(r,r.to),snapshot=date(r,r.generatedAt)
 const url=r.audience==='seller'?'https://app.hashpaylink.com/home/activity':'https://developer.hashpaylink.com/?project='+encodeURIComponent(r.projectId)+'&environment=live'
 const label=(section:'period'|'current')=>section==='period'?'Period activity':'Current balances at '+snapshot
 const rows=(section:'period'|'current')=>r.metrics.filter(m=>m.section===section)
 const text=[r.name,heading,period,'Reporting timezone: '+r.timeZone,...(r.sellerId?['Seller reference: '+r.sellerId]:[]),...(['period','current'] as const).flatMap(section=>[label(section),...rows(section).map(m=>`${m.label}: ${m.amount} ${m.asset} (${m.network})`)]),'Pending or review operations: '+r.pendingOperations,'View your activity: '+url,'Individual payment, refund and withdrawal receipts remain available in your activity.','Powered by Hash PayLink'].join('\n')
 const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17181c;background:#f4f5f7"><main style="max-width:600px;margin:auto;padding:24px;background:white"><p>Hash PayLink</p><h1>${esc(heading)}</h1><h2>${esc(r.name)}</h2><p>${esc(period)}<br>Reporting timezone: ${esc(r.timeZone)}</p>${r.sellerId?'<p>Seller reference: '+esc(r.sellerId)+'</p>':''}${(['period','current'] as const).map(section=>`<h3>${esc(label(section))}</h3><table style="width:100%;font-size:14px">${rows(section).map(m=>`<tr><td style="padding:8px 8px 8px 0;vertical-align:top">${esc(m.label)}</td><td style="padding:8px;text-align:right;overflow-wrap:anywhere">${esc(m.amount+' '+m.asset+' ('+m.network+')')}</td></tr>`).join('')}</table>`).join('')}<p>Pending or review operations: ${r.pendingOperations}</p><p><a href="${esc(url)}">View your activity</a></p><p style="font-size:12px;color:#667085">Individual payment, refund and withdrawal receipts remain available in your activity. Your PDF summary is attached.</p></main></body></html>`
 return {subject:r.name+' - '+heading,html,text,context:'business sales summary',fromName:'Hash PayLink'}
}
export function businessSummaryPdf(r:BusinessReport):Promise<Buffer>{return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:title(r),CreationDate:new Date(r.generatedAt)}}),chunks:Buffer[]=[]
 doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)
 doc.fontSize(14).text('Hash PayLink').moveDown().fontSize(24).text(title(r)).fontSize(16).text(r.name).moveDown()
 doc.fontSize(10).text(date(r,r.from)+' to '+date(r,r.to)).text('Reporting timezone: '+r.timeZone)
 if(r.sellerId)doc.text('Seller reference: '+r.sellerId)
 for(const section of ['period','current'] as const){
  const rows=r.metrics.filter(m=>m.section===section)
  if(doc.y+(section==='current'?rows.length*26+115:65)>doc.page.height-55)doc.addPage()
  doc.moveDown().fontSize(12).fillColor('#17181c').text(section==='period'?'Period activity':'Current balances at '+date(r,r.generatedAt),48,doc.y,{width:499}).moveDown(.5)
  for(const row of r.metrics.filter(m=>m.section===section)){
   const value=row.amount+' '+row.asset+' ('+row.network+')';doc.fontSize(10)
   const height=Math.max(doc.heightOfString(row.label,{width:270}),doc.heightOfString(value,{width:210}))+10
   if(doc.y+height>doc.page.height-65)doc.addPage()
   const y=doc.y;doc.fillColor('#475467').text(row.label,48,y,{width:270});doc.fillColor('#17181c').text(value,328,y,{width:210,align:'right'});doc.y=y+height
  }
 }
 if(doc.y>doc.page.height-115)doc.addPage();doc.moveDown().fontSize(10).text('Pending or review operations: '+r.pendingOperations,48,doc.y,{width:499}).moveDown().fontSize(9).fillColor('#667085').text('Individual payment, refund and withdrawal receipts remain available in your activity.')
 const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.fontSize(9).text('Hash PayLink | '+(i+1)+' / '+pages.count,48,doc.page.height-40,{lineBreak:false})}
 doc.end()
})}

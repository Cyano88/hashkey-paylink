import PDFDocument from 'pdfkit'
import type {MarketplaceSettlementReceipt} from './settlement-receipts.js'
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function marketplaceReceiptDetails(r:MarketplaceSettlementReceipt){
 return [...(r.marketplaceName?[['Marketplace',r.marketplaceName]]:[]),['Status','Completed'],['Amount received',r.amount+' '+(r.currency??'USDC')],...(r.kind==='payout'?[...(r.settlement==='bank'?[['Provider fee',(r.providerFee??'0')+' USDC'],['Network fee',r.networkFee+' USDC']]:[['Withdrawal fee',r.networkFee+' USDC']]),['Total balance debit',r.debitAmount+' USDC']]:[['Fee deducted from refund','0 USDC'],['Refund gas payer','Marketplace refund fee balance']]),['Network','Base'],[r.settlement==='bank'?'Bank account':'Recipient wallet',r.recipient],['Date',new Date(r.settledAt).toISOString()],['Transaction',r.transactionHash],['Receipt reference',r.id]]
}
export function marketplaceReceiptEmail(r:MarketplaceSettlementReceipt){
 const title=r.kind==='refund'?'Marketplace refund receipt':'Marketplace payout receipt',details=marketplaceReceiptDetails(r),url='https://basescan.org/tx/'+r.transactionHash
 return {subject:(r.marketplaceName?r.marketplaceName+' - '+(r.kind==='refund'?'Refund receipt':'Payout receipt'):title)+' - '+r.amount+' '+(r.currency??'USDC'),text:title+'\n\n'+details.map(([k,v])=>k+': '+v).join('\n')+'\n\nView transaction: '+url+'\nYour PDF receipt is attached.\n\nHash PayLink',html:'<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17181c"><main style="max-width:560px;margin:auto;padding:24px"><p>Hash PayLink</p><h1>'+esc(title)+'</h1><h2>'+esc(r.amount)+' '+(r.currency??'USDC')+' received</h2><table style="width:100%;font-size:14px">'+details.map(([k,v])=>'<tr><td style="padding:8px;vertical-align:top">'+esc(k)+'</td><td style="padding:8px;overflow-wrap:anywhere">'+esc(v)+'</td></tr>').join('')+'</table><p><a href="'+url+'">View transaction</a></p><p>Your PDF receipt is attached.</p></main></body></html>'}
}
export function marketplaceReceiptPdf(r:MarketplaceSettlementReceipt):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:48}),chunks:Buffer[]=[]
  doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)
  doc.fontSize(16).text('Hash PayLink').moveDown().fontSize(24).text(r.kind==='refund'?'Marketplace refund':'Marketplace payout').moveDown().fontSize(30).text(r.amount+' '+(r.currency??'USDC')).fontSize(12).text('Received successfully').moveDown(2)
  for(const[label,value]of marketplaceReceiptDetails(r)){doc.fontSize(9).fillColor('#667085').text(label.toUpperCase()).moveDown(0.25);doc.fontSize(11).fillColor('#17181c').text(value,{width:490}).moveDown(0.8)}
  doc.end()
 })
}

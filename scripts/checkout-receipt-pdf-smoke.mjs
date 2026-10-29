import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {downloadCheckoutReceiptPdf} from '../api/checkout-receipt-pdf.ts'
import {receiptEmail,receiptPdfUrl} from '../api/billing-document.ts'
const id='fixture-receipt-123',pdf=Buffer.from('%PDF-1.4 frozen document'),key=createHash('sha256').update(id).digest('hex')
let renderCount=0,stored=true
const d={readReceipt:async value=>value===id?{receiptId:id,status:'confirmed',merchantId:'checkout',recipient:'Lunchroom',memo:'Lunchroom order 123',amount:'1.50',asset:'USDT',createdAt:Date.parse('2026-10-29T10:37:00Z')}:undefined,readFiles:async()=>stored?{jobs:{[key]:{input:{attachments:[{content_type:'application/pdf',content:pdf.toString('base64')}]}}}}:undefined,readCheckout:async()=>({partnerId:'project'}),readSettings:async()=>({timeZone:'Africa/Lagos'}),render:async receipt=>{renderCount++;assert.equal(receipt.timeZone,'Africa/Lagos');assert.equal(receipt.amount,'1.50');return pdf}}
assert.deepEqual(await downloadCheckoutReceiptPdf(id,d),pdf);assert.equal(renderCount,0)
assert.equal(await downloadCheckoutReceiptPdf('missing-receipt',d),undefined)
assert.equal(await downloadCheckoutReceiptPdf('../bad\r\nfilename',d),undefined)
stored=false;assert.deepEqual(await downloadCheckoutReceiptPdf(id,d),pdf);assert.equal(renderCount,1)
const email=receiptEmail({id,merchant:'Lunchroom',description:'Lunchroom order 123',amount:'1.5',asset:'USDT',network:'X Layer',paidAt:'2026-10-29T10:37:00Z',paymentMethod:'wallet',receiptUrl:'https://app.hashpaylink.com/receipt/'+id,supportEmail:'support@example.test'})
assert.equal((email.html.match(/Download receipt/g)||[]).length,1)
assert(!/View receipt|Download invoice|>Back</.test(email.html));assert(email.text.includes(receiptPdfUrl(id)))
assert(email.html.indexOf('Download receipt')<email.html.indexOf('Questions?'))
assert(email.html.includes('Powered by <strong'));assert(!email.html.includes('background:#111827'))
console.log('PASS direct PDF: frozen attachment reuse, canonical receipt requirement, safe filename, legacy generation, one download CTA, support placement and weighted footer.')

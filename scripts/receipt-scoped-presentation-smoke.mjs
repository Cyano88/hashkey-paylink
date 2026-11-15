import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {receiptEmail,billingReceiptPdf,billingReceiptPresentation} from '../api/billing-document.ts'
import {businessReceiptReport} from '../api/receipt-business-report.ts'
import {businessSummaryEmail,businessSummaryPdf} from '../api/receipt-business-summary-document.ts'
import {marketplaceReceiptEmail,marketplaceReceiptPdf} from '../api/marketplace/receipt-document.ts'
import {checkoutReceipt} from '../api/checkout-receipts.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {receiptIconKind,receiptMoney} from '../src/lib/receiptIdentity.ts'
const tx='0x'+'a'.repeat(64),wallet='0x'+'1'.repeat(40)
const payer={id:'chk_receipt_visual_fixture',merchant:'Example Market',description:'Example Market order 123456',amount:'1.500004',asset:'USDC',network:'Base',paidAt:'2026-11-15T10:30:00Z',timeZone:'Africa/Lagos',paymentMethod:'wallet',receiptUrl:'https://app.hashpaylink.com/receipt/fixture'}
const funding={id:'funding_fixture',partnerId:'project',checkoutId:'chk_funding_fixture',targetWallet:wallet,depositAddress:wallet,amount:'1.500004',observation:{status:'funded',bridgeStatus:'complete',network:'base',paymentTransaction:tx,bridgeTransaction:tx,observedAt:payer.paidAt}}
const checkout={id:funding.checkoutId,partnerId:'project',merchantName:'Example Market',title:'Account funding',amount:funding.amount,asset:'USDC',network:'base',recipient:wallet,createdAt:payer.paidAt,providerFunding:{requestId:funding.id,targetWallet:wallet,depositAddress:wallet},payment:{status:'paid',txHash:tx,payer:wallet,amount:funding.amount,confirmedAt:payer.paidAt}}
assert.equal(paymentReceiptView({...checkoutReceipt({...checkout,providerFunding:undefined}),amount:'1.500004'}).amount,'USDC 1.500004')
assert.equal(checkoutReceipt(checkout).status,'pending')
assert.equal(checkoutReceipt(checkout,funding).status,'confirmed')
for(const patch of [{partnerId:'other'},{checkoutId:'other'},{amount:'2'},{targetWallet:'0x'+'2'.repeat(40)},{observation:{...funding.observation,bridgeStatus:'pending'}},{observation:{...funding.observation,paymentTransaction:'0x'+'b'.repeat(64)}}])assert.equal(checkoutReceipt(checkout,{...funding,...patch}).status,'pending')
assert.notEqual(checkoutReceipt({...checkout,payment:{...checkout.payment,status:'processing'}},funding).status,'confirmed')
const reportInput={projectId:'project',name:'Example Market',audience:'operator',from:1000,to:2000,generatedAt:3000,timeZone:'Africa/Lagos',frequency:'weekly',checkouts:[],fundings:[{record:funding,recordedAt:1500},{record:funding,recordedAt:1500},{record:{...funding,id:'foreign',partnerId:'other'},recordedAt:1500}]}
const report=businessReceiptReport(reportInput)
assert.equal(report.activityCount,1);assert.equal(report.metrics[0].amount,'1.500004');assert.equal(report.metrics[0].label,'Account funding processed (not sales)')
assert.equal(businessReceiptReport({...reportInput,audience:'seller',sellerId:'seller'}).activityCount,0)
assert.equal(businessReceiptReport({...reportInput,from:2000,to:2500}).activityCount,0)
assert.throws(()=>businessReceiptReport({...reportInput,fundings:[{record:{...funding,observation:{...funding.observation,bridgeTransaction:'invalid'}},recordedAt:1500}]}),/requires review/)
for(const currency of ['NGN','UGX','KES','GHS']){const html=receiptEmail({...payer,pricing:{amount:'2103.26',currency,rate:'1402.17',paymentAsset:'USDC'},settlement:{amount:'1999',currency}}).html;assert(html.includes(currency));assert(!html.includes('1999'));assert(!html.includes('Merchant settlement'))}
assert.equal(receiptMoney('999999999999999.000001','USDC'),'USDC 999,999,999,999,999.000001')
assert.equal(receiptIconKind({source:'hosted_checkout',paymentMethod:'wallet',settlementType:'instant_fiat'}),'wallet')
assert.equal(receiptIconKind({source:'marketplace-refund'}),'refund');assert.equal(receiptIconKind({source:'marketplace-bank'}),'bank_transfer')
assert.equal(billingReceiptPresentation({...payer,purpose:'funding'}).amountLabel,'Amount paid')
const withdrawal={id:'withdrawal_visual_fixture',kind:'payout',settlement:'bank',marketplaceName:'Example Market',allocationRole:'seller',amount:'1433.19',currency:'NGN',debitAmount:'1.05',commission:'0.003070',providerFee:'0.020000',networkFee:'0.003610',recipient:'Example Bank **** 9696',settledAt:Date.parse(payer.paidAt),transactionHash:tx}
const summary={...report,from:Date.parse('2026-11-08T23:00:00Z'),to:Date.parse('2026-11-15T23:00:00Z'),generatedAt:Date.parse('2026-11-15T23:05:00Z'),metrics:[...report.metrics,{section:'period',label:'Local settlement received',amount:'20000',asset:'NGN',network:'Base'},{section:'current',label:'Available platform earnings',amount:'0.03',asset:'USDC',network:'Base'}]}
const cases=[['payer',receiptEmail(payer),()=>billingReceiptPdf(payer)],['funding',receiptEmail({...payer,purpose:'funding',fundingAccount:wallet}),()=>billingReceiptPdf({...payer,purpose:'funding',fundingAccount:wallet})],['seller-withdrawal',marketplaceReceiptEmail(withdrawal),()=>marketplaceReceiptPdf(withdrawal)],['weekly-summary',businessSummaryEmail(summary),()=>businessSummaryPdf(summary)]]
await mkdir('output/receipt-preview',{recursive:true})
for(const[name,email,pdf]of cases){assert(email.html.includes('Global payments with stablecoins.'));await writeFile('output/receipt-preview/'+name+'.html',email.html);const buffer=await pdf();assert(buffer.subarray(0,4).equals(Buffer.from('%PDF')));await writeFile('output/receipt-preview/'+name+'.pdf',buffer)}
console.log('PASS funding delivery binding, role isolation, period boundaries, exact amounts, future currency rendering, icon parity and four HTML/PDF fixtures. No emails sent.')

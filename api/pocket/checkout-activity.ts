import {merchantFeeTotal} from '../../src/lib/merchantPaymentFees.js'
import type {PocketActivityRow} from '../../src/pocket/models/pocketActivity.js'
import {checkoutReceipt,type ReceiptCheckout} from '../checkout-receipts.js'
import {readPaidHostedCheckoutActivity} from '../hosted-checkouts.js'
import {readPaidStockCheckoutActivity} from '../hosted-stock-checkouts.js'
import {readPaidBscCheckoutActivity} from '../hosted-bsc-checkouts.js'

export function checkoutActivityRows(record:ReceiptCheckout,wallets:string[]):PocketActivityRow[]{
 const r=checkoutReceipt(record);if(!r||!record.payment)return []
 const owns=(address:string)=>wallets.some(w=>r.chain==='solana'?w===address:w.toLowerCase()===address.toLowerCase())
 const directions:('out'|'in')[]=[]
 if(owns(r.payer))directions.push('out')
 if(!('settlement' in record&&record.settlement)&&owns(r.destination||''))directions.push('in')
 const fees='fees' in record.payment?record.payment.fees:undefined
 const decimals='token' in record?record.token.decimals:6
 return directions.map(direction=>({eventId:'checkout:'+record.id+':'+direction,txHash:r.txHash,chain:r.chain,payer:r.payer,memo:r.memo,amount:direction==='in'&&fees?fees.netAmount:r.amount,...(fees?{merchantFees:fees,merchantNetAmount:fees.netAmount,feeAmount:direction==='in'?merchantFeeTotal(fees,decimals):'0',feeAsset:r.asset}:{}),assetSymbol:r.asset,ts:r.createdAt,source:'hosted_checkout',settlementType:'hosted_checkout',merchantId:record.id,merchantName:record.merchantName,merchantImageUrl:record.brandImageUrl,paymentMethod:'wallet',contextLabel:record.title,activityLabel:'Web payment '+(direction==='out'?'sent':'received'),direction,recipient:record.merchantName,destination:r.destination,receiptId:record.id,receiptUrl:'/receipt/'+record.id,paycrestStatus:r.status,bankSettlementStatus:r.bankSettlementStatus,...(r.amountNgn?{amountNgn:r.amountNgn,fiatCurrency:r.fiatCurrency}:{} )}))
}
export async function readPocketCheckoutActivity(wallets:string[]){
 if(!wallets.length)return []
 const records=await Promise.all([readPaidHostedCheckoutActivity(wallets),readPaidStockCheckoutActivity(wallets),readPaidBscCheckoutActivity(wallets)])
 return records.flat().flatMap(record=>checkoutActivityRows(record,wallets))
}

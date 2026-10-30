import type {PaylinkReceipt} from '../src/lib/paymentReceiptPdf.js'
import {readVerifiedHostedCheckoutRecord, type CheckoutRecord} from './hosted-checkouts.js'
import {isStockCheckoutId, readStockCheckout, readStockCheckoutReceipt, type StockCheckout} from './hosted-stock-checkouts.js'
import {isBscCheckoutId, readBscCheckout, readBscCheckoutByReceipt, type BscCheckout} from './hosted-bsc-checkouts.js'
import {findRegisteredPaymentReceipt} from './event-registry.js'
import type {BillingReceipt} from './billing-document.js'
import type {ReceiptEmailSettings} from '../src/lib/receiptEmailSettings.js'

export type ReceiptCheckout = CheckoutRecord | StockCheckout | BscCheckout
export const checkoutNetworkNames:Record<string,string>={base:'Base',arc:'Arc',arbitrum:'Arbitrum',ethereum:'Ethereum',polygon:'Polygon',solana:'Solana',xlayer:'X Layer',bsc:'BNB Chain'}
export async function readReceiptCheckout(id:string):Promise<ReceiptCheckout|null>{
 if(isStockCheckoutId(id))return readStockCheckout(id,true)
 if(isBscCheckoutId(id))return readBscCheckout(id,true)
 return readVerifiedHostedCheckoutRecord(id,{allowExpiredForReconciliation:true})
}
/** Only integrity-checked server records may enter this adapter. Settlement is not the payer's method. */
export function checkoutReceipt(record:ReceiptCheckout):PaylinkReceipt|undefined{
 const p=record.payment
 if(!p||record.checkoutMode==='agentic')return
 const network=p.network||record.network
 if(!checkoutNetworkNames[network]||!Number.isFinite(Date.parse(p.confirmedAt)))return
 const local='settlement' in record?record.settlement:undefined
 const delivered=!local||('payout' in record&&['validated','settled'].includes(record.payout?.status||''))
 const payoutStatus='payout' in record?record.payout?.status:undefined
 const failed=p.status==='failed'||Boolean(local&&['failed','expired','refunded','refunding','cancelled','canceled'].includes(payoutStatus||''))
 const status=failed?'failed':p.status==='paid'&&delivered?'confirmed':'pending'
 const destination=('paymentOptions' in record?record.paymentOptions?.find(option=>option.network===network)?.recipient:undefined)||record.recipient
 const receiptId='receiptId' in p?p.receiptId:record.id
 return {type:'money_out',receiptId,receiptHash:p.txHash,eventId:record.id,txHash:p.txHash,title:'Web payment',status,chain:network,
  payer:p.payer,memo:record.title,amount:p.amount,asset:record.asset||'USDC',createdAt:Date.parse(p.confirmedAt),paymentMethod:'wallet',
  source:'hosted_checkout',settlementType:'hosted_checkout',merchantId:record.id,recipient:record.merchantName,destination,
  referenceId:receiptId,brandName:record.merchantName,brandImageUrl:record.brandImageUrl,brandKind:'partner',
  ...(local?{amountNgn:local.amountNgn,fiatCurrency:local.mode==='ugx'?'UGX' as const:'NGN' as const,bankSettlementStatus:payoutStatus||'processing'}:{})}
}
const readers={checkout:readReceiptCheckout,stockReceipt:readStockCheckoutReceipt,bscReceipt:readBscCheckoutByReceipt,registered:findRegisteredPaymentReceipt}
export async function readCheckoutReceipt(id:string,d=readers):Promise<PaylinkReceipt|undefined>{
 if(!/^[a-zA-Z0-9_.-]{8,1024}$/.test(id))return
 if(/^chk[xb]?_/.test(id)){const record=await d.checkout(id);return record?checkoutReceipt(record):undefined}
 const stock=await d.stockReceipt(id)
 if(stock?.merchantId){const record=await d.checkout(stock.merchantId);return record?checkoutReceipt(record):undefined}
 const bsc=await d.bscReceipt(id);if(bsc)return checkoutReceipt(bsc)
 const registered=await d.registered(id)
 if(registered?.source!=='hosted-checkout'||!registered.merchantId)return
 const record=await d.checkout(registered.merchantId),receipt=record?checkoutReceipt(record):undefined
 if(!receipt||receipt.chain!==registered.chain||(receipt.chain==='solana'?receipt.txHash!==registered.txHash:receipt.txHash.toLowerCase()!==registered.txHash.toLowerCase()))return
 return receipt
}
export function checkoutBillingReceipt(receipt:PaylinkReceipt,projectId?:string,settings?:ReceiptEmailSettings):BillingReceipt{
 if(receipt.status!=='confirmed')throw Error('A confirmed payment is required for a receipt.')
 const network=checkoutNetworkNames[receipt.chain]
 if(!network)throw Error('Receipt network is unavailable.')
 return {id:receipt.receiptId,projectId,merchant:receipt.recipient||receipt.brandName||'Merchant',merchantLogoUrl:receipt.brandImageUrl,
  description:receipt.memo,amount:receipt.amount,asset:receipt.asset,network,paymentMethod:receipt.paymentMethod||'wallet',paidAt:new Date(receipt.createdAt).toISOString(),
  supportEmail:settings?.supportEmail,timeZone:settings?.timeZone||'UTC',receiptUrl:'https://app.hashpaylink.com/receipt/'+encodeURIComponent(receipt.receiptId),
  ...(receipt.amountNgn&&receipt.fiatCurrency?{settlement:{amount:receipt.amountNgn,currency:receipt.fiatCurrency}}:{})}
}

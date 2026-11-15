import {validatePayerCheckoutFees} from '../src/lib/payerCheckoutFees.js'
import type {PaylinkReceipt} from '../src/lib/paymentReceiptPdf.js'
import {readVerifiedHostedCheckoutRecord, type CheckoutRecord} from './hosted-checkouts.js'
import {isStockCheckoutId, readStockCheckout, readStockCheckoutReceipt, type StockCheckout} from './hosted-stock-checkouts.js'
import {isBscCheckoutId, readBscCheckout, readBscCheckoutByReceipt, type BscCheckout} from './hosted-bsc-checkouts.js'
import {findRegisteredPaymentReceipt} from './event-registry.js'
import type {BillingReceipt} from './billing-document.js'
import type {ReceiptEmailSettings} from '../src/lib/receiptEmailSettings.js'

export type FundingReceiptEvidence={id:string;partnerId:string;checkoutId:string;targetWallet:string;depositAddress:string;amount:string;observation?:{status:string;bridgeStatus:string;paymentTransaction?:string;bridgeTransaction?:string;observedAt:string}}
export type ReceiptCheckout = CheckoutRecord | StockCheckout | BscCheckout
export const checkoutNetworkNames:Record<string,string>={base:'Base',arc:'Arc',arbitrum:'Arbitrum',ethereum:'Ethereum',polygon:'Polygon',solana:'Solana',xlayer:'X Layer',bsc:'BNB Chain'}
export async function readReceiptCheckout(id:string):Promise<ReceiptCheckout|null>{
 if(isStockCheckoutId(id))return readStockCheckout(id,true)
 if(isBscCheckoutId(id))return readBscCheckout(id,true)
 return readVerifiedHostedCheckoutRecord(id,{allowExpiredForReconciliation:true})
}
/** Only integrity-checked server records may enter this adapter. Settlement is not the payer's method. */
export function checkoutReceipt(record:ReceiptCheckout,funding?:FundingReceiptEvidence):PaylinkReceipt|undefined{
 const p=record.payment
 if(!p||record.checkoutMode==='agentic')return
 if('feePayer' in record&&record.feePayer==='payer'&&(!('payerFees' in p)||!p.payerFees))return
 const network=p.network||record.network
 if(!checkoutNetworkNames[network]||!Number.isFinite(Date.parse(p.confirmedAt)))return
 if('providerFunding' in record&&record.providerFunding){
  const route=record.providerFunding,observation=funding?.observation
  const bound=funding?.id===route.requestId&&funding.partnerId===record.partnerId&&funding.checkoutId===record.id&&funding.targetWallet.toLowerCase()===route.targetWallet.toLowerCase()&&funding.depositAddress.toLowerCase()===route.depositAddress.toLowerCase()&&funding.amount===record.amount
  const delivered=p.status==='paid'&&bound&&observation?.status==='funded'&&observation.bridgeStatus==='complete'&&observation.paymentTransaction?.toLowerCase()===p.txHash.toLowerCase()&&/^0x[a-f0-9]{64}$/i.test(observation.bridgeTransaction||'')
  return {type:'money_out',receiptId:record.id,receiptHash:p.txHash,eventId:record.id,txHash:p.txHash,title:'Polymarket funding',status:p.status==='failed'?'failed':delivered?'confirmed':'pending',chain:network,payer:p.payer,memo:record.title,amount:p.amount,asset:record.asset||'USDC',createdAt:Date.parse(p.confirmedAt),paymentMethod:'wallet',source:'polymarket-funding',settlementType:'service_funding',merchantId:record.id,recipient:'Polymarket',destination:route.targetWallet,referenceId:record.id,brandName:record.merchantName,brandImageUrl:record.brandImageUrl,brandKind:'partner',fundingDetails:{account:route.targetWallet,requestId:route.requestId,...(delivered?{deliveryTransaction:observation!.bridgeTransaction}: {})}}
 }
 const local='settlement' in record?record.settlement:undefined
 const delivered=!local||('payout' in record&&['validated','settled'].includes(record.payout?.status||''))
 const payoutStatus='payout' in record?record.payout?.status:undefined
 const failed=p.status==='failed'||Boolean(local&&['failed','expired','refunded','refunding','cancelled','canceled'].includes(payoutStatus||''))
 const status=failed?'failed':p.status==='paid'&&delivered?'confirmed':'pending'
 const destination=('paymentOptions' in record?record.paymentOptions?.find(option=>option.network===network)?.recipient:undefined)||record.recipient
 const receiptId='receiptId' in p?p.receiptId:record.id
 return {...(record.pricing?{pricing:record.pricing}:{}),type:'money_out',receiptId,receiptHash:p.txHash,eventId:record.id,txHash:p.txHash,title:'Web payment',status,chain:network,
  payer:p.payer,memo:record.title,amount:p.amount,asset:record.asset||'USDC',createdAt:Date.parse(p.confirmedAt),paymentMethod:'wallet',
  ...('payerFees' in p&&p.payerFees?{payerFees:validatePayerCheckoutFees(p.amount,p.payerFees)}:{}),
  ...('fees' in p&&p.fees?{merchantFees:p.fees,feeAmount:'0',feeAsset:record.asset||'USDC'}:{}),
  source:'hosted_checkout',settlementType:'hosted_checkout',merchantId:record.id,recipient:record.merchantName,destination,
  referenceId:receiptId,brandName:record.merchantName,brandImageUrl:record.brandImageUrl,brandKind:'partner',
  ...(local?{merchantSettlementAmount:local.netAmountNgn,amountNgn:local.amountNgn,fiatCurrency:local.mode==='ugx'?'UGX' as const:'NGN' as const,bankSettlementStatus:payoutStatus||'processing'}:{})}
}
export async function fundingAwareCheckoutReceipt(record:ReceiptCheckout){
 const funding='providerFunding' in record&&record.providerFunding?await import('./polymarket-funding-checkouts.js').then(m=>m.readVerifiedFundingActivityRecords([record.providerFunding!.requestId],record.partnerId)).then(records=>records.get(record.providerFunding!.requestId)):undefined
 return checkoutReceipt(record,funding)
}
const readers={receipt:fundingAwareCheckoutReceipt,checkout:readReceiptCheckout,stockReceipt:readStockCheckoutReceipt,bscReceipt:readBscCheckoutByReceipt,registered:findRegisteredPaymentReceipt}
async function readCanonicalCheckoutReceipt(id:string,d=readers):Promise<PaylinkReceipt|undefined>{
 if(!/^[a-zA-Z0-9_.-]{8,1024}$/.test(id))return
 const convert=(record:ReceiptCheckout)=>d.receipt?d.receipt(record):checkoutReceipt(record)
 if(/^chk[xb]?_/.test(id)){const record=await d.checkout(id);return record?await convert(record):undefined}
 const stock=await d.stockReceipt(id)
 if(stock?.merchantId){const record=await d.checkout(stock.merchantId);return record?await convert(record):undefined}
 const bsc=await d.bscReceipt(id);if(bsc)return convert(bsc)
 const registered=await d.registered(id)
 if(registered?.source!=='hosted-checkout'||!registered.merchantId)return
 const record=await d.checkout(registered.merchantId),receipt=record?await convert(record):undefined
 if(!receipt||receipt.chain!==registered.chain||(receipt.chain==='solana'?receipt.txHash!==registered.txHash:receipt.txHash.toLowerCase()!==registered.txHash.toLowerCase()))return
 return receipt
}
/** Public/shared receipt belongs to the payer. Business settlement accounting is private. */
export function payerCheckoutReceipt(receipt:PaylinkReceipt):PaylinkReceipt{
 const {merchantFees,merchantSettlementAmount,amountNgn,fiatCurrency,bankSettlementStatus,...payer}=receipt
 return payer
}
export async function readCheckoutReceipt(id:string,d=readers):Promise<PaylinkReceipt|undefined>{
 const receipt=await readCanonicalCheckoutReceipt(id,d)
 return receipt?payerCheckoutReceipt(receipt):undefined
}
export function checkoutBillingReceipt(receipt:PaylinkReceipt,projectId?:string,settings?:ReceiptEmailSettings):BillingReceipt{
 if(receipt.status!=='confirmed')throw Error('A confirmed payment is required for a receipt.')
 const network=checkoutNetworkNames[receipt.chain]
 if(!network)throw Error('Receipt network is unavailable.')
 return {id:receipt.receiptId,projectId,merchant:receipt.brandName||receipt.recipient||'Merchant',merchantLogoUrl:receipt.brandImageUrl,
  ...(receipt.source==='polymarket-funding'?{purpose:'funding' as const,fundingAccount:receipt.fundingDetails?.account}:{}),...(receipt.payerFees?{payerFees:receipt.payerFees}:{}),pricing:receipt.pricing,description:receipt.memo,amount:receipt.amount,asset:receipt.asset,network,paymentMethod:receipt.paymentMethod||'wallet',paidAt:new Date(receipt.createdAt).toISOString(),
  supportEmail:settings?.supportEmail,timeZone:settings?.timeZone||'UTC',receiptUrl:'https://app.hashpaylink.com/receipt/'+encodeURIComponent(receipt.receiptId),
  }
}

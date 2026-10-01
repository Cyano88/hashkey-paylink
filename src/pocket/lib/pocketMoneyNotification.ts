import type { PocketActivityRow } from '../models/pocketActivity'
import { isIncomingPosPayment } from './pocketPurchaseKind'
export type PocketMoneyNotice = { eventId:string; title:string; body:string; path:string; tag:string; occurredAt:number }
const labels:Record<string,string>={base:'Base',arc:'Arc',polygon:'Polygon',arbitrum:'Arbitrum',ethereum:'Ethereum',solana:'Solana'}
const amount=(value:string,currency:string)=>currency==='NGN'?'\u20a6'+Number(value).toLocaleString('en-NG',{maximumFractionDigits:2}):currency==='UGX'?'UGX '+Number(value).toLocaleString('en-UG',{maximumFractionDigits:2}):value+' '+currency
/** Notification truth follows the original purchase, never its funding debit. */
export function pocketMoneyNotification(row:PocketActivityRow):PocketMoneyNotice|null {
 const source=(row.source||'').replace(/_/g,'-'),state=(row.bankSettlementStatus||row.paycrestStatus||'').toLowerCase()
 if(row.fundingOnly||row.fundingParent||source==='request'||source==='collection')return null
 const refunded=['refunded','reversed'].includes(state),refundAvailable=state==='refund available',failed=['failed','rejected','cancelled','canceled','expired','reverted'].includes(state)
 const bank=source==='bank-withdraw',bill=source==='bills',merchant=isIncomingPosPayment(row)||source==='bank-receive',purchase=source==='purchase'||source==='xpay'
 const success=(bank?['settled','completed']:bill?['delivered']:['confirmed','completed','successful','success','settled','paid']).includes(state)
 if(!success&&!refunded&&!refundAvailable&&!failed)return null
 if(!row.txHash)return null
 if(bank&&(!row.amountNgn||!Number.isFinite(Number(row.amountNgn))))return null
 const local=(bank||bill)&&row.amountNgn&&['NGN','UGX'].includes(row.fiatCurrency||'NGN')?amount(row.amountNgn,row.fiatCurrency||'NGN'):amount(row.amount,row.assetSymbol||'USDC')
 const kind=bank?'Bank transfer':bill?({airtime:'Airtime',data:'Data',electricity:'Electricity',tv:'TV'}[row.billCategory||'airtime']):merchant?'XPay payment':purchase?'Payment':source==='wallet-bridge'?'USDC bridged':source==='wallet-swap'?'Swap completed':row.direction==='in'?'USDC received':'USDC sent'
 const target=bank?(row.accountName||row.recipient||'your recipient'):bill?(row.billProvider||row.recipient||''):merchant?(row.activityLabel||row.contextLabel||'your terminal'):purchase?(row.recipient||row.memo||'merchant'):''
 let body=bank?`Your ${local} transfer to ${target}${row.bankName?' at '+row.bankName:''} was successful.`:bill?`${local} ${kind.toLowerCase()} purchase completed${target?' with '+target:''}.`:merchant?`${local} received at ${target}.`:purchase?`${local} paid to ${target}.`:source==='wallet-bridge'?`${row.amount} USDC bridged from ${labels[row.chain]||row.chain} to ${labels[row.destination||'']||row.destination||'your wallet'}.`:source==='wallet-swap'?`Your swap on Arc completed. ${row.contextLabel||''}`:`${local} ${row.direction==='in'?'received':'sent'} on ${labels[row.chain]||row.chain}.`
 if(refunded)body=`Your ${local} ${kind.toLowerCase()} was refunded.`
 else if(refundAvailable)body=`A refund is available for your ${local} ${kind.toLowerCase()}.`
 else if(failed)body=`Your ${local} ${kind.toLowerCase()} was not completed. Open for details.`
 const identity=bank?(row.bankOrderId||row.providerReference||row.eventId):row.eventId
 const tag='pocket-payment:'+source+':'+identity
 const status=refunded?'refunded':refundAvailable?'refund-available':failed?'failed':'completed'
 return {eventId:tag+':'+status,title:refundAvailable?'Refund available':refunded?'Refund completed':failed?kind+' failed':bank?'Bank transfer successful':bill?kind+' purchase successful':kind,body,path:'/activity?receipt='+encodeURIComponent(bank?(row.bankOrderId||row.providerReference||row.eventId):row.eventId),tag,occurredAt:row.statusUpdatedAt||row.ts}
}

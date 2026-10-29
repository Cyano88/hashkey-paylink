import type {XPayPayment} from './pocketXPay'
import type {PocketActivityRow} from '../models/pocketActivity'
export function pocketWebPaymentActivity(p:XPayPayment,address:string):PocketActivityRow|null{
 if(!/^chkx_[a-f0-9]{24}$/.test(p.merchantId))return null
 const outgoing=p.payer.toLowerCase()===address.toLowerCase()
 return {eventId:p.id,receiptId:p.id,merchantId:p.merchantId,txHash:p.hash||'',chain:'xlayer',payer:p.payer,recipient:p.merchantName,destination:p.recipient,memo:'Web payment',activityLabel:'Web payment '+(outgoing?'sent':'received'),amount:p.amount,assetSymbol:p.symbol,ts:p.status==='paid'?p.updatedAt:p.createdAt,source:'hosted_checkout',settlementType:'hosted_checkout',direction:outgoing?'out':'in',paycrestStatus:p.status==='paid'?'successful':p.status==='failed'?'failed':'pending'}
}

import type {PocketActivityRow} from '../models/pocketActivity'
export function bscSwapActivity(p:{id:string;wallet:string;from:string;to:string;amount:string;amountOut?:string;fee?:string;feeAsset?:string;txHash?:string;status:string;createdAt:number;updatedAt?:number}):PocketActivityRow{
 const terminal=['completed','failed','not_submitted'].includes(p.status)
 return {eventId:'pocket-bsc-swap:'+p.id,txHash:p.txHash||'',chain:'bsc',payer:p.wallet,memo:p.from+' to '+p.to,amount:p.amount,assetSymbol:p.from,ts:p.createdAt,statusUpdatedAt:p.updatedAt,source:'wallet-swap',contextLabel:p.amount+' '+p.from+' to '+(p.status==='completed'&&p.amountOut?p.amountOut+' ':'')+p.to,settlementType:'wallet_swap',paycrestStatus:p.status==='not_submitted'?'failed':terminal?p.status:'processing',activityLabel:'Token swap',direction:'out',...(terminal&&p.fee!==undefined?{feeAmount:p.fee,feeAsset:p.feeAsset||p.from}:{})}
}

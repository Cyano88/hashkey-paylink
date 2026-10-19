import type {PocketActivityRow} from '../models/pocketActivity'
export const cashConversionStorageKey=(owner:string)=>'pocket:cash-conversion:'+owner+':base'
export function hasSavedCashConversion(owner:string,storage:Pick<Storage,'getItem'>){
 const raw=storage.getItem(cashConversionStorageKey(owner))
 if(!raw)return false
 const value=JSON.parse(raw)
 if(!value?.quoteToken||!value.quote?.id||value.quote.network!=='base'||value.quote.tokenIn?.symbol!=='USDT'||value.quote.tokenOut?.symbol!=='USDC')throw Error('Cash funding details could not be restored. Check Activity before adding again.')
 return true
}
export const isCashConversion=(row:PocketActivityRow)=>row.source==='wallet-swap'&&row.chain==='base'&&row.assetSymbol==='USDT'&&row.eventId.startsWith('pocket-cash-conversion:')
export const isCashFunding=(row:PocketActivityRow)=>isCashConversion(row)||(row.source==='wallet-bridge'&&row.assetSymbol==='USDC'&&row.destination==='base'&&(row.activityLabel==='Cash funding'||row.bridge?.purpose==='cash'))
export function cashConversionActivity(p:{id:string;wallet:string;amount:string;amountOut?:string;fee?:string;txHash?:string;status:string;createdAt:number;updatedAt?:number}):PocketActivityRow{
 return {eventId:'pocket-cash-conversion:'+p.id,txHash:p.txHash||'',chain:'base',payer:p.wallet,amount:p.amount,assetSymbol:'USDT',feeAmount:['completed','confirmed','successful'].includes(p.status)?p.fee:undefined,feeAsset:'USDC',memo:'USDT to Cash',ts:p.createdAt,statusUpdatedAt:p.updatedAt,source:'wallet-swap',contextLabel:p.amount+' USDT to '+(p.amountOut?p.amountOut+' ':'')+'USDC',settlementType:'wallet_swap',paycrestStatus:['started','submitted'].includes(p.status)?'processing':p.status,activityLabel:'Cash funding',destination:'Cash balance',direction:'out'}
}

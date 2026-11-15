import {currentAllowanceCharge,nextAllowanceReset} from '../../src/lib/allowanceDay.js'
import {checkoutBuyerLedgerKey,CHECKOUT_DAILY_USD,type CheckoutBuyerLedger} from '../checkout-buyer-allowance.js'
import {readDurableJson} from '../render-durable-store.js'
import {getDurablePaycrestPosOrders} from '../paycrest-pos.js'
import {readPocketKycLevel} from './kyc-level.js'

// Read the same reserved ledger used by online and QR execution. Never infer
// available funds from client activity, cancelled dialogs or an uncertain result.
export function purchaseAllowanceUsage(ledger:CheckoutBuyerLedger|undefined,orders:Awaited<ReturnType<typeof getDurablePaycrestPosOrders>>,verified:boolean,now:number){
 const active=(ledger?.charges||[]).filter(c=>currentAllowanceCharge(c,now)&&c.state==='reserved')
 const usedUnits=active.filter(c=>c.provider.startsWith('wallet:')||!orders.some(o=>o.intent_id===c.id&&o.paycrest_order_id===c.provider&&['hosted-checkout','ngpos'].includes(o.source||'')&&o.status.toLowerCase()==='refunded')).reduce((sum,c)=>sum+c.units,0)
 return {limitCurrency:'USD' as const,dailyLimitUsd:CHECKOUT_DAILY_USD,usedUsd:usedUnits/1000000,remainingUsd:verified?Math.max(0,CHECKOUT_DAILY_USD-usedUnits/1000000):0,resetsAt:new Date(nextAllowanceReset(now)).toISOString()}
}
export async function pocketPurchaseAllowance(owner:string){
 const verification=await readPocketKycLevel(owner),ledger=await readDurableJson<CheckoutBuyerLedger>(checkoutBuyerLedgerKey(owner)),now=Date.now()
 const ids=(ledger?.charges||[]).filter(c=>currentAllowanceCharge(c,now)&&c.state==='reserved'&&!c.provider.startsWith('wallet:')).map(c=>c.id)
 const orders=ids.length?await getDurablePaycrestPosOrders(ids):[]
 return {level:verification.level,...purchaseAllowanceUsage(ledger,orders,verification.level!=='none',now)}
}

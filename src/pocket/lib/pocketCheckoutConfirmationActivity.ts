import {isPocketActivityRow} from './pocketSchemas'
import {cacheConfirmedPocketActivity} from './pocketActivityCache'

/** Only canonical, server-confirmed rows for this exact transfer enter the cache. */
export function cacheCheckoutConfirmationActivity(email:string,checkoutId:string,txHash:string,payer:string,value:unknown) {
  if (!email || !payer || !Array.isArray(value)) return false
  const rows=value.filter(isPocketActivityRow).filter(row=>{
    const same=(a:string,b:string)=>row.chain==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
    return row.source==='hosted_checkout' && row.merchantId===checkoutId && row.paycrestStatus==='confirmed'
      && same(row.txHash,txHash) && same(row.payer,payer)
      && (row.direction==='out'||row.direction==='in'&&same(row.destination||'',payer))
  })
  if (!rows.some(row=>row.direction==='out')) return false
  for (const row of rows) cacheConfirmedPocketActivity(email,row)
  return true
}

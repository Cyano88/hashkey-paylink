// Historical storage uses pos_settlement; the supported product is XPay.
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true })
const { reconcilePaycrestOrderPayment } = await import('../api/paycrest-reconcile.ts')
const { paymentExecutionRepository } = await import('../api/pocket/payment-execution-intents.ts')
const { readDurableJson, queryDurablePostgres } = await import('../api/render-durable-store.ts')
const { assertUnusedXPayQuote } = await import('../api/pocket/unused-xpay-quote.ts')
const apply = process.argv.includes('--apply')
const ids = process.argv.slice(2).filter(value => value !== '--apply')
if (!ids.length) throw Error('Pass exact execution IDs; add --apply after reviewing the dry run.')
const results = []
for (const id of ids) {
 const intent = (await paymentExecutionRepository.listUnresolved(1000)).find(row => row.id === id)
 if (!intent) throw Error('Unresolved execution not found: '+id)
 const store = await readDurableJson((process.env.NG_POS_STORE_KEY || 'hashpaylink:ng-pos-merchants').trim())
 const quote = store?.intents?.[intent.resourceId]
 const merchant = store?.merchants?.[quote?.merchant_id]
 const ledger = await queryDurablePostgres('select state,transaction_hash,provider_reference from pocket_money_ledger where execution_id=$1', [id])
 const provider = await reconcilePaycrestOrderPayment(intent.resourceId, { allowTerminalScan: true })
 assertUnusedXPayQuote({intent,quote,merchant,ledger:ledger.rows,order:provider.order,now:Date.now()})
 if (apply) {
  const updated = await paymentExecutionRepository.update({ownerId:intent.ownerId,intentId:id,expectedState:intent.state,state:'failed',failureCode:'XPAY_QUOTE_EXPIRED_NO_ORDER',metadata:{operatorResolution:'expired_unused_xpay_quote',quoteExpiredAt:quote.expires_at}})
  if(updated.failureCode!=='XPAY_QUOTE_EXPIRED_NO_ORDER')throw Error('Execution changed during review; no closure confirmed.')
  results.push({id,state:updated.state,failureCode:updated.failureCode})
 } else results.push({id,eligible:true,quoteExpiredAt:quote.expires_at})
}
console.log(JSON.stringify({apply,results}))
process.exit(0)

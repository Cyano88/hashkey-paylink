import assert from 'node:assert/strict'
import { pocketActivityAmount, currentPocketActivityRow } from '../src/pocket/lib/pocketActivityPresentation.ts'
import { mergePocketActivityRows } from '../src/pocket/lib/pocketActivitySnapshot.ts'
for (const category of ['airtime','data','tv','electricity']) {
 const pending={eventId:'pocket-bill:'+category,chain:'base',source:'bills',direction:'out',txHash:'',amount:'0.147112',amountNgn:'200',ts:1,paycrestStatus:'processing'}
 const delivered={...pending,txHash:'0x'+'1'.repeat(64),providerReference:'provider-'+category,paycrestStatus:'delivered',ts:2}
 assert.equal(pocketActivityAmount(pending),'NGN 200')
 const rows=mergePocketActivityRows([pending],[delivered])
 assert.equal(rows.length,1,'Pending bill must be replaced, not duplicated')
 assert.equal(currentPocketActivityRow(pending,rows)?.paycrestStatus,'delivered')
 assert.equal(rows[0].amount,'0.147112','Preserve exact USDC debit for the receipt')
 assert.equal(currentPocketActivityRow(pending,[{...delivered,eventId:'other'}]),pending,'Do not show another bill')
}
assert.equal(pocketActivityAmount({source:'wallet-withdrawal',amount:'1',amountNgn:''}),'1 USDC')
console.log('PASS: all bill categories keep one record, follow delivery, and consistently display NGN while preserving USDC.')

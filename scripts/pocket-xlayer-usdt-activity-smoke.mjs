import assert from 'node:assert/strict'
import {createPocketActivityHandler} from '../api/pocket/activity.ts'
import {pocketActivityAmount} from '../src/pocket/lib/pocketActivityPresentation.ts'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'

for (const [asset,refundAsset,refundNetwork] of [['USDT','USDC','xlayer'],['USDT','USDT','base'],['USDC','USDC','base']]) {
 const handler=createPocketActivityHandler({
  verifyUser:async()=>({userId:'fixture'}),readHistory:async()=>({payments:[]}),
  readActions:async()=>[{id:'bridge',ownerId:'fixture',idempotencyKey:'pocket:xlayer-bridge:fixture',action:'wallet.xlayer-bridge',status:'completed',createdAt:Date.now(),updatedAt:Date.now(),metadata:{source:'base',destination:'xlayer',amount:'1',assetSymbol:asset,paymentState:'refunded',refundAsset,refundNetwork,refundAmount:'0.98',refundTxHash:'0x'+'b'.repeat(64),txHash:'0x'+'a'.repeat(64)}}],
 })
 const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
 await handler({method:'GET',headers:{},query:{}},res)
 assert.equal(res.statusCode,200)
 const row=res.body.payments.find(row=>row.eventId==='pocket-bridge:bridge')
 assert.ok(row);assert.equal(row.assetSymbol,asset);assert.equal(row.amount,'1')
 assert.equal(row.refundAsset,refundAsset);assert.equal(row.refundNetwork,refundNetwork)
 assert.equal(pocketActivityAmount(row),'0.98 '+refundAsset)
 const notice=pocketMoneyNotification(row)
 assert.equal(notice.title,'Refund completed');assert.ok(notice.body.includes('0.98 '+refundAsset));assert.ok(notice.body.includes(asset+' bridge'))
}
console.log('PASS server Activity preserves original USDT/USDC amounts and projects actual Base/X Layer refunds into receipts and notifications. Synthetic only.')

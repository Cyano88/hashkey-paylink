import assert from 'node:assert/strict'
import {createPocketActivityHandler} from '../api/pocket/activity.ts'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'
const records=[]
for(const [action,source]of [['wallet.bridge','arc'],['wallet.bsc-bridge','bsc'],['wallet.xlayer-bridge','xlayer'],['wallet.usdt-bridge','solana']])for(const asset of action==='wallet.bridge'?['USDC']:['USDC','USDT']){
 if(action==='wallet.usdt-bridge'&&asset==='USDC')continue
 records.push({id:source+asset,ownerId:'owner',idempotencyKey:'pocket:test:'+source+asset,action,status:'completed',createdAt:1,updatedAt:2,metadata:{purpose:'cash',source,destination:'base',assetSymbol:asset,amount:'1',cashReceivedAmount:'0.95',txHash:'0x'+String(records.length+1).padStart(64,'0'),destinationTxHash:'0x'+'b'.repeat(64)}})
}
const handler=createPocketActivityHandler({verifyUser:async()=>({userId:'owner'}),readHistory:async()=>({payments:[]}),readActions:async()=>records})
let response,code=200;const res={status(n){code=n;return this},json(value){response=value;return this}}
await handler({method:'GET',query:{}},res)
assert.equal(code,200);assert.equal(response.payments.length,records.length)
for(const row of response.payments){assert.equal(row.cashFunding,true);const notice=pocketMoneyNotification(row);if(row.assetSymbol==='USDT')assert.equal(notice,null);else{assert.equal(notice.title,'Added to cash balance');assert.equal(notice.body,'0.95 USD added to your cash balance.')}}
console.log('PASS persisted journal -> Activity -> notification: Cash purpose retained across CCTP/BNB/X Layer/USDT, exact received amounts and silent intermediate deposits')


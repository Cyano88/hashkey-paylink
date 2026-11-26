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
for(const row of response.payments){assert.equal(row.cashFunding,true);const notice=pocketMoneyNotification(row);if(row.assetSymbol==='USDT')assert.equal(notice,null);else{assert.equal(notice.title,'Cash added');assert.equal(notice.body,'$0.95 added to your cash balance.')}}
console.log('PASS persisted journal -> Activity -> notification: Cash purpose retained across CCTP/BNB/X Layer/USDT, exact received amounts and silent intermediate deposits')

import {mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
const native={id:'closed-example',ownerId:'owner',idempotencyKey:'pocket:native-swap:example',action:'wallet.native-swap',status:'not_submitted',createdAt:1,updatedAt:3,metadata:{purpose:'cash',network:'base',walletAddress:'wallet',amount:'0.00031',assetSymbol:'ETH',toAsset:'USDC',approvalOutcome:'expired'}}
records.splice(0,records.length,native)
await handler({method:'GET',query:{}},res)
const terminal=response.payments[0]
assert.equal(terminal.paycrestStatus,'failed')
const pending={...terminal,paycrestStatus:'processing',statusUpdatedAt:2}
const snapshot={payments:[pending],merchants:[],collections:[]}
const fresh={...snapshot,payments:[terminal]}
assert.equal(mergePocketActivitySnapshot(snapshot,fresh).payments[0].paycrestStatus,'failed')
const dismissed={...snapshot,payments:[],dismissedSwapApprovalIds:[pending.eventId]}
assert.equal(mergePocketActivitySnapshot(snapshot,dismissed).payments.length,0)
assert.equal(mergePocketActivitySnapshot({...snapshot,payments:[{...pending,txHash:'observed'}]},dismissed).payments.length,1)
assert.equal(mergePocketActivitySnapshot(snapshot,{...snapshot,payments:[]}).payments.length,1)
console.log('PASS expired cash approval becomes failed, verified dismissal retires stale pending, uncertain and hashed entries survive.')

import assert from 'node:assert/strict'
import {runPocketMoneyPushWorker} from '../api/pocket/money-push-worker.ts'
const now=1_000_000
const quote={currency:'NGN',amount:'1',side:'sell',source:'paycrest',rate:1500,quotedAt:now-1000,expiresAt:now+1000}
for(const [currency,fx,expected] of [
  ['USDC',null,'$0.95'],['NGN',quote,'About ₦1,425'],
  ['UGX',{...quote,currency:'UGX',rate:3700},'3,515'],
  ['NGN',{...quote,expiresAt:now},null],['UGX',quote,null],['NGN',{...quote,stale:true},null],
  ['NGN',new Error('offline'),null],[undefined,null,null]
]){
 const sent=[],owners=[],rates=[]
 const row={source:'wallet-swap',chain:'base',destination:'Cash balance',assetSymbol:'ETH',amount:'0.004',cashFunding:true,destinationAsset:'USDC',receivedAmount:'0.95',eventId:'pocket-native-swap:fixture',txHash:'0x'+'1'.repeat(64),paycrestStatus:'completed',ts:now}
 await runPocketMoneyPushWorker({configured:()=>true,selectOwners:async owners=>owners,listOwners:async()=>['owner'],readActivity:async()=>[],readEventPushes:async()=>[],readDeferred:async()=>[],readWallets:async()=>[],listActions:async()=>[],listRequests:async()=>[],readContext:async()=>[row],saveDeferred:async()=>{},acknowledgeEventPushes:async()=>{},now:()=>now,
 readDisplayCurrency:async id=>{owners.push(id);return currency},readCashRate:async(...args)=>{rates.push(args);if(fx instanceof Error)throw fx;return fx},
 sendPush:async(id,event,payload)=>{sent.push(payload);return true}})
 assert.deepEqual(owners,['owner']);assert.deepEqual(rates,currency==='NGN'||currency==='UGX'?[['1',currency,'USDC']]:[])
 assert.equal(sent.length,1);const notice=sent[0];assert.equal(notice.title,'Cash added');assert.equal(notice.path,'/activity?receipt='+encodeURIComponent(row.eventId));assert.equal('cashCredit' in notice,false)
 if(expected)assert.ok(notice.body.includes(expected),notice.body);else assert.equal(notice.body,'Your cash balance was topped up.')
}
console.log('PASS settled cash credit, owner display preference, USD/NGN/UGX, missing/stale/mismatched rates, no USD fallback, receipt link preserved')

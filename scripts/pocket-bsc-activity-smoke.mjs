import assert from 'node:assert/strict'
import {bscSwapActivity} from '../src/pocket/lib/pocketBscActivity.ts'
import {pocketExchangeNotification} from '../src/pocket/lib/pocketExchangeNotification.ts'
for(const [from,to] of [['BNB','USDC'],['BNB','USDT'],['USDC','BNB'],['USDT','BNB']]){
 const input={id:'fixture',wallet:'0x'+'1'.repeat(40),from,to,amount:'1',amountOut:'0.9',fee:'0.01',txHash:'0x'+'a'.repeat(64),status:'completed',createdAt:1,updatedAt:2}
 const row=bscSwapActivity(input),notice=pocketExchangeNotification(row)
 assert.equal(row.eventId,'pocket-bsc-swap:fixture');assert.equal(row.chain,'bsc');assert.equal(row.feeAsset,from)
 assert.equal(notice.title,'Swap successful');assert.equal(notice.body,`1 ${from} swapped for 0.9 ${to} on BNB Chain.`)
 assert.equal(pocketExchangeNotification(bscSwapActivity({...input,status:'pending'})),null)
 const failed=bscSwapActivity({...input,status:'failed',fee:from==='BNB'?'0.001':'0'})
 assert.equal(failed.contextLabel,`1 ${from} to ${to}`)
 assert.equal(pocketExchangeNotification(failed).title,'Swap failed')
 assert.ok(!pocketExchangeNotification(failed).body.includes('0.9'))
 assert.equal(pocketExchangeNotification(bscSwapActivity({...input,status:'not_submitted',txHash:undefined})),null)
}
console.log('PASS BSC Activity and notification identity: four pairs, correct network/amounts/fees, no quoted output on failure and no pending success notice')
